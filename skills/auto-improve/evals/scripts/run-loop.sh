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
# Opus is the faithful-instruction baseline — skill iteration should be measured
# against it. Use --model sonnet for the paraphrase-robustness check.
# Note: $MODEL here is the *subject* model (the skill under test). The LLM
# judge in judge.sh has its own fixed model and is not plumbed from here —
# that keeps judge scores comparable across subject-model changes.
BRANCH="eval/auto-improve-harness"
CYCLES=1
MODEL="opus"
OUTPUT_DIR=""
TIMEOUT=1800  # 30 minutes — one cycle of the 3-agent team can take 15+ min

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
# Fires on normal exit AND on kill signals (INT/TERM/HUP). If the script is
# killed outright (SIGKILL, tmux kill-window with no shutdown chance), the trap
# cannot fire — that's what the orphan sweep below handles on the next run.
CLEANED_UP=0
cleanup() {
  [[ "$CLEANED_UP" == "1" ]] && return
  CLEANED_UP=1
  echo "Cleaning up..."
  if [[ -n "${SESSION_NAME:-}" ]]; then
    $TMUX_BIN kill-session -t "$SESSION_NAME" 2>/dev/null || true
  fi
  if [[ -n "${WORKTREE:-}" && -d "$WORKTREE" ]]; then
    git -C "$REPO_ROOT" worktree remove --force "$WORKTREE" 2>/dev/null || true
  fi
  if [[ -n "${SHIM_DIR:-}" && -d "${SHIM_DIR:-}" ]]; then
    rm -rf "$SHIM_DIR"
  fi
}
trap cleanup EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM
trap 'cleanup; exit 129' HUP

# --- Orphan sweep ---
# Prior runs that were SIGKILLed leave behind tmux sessions and worktrees with
# names like eval-auto-improve-<pid>. A PID whose process is gone is an orphan
# we can safely reap. Skip anything whose PID is still live — that's a parallel
# run, not ours to clean.
sweep_orphans() {
  # tmux sessions
  local sessions
  sessions="$($TMUX_BIN ls -F '#{session_name}' 2>/dev/null | grep '^eval-auto-improve-' || true)"
  for s in $sessions; do
    local pid="${s##eval-auto-improve-}"
    if [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then
      echo "Reaping orphan tmux session: $s"
      $TMUX_BIN kill-session -t "$s" 2>/dev/null || true
    fi
  done

  # worktrees
  local wt
  for wt in "$HOME/.claude/worktrees"/eval-auto-improve-*; do
    [[ -d "$wt" ]] || continue
    local pid="${wt##*eval-auto-improve-}"
    if [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then
      echo "Reaping orphan worktree: $wt"
      git -C "$REPO_ROOT" worktree remove --force "$wt" 2>/dev/null || rm -rf "$wt"
    fi
  done
}
sweep_orphans

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

# --- Install PreToolUse hook into the worktree ---
# PATH shimming alone is unreliable: sub-agent Bash calls don't inherit the
# parent session's shell-snapshot PATH, so they bypass the shims and hit real
# gh/git. A project-level hook runs in the main claude process and sees every
# Bash call from every agent depth, so it's the reliable interception layer.
# The hook rewrites matching commands to prepend `export PATH=<shim>:$PATH`
# inside the command itself, which the real bash subprocess respects regardless
# of how it was spawned.
mkdir -p "$WORKTREE/.claude/hooks"
cp "$SCRIPT_DIR/eval-shim-hook.sh" "$WORKTREE/.claude/hooks/eval-shim-hook.sh"
chmod +x "$WORKTREE/.claude/hooks/eval-shim-hook.sh"

cat > "$WORKTREE/.claude/settings.json" <<SETEOF
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {"type": "command", "command": "$WORKTREE/.claude/hooks/eval-shim-hook.sh"}
        ]
      }
    ]
  }
}
SETEOF

# Sidecar read by the hook (env vars from tmux don't reliably reach sub-agents)
cat > "$WORKTREE/.claude/eval-context.json" <<CTXEOF
{
  "shim_dir": "$SHIM_DIR",
  "output_dir": "$OUTPUT_DIR",
  "pr_state": "$OUTPUT_DIR/pr_state.json",
  "real_git": "$REAL_GIT"
}
CTXEOF

# --- Snapshot skills into worktree at the Claude Code project-local location ---
# Copying into $WORKTREE/.claude/skills/ makes the snapshot discoverable as a
# project-local skill: Claude Code's project-local discovery finds it and
# CLAUDE_SKILL_DIR resolves to this path, taking precedence over the global
# skill at ~/.claude/skills/. That makes the eval hermetic — editing the
# global skill mid-run does not affect an in-flight evaluation.
#
# Previous layout ($WORKTREE/skills/<name>/) was not a discovery location, so
# the copy was inert and the agent silently read from global state.
mkdir -p "$WORKTREE/.claude/skills"
cp -R "$SKILL_DIR" "$WORKTREE/.claude/skills/auto-improve"
cp -R "$REPO_ROOT/skills/raise-pr" "$WORKTREE/.claude/skills/raise-pr"

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

# Set up environment and launch claude.
#
# ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-6[1m] forces the `opus` alias to
# resolve to the 1M-context variant for the parent session AND all spawned
# team/sub-agents. Without this, team agents (Planner/Executor/Evaluator)
# default to the 200K Opus variant even when the parent session is on 1M,
# because Agent Teams don't yet inherit model variant from the lead
# (anthropics/claude-code#32368). The Planner in particular benefits from
# 1M across multi-cycle runs.
$TMUX_BIN send-keys -t "$SESSION_NAME" \
  "export PATH=\"$SHIM_DIR:\$PATH\" REAL_GIT=\"$REAL_GIT\" GH_SHIM_CAPTURE_DIR=\"$OUTPUT_DIR\" GH_SHIM_PR_STATE=\"$OUTPUT_DIR/pr_state.json\" ANTHROPIC_DEFAULT_OPUS_MODEL='claude-opus-4-6[1m]' && echo '[]' > \"$OUTPUT_DIR/pr_state.json\" && cd \"$WORKTREE\" && claude --permission-mode bypassPermissions --model $MODEL" Enter

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
  # Copy all JSONL files (lead + subagent sessions). Sub-agent sessions live
  # under `<session_id>/subagents/*.jsonl`, so we need a recursive copy, not a
  # glob of the top level. Using rsync with the *.jsonl filter preserves the
  # directory structure so compute-usage.py's rglob sees everything.
  mkdir -p "$OUTPUT_DIR/sessions"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --include='*/' --include='*.jsonl' --exclude='*' "$PROJECT_DIR/" "$OUTPUT_DIR/sessions/"
  else
    # Fallback for minimal environments: find+cp preserving the relative tree
    (cd "$PROJECT_DIR" && find . -name '*.jsonl' -print0 | while IFS= read -r -d '' f; do
      mkdir -p "$OUTPUT_DIR/sessions/$(dirname "$f")"
      cp "$f" "$OUTPUT_DIR/sessions/$f"
    done)
  fi

  # Compute usage.json (tokens + cost by model) from the copied session files.
  # aggregate.sh reads usage.json out of OUTPUT_DIR; without this step the
  # cost/token columns stay at $0.
  python3 "$SCRIPT_DIR/compute-usage.py" "$OUTPUT_DIR/sessions" "$OUTPUT_DIR/usage.json" || \
    echo "Warning: compute-usage.py failed"

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

    "$SCRIPT_DIR/judge.sh" "$DETECTED" "$pr_diff" "$OUTPUT_DIR/transcript.txt" "$pr_judge" 2>/dev/null || \
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

# --- Open the HTML report ---
# The report is the canonical human-readable output. Always surface it — agents
# running this script should NOT paraphrase numbers from benchmark.json when
# this file exists; point the user at the report instead.
REPORT="$OUTPUT_DIR/report.html"
if [[ -f "$REPORT" ]]; then
  echo ""
  echo "=== Report ==="
  echo "  $REPORT"
  # Best-effort auto-open on macOS; silently skipped if `open` is unavailable
  # (headless / CI / non-macOS).
  if command -v open >/dev/null 2>&1; then
    open "$REPORT" 2>/dev/null || true
  fi
fi
