#!/usr/bin/env bash
# run-loop.sh — Run the full auto-improve skill in interactive mode via tmux.
#
# Launches claude in a tmux session so agent teams work properly.
# Uses shims for git (no-ops fetch/push/pull) and gh (captures PR creation).
# Detects completion by watching for marker files touched by the gh-shim.
#
# Usage:
#   run-loop.sh [--branch BRANCH] [--cycles N] [--model MODEL] [--output-dir DIR] [--timeout SECS]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$SCRIPT_DIR/../.."
REPO_ROOT="$HOME/.claude"
TMUX_BIN="$(command -v tmux || echo /opt/homebrew/bin/tmux)"

# --- Defaults ---
BRANCH="eval/auto-improve-harness"
CYCLES=1
MODEL="sonnet"
OUTPUT_DIR=""
TIMEOUT=600  # 10 minutes default

# --- Parse arguments ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)     BRANCH="$2";     shift 2 ;;
    --cycles)     CYCLES="$2";     shift 2 ;;
    --model)      MODEL="$2";      shift 2 ;;
    --output-dir) OUTPUT_DIR="$2"; shift 2 ;;
    --timeout)    TIMEOUT="$2";    shift 2 ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# --- Output directory ---
if [[ -z "$OUTPUT_DIR" ]]; then
  TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
  OUTPUT_DIR="$SCRIPT_DIR/../results/loop-${TIMESTAMP}"
fi
mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd)"  # absolute path

# --- Worktree ---
WORKTREE="$HOME/.claude/worktrees/eval-auto-improve-$$"
SESSION_NAME="eval-auto-improve-$$"

# --- Cleanup trap ---
cleanup() {
  echo "Cleaning up..."
  $TMUX_BIN kill-session -t "$SESSION_NAME" 2>/dev/null || true
  if [[ -d "$WORKTREE" ]]; then
    git -C "$REPO_ROOT" worktree remove --force "$WORKTREE" 2>/dev/null || true
  fi
  if [[ -n "${SHIM_DIR:-}" && -d "${SHIM_DIR:-}" ]]; then
    rm -rf "$SHIM_DIR"
  fi
}
trap cleanup EXIT

# --- Create worktree ---
echo "Fetching branch: $BRANCH"
git -C "$REPO_ROOT" fetch origin "$BRANCH"

echo "Creating worktree at: $WORKTREE"
git -C "$REPO_ROOT" worktree add "$WORKTREE" "origin/$BRANCH"
ORIGINAL_COMMIT="$(git -C "$WORKTREE" rev-parse HEAD)"

# --- Set origin/main to the harness commit ---
git -C "$WORKTREE" update-ref refs/remotes/origin/main "$ORIGINAL_COMMIT"

# --- Set up shims ---
SHIM_DIR="$(mktemp -d)"

# Resolve real git BEFORE adding shims to PATH, so gh-shim can find it
REAL_GIT="$(command -v git)"

cp "$SCRIPT_DIR/git-shim.sh" "$SHIM_DIR/git"
chmod +x "$SHIM_DIR/git"

cp "$SCRIPT_DIR/gh-shim.sh" "$SHIM_DIR/gh"
chmod +x "$SHIM_DIR/gh"

# --- Copy skills into worktree (gitignored on harness branches) ---
mkdir -p "$WORKTREE/skills"
cp -R "$SKILL_DIR" "$WORKTREE/skills/auto-improve"
cp -R "$REPO_ROOT/skills/raise-pr" "$WORKTREE/skills/raise-pr"

# --- Launch claude in tmux ---
echo ""
echo "=== Auto-Improve Eval (tmux) ==="
echo "Branch: $BRANCH"
echo "Cycles: $CYCLES"
echo "Model: $MODEL"
echo "Timeout: ${TIMEOUT}s"
echo "Output: $OUTPUT_DIR"
echo ""

$TMUX_BIN kill-session -t "$SESSION_NAME" 2>/dev/null || true
$TMUX_BIN new-session -d -s "$SESSION_NAME" -x 200 -y 50
$TMUX_BIN set-option -t "$SESSION_NAME" history-limit 50000

# Set up environment and launch claude
$TMUX_BIN send-keys -t "$SESSION_NAME" \
  "export PATH=\"$SHIM_DIR:\$PATH\" REAL_GIT=\"$REAL_GIT\" GH_SHIM_CAPTURE_DIR=\"$OUTPUT_DIR\" GH_SHIM_PR_STATE=\"$OUTPUT_DIR/pr_state.json\" && echo '[]' > \"$OUTPUT_DIR/pr_state.json\" && cd \"$WORKTREE\" && claude --permission-mode bypassPermissions --model $MODEL" Enter

# Wait for claude to start
echo "Waiting for claude to start..."
sleep 5

# Send the auto-improve prompt
echo "Sending /auto-improve $CYCLES"
$TMUX_BIN send-keys -t "$SESSION_NAME" "/auto-improve $CYCLES" Enter

# --- Poll for completion ---
START_TIME=$(date +%s)
PR_COUNT=0

echo "Polling for PR markers (target: $CYCLES, timeout: ${TIMEOUT}s)..."
while true; do
  sleep 5

  # Count PR marker files
  PR_COUNT=$(find "$OUTPUT_DIR" -maxdepth 1 -name 'pr-raised-*' 2>/dev/null | wc -l | tr -d ' ')

  ELAPSED=$(( $(date +%s) - START_TIME ))
  echo "  ${ELAPSED}s elapsed, ${PR_COUNT}/${CYCLES} PRs raised"

  # Check completion
  if [[ "$PR_COUNT" -ge "$CYCLES" ]]; then
    echo "Target PR count reached."
    break
  fi

  # Check timeout
  if [[ "$ELAPSED" -ge "$TIMEOUT" ]]; then
    echo "Timeout reached."
    break
  fi
done

# --- Shut down claude ---
echo "Shutting down claude..."
$TMUX_BIN send-keys -t "$SESSION_NAME" "/exit" Enter
sleep 3
$TMUX_BIN kill-session -t "$SESSION_NAME" 2>/dev/null || true

# --- Capture transcript from Claude Code's JSONL session files ---
echo "Capturing transcript..."

# The worktree PID is embedded in the path; Claude Code's project dir slug
# replaces / and . with - (e.g. /.claude/ -> --claude-)
WORKTREE_SLUG="$(echo "$WORKTREE" | sed 's|[/.]|-|g; s|^-||')"
PROJECT_DIR="$HOME/.claude/projects/-${WORKTREE_SLUG}"

if [[ -d "$PROJECT_DIR" ]]; then
  # Copy all JSONL files (lead + subagent sessions)
  mkdir -p "$OUTPUT_DIR/sessions"
  cp "$PROJECT_DIR"/*.jsonl "$OUTPUT_DIR/sessions/" 2>/dev/null || true

  # Extract assistant text and user messages from all sessions into a single transcript
  python3 - "$PROJECT_DIR" "$OUTPUT_DIR/transcript.txt" <<'PYEOF'
import json, sys, glob, os

project_dir = sys.argv[1]
output_file = sys.argv[2]

lines = []
for jsonl_path in sorted(glob.glob(os.path.join(project_dir, "*.jsonl"))):
    session_id = os.path.basename(jsonl_path).replace(".jsonl", "")
    lines.append(f"=== Session: {session_id} ===\n")
    with open(jsonl_path) as f:
        for raw_line in f:
            raw_line = raw_line.strip()
            if not raw_line:
                continue
            try:
                entry = json.loads(raw_line)
            except json.JSONDecodeError:
                continue
            message = entry.get("message", {})
            role = message.get("role", "")

            if role == "assistant":
                for block in message.get("content", []):
                    if isinstance(block, dict) and block.get("type") == "text":
                        lines.append(block["text"] + "\n")
                    elif isinstance(block, dict) and block.get("type") == "tool_use":
                        lines.append(f"[tool_use: {block.get('name', '?')}]\n")
            elif role == "user":
                content = message.get("content", "")
                if isinstance(content, str) and len(content) < 2000:
                    lines.append(f"[user] {content}\n")
    lines.append("\n")

with open(output_file, "w") as f:
    f.writelines(lines)
print(f"Wrote {len(lines)} lines to {output_file}")
PYEOF
else
  echo "Warning: project dir not found at $PROJECT_DIR"
  touch "$OUTPUT_DIR/transcript.txt"
fi

# --- Grade each PR ---
echo "=== Grading ==="

EMPTY_GRADING='{"expectations":[],"summary":{"passed":0,"failed":0,"total":0,"pass_rate":0},"detected_scenario":"none"}'
EMPTY_JUDGE='{"score":null,"summary":"No diff captured","feedback":""}'
GRADED_ANY=false

for marker in "$OUTPUT_DIR"/pr-raised-*; do
  [[ -f "$marker" ]] || continue
  pr_num=$(basename "$marker" | sed 's/pr-raised-//')
  echo "  Grading PR #$pr_num..."

  pr_diff="$OUTPUT_DIR/diff-${pr_num}.patch"
  pr_changed="$OUTPUT_DIR/changed_files-${pr_num}.txt"
  pr_grading="$OUTPUT_DIR/grading-${pr_num}.json"
  pr_judge="$OUTPUT_DIR/judge-${pr_num}.json"

  if [[ -s "$pr_diff" ]]; then
    "$SCRIPT_DIR/check_assertions.sh" "$BRANCH" "$WORKTREE" "$OUTPUT_DIR" "$OUTPUT_DIR/transcript.txt" "$pr_changed" > "$pr_grading" 2>/dev/null || \
      echo "$EMPTY_GRADING" > "$pr_grading"

    DETECTED="$(python3 -c 'import json; print(json.load(open("'"$pr_grading"'")).get("detected_scenario","none"))' 2>/dev/null || echo "none")"

    "$SCRIPT_DIR/judge.sh" "$DETECTED" "$pr_diff" "$OUTPUT_DIR/transcript.txt" "$pr_judge" --model "$MODEL" 2>/dev/null || \
      echo '{"score":null,"summary":"Judge failed","feedback":""}' > "$pr_judge"

    GRADED_ANY=true
  else
    echo "    No diff captured for PR #$pr_num"
    echo "$EMPTY_GRADING" > "$pr_grading"
    echo "$EMPTY_JUDGE" > "$pr_judge"
  fi

  # Copy first PR's results as the default grading/judge files (for aggregate.sh compat)
  if [[ ! -f "$OUTPUT_DIR/grading.json" ]]; then
    cp "$pr_grading" "$OUTPUT_DIR/grading.json"
    cp "$pr_judge" "$OUTPUT_DIR/judge.json"
    [[ -s "$pr_diff" ]] && cp "$pr_diff" "$OUTPUT_DIR/diff.patch"
    [[ -s "$pr_changed" ]] && cp "$pr_changed" "$OUTPUT_DIR/changed_files.txt"
  fi
done

if [[ "$GRADED_ANY" != "true" ]]; then
  echo "  No PRs to grade."
  echo "$EMPTY_GRADING" > "$OUTPUT_DIR/grading.json"
  echo "$EMPTY_JUDGE" > "$OUTPUT_DIR/judge.json"
fi

# --- Aggregate ---
echo "=== Aggregating ==="
"$SCRIPT_DIR/aggregate.sh" "$OUTPUT_DIR"

END_TIME=$(date +%s)
ELAPSED=$(( END_TIME - START_TIME ))
printf "\nTotal time elapsed: %dm %ds\n" $((ELAPSED / 60)) $((ELAPSED % 60))

echo ""
echo "=== PRs Raised ==="
export OUTPUT_DIR
python3 << 'PYEOF'
import json, os
state_file = os.path.join(os.environ.get("OUTPUT_DIR", "."), "pr_state.json")
try:
    with open(state_file) as f:
        prs = json.load(f)
    if not prs:
        print("  None")
    else:
        for pr in prs:
            print(f"  #{pr['number']}: {pr['title']}")
except:
    print("  None")
PYEOF
