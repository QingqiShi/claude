#!/usr/bin/env bash
# run-single.sh — Run one eval cycle of the auto-improve executor.
#
# Usage:
#   run-single.sh [--branch BRANCH] [--model MODEL] [--output-dir DIR]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$HOME/.claude"

# --- Defaults ---
BRANCH="eval/auto-improve-harness"
MODEL="sonnet"
OUTPUT_DIR=""

# --- Parse arguments ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)   BRANCH="$2";     shift 2 ;;
    --model)    MODEL="$2";      shift 2 ;;
    --output-dir) OUTPUT_DIR="$2"; shift 2 ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: run-single.sh [--branch BRANCH] [--model MODEL] [--output-dir DIR]" >&2
      exit 1
      ;;
  esac
done

# --- Output directory ---
if [[ -z "$OUTPUT_DIR" ]]; then
  TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
  OUTPUT_DIR="$SCRIPT_DIR/../results/${TIMESTAMP}-$$"
fi
mkdir -p "$OUTPUT_DIR"

# --- Worktree path ---
WORKTREE="$HOME/.claude/worktrees/eval-auto-improve-$$"

# --- Cleanup trap ---
cleanup() {
  echo "Cleaning up..."
  if [[ -d "$WORKTREE" ]]; then
    git -C "$REPO_ROOT" worktree remove --force "$WORKTREE" 2>/dev/null || true
  fi
  if [[ -n "${TEMP_BIN_DIR:-}" && -d "${TEMP_BIN_DIR:-}" ]]; then
    rm -rf "$TEMP_BIN_DIR"
  fi
}
trap cleanup EXIT

# --- Step 2: Fetch branch ---
echo "Fetching branch: $BRANCH"
git -C "$REPO_ROOT" fetch origin "$BRANCH"

# --- Step 3: Create worktree ---
echo "Creating worktree at: $WORKTREE"
git -C "$REPO_ROOT" worktree add "$WORKTREE" "origin/$BRANCH"

# --- Step 4: Set up gh-shim ---
TEMP_BIN_DIR="$(mktemp -d)"
export REAL_GIT="$(command -v git)"
cp "$SCRIPT_DIR/gh-shim.sh" "$TEMP_BIN_DIR/gh"
chmod +x "$TEMP_BIN_DIR/gh"
export GH_SHIM_CAPTURE_DIR="$OUTPUT_DIR"
export PATH="$TEMP_BIN_DIR:$PATH"

# --- Step 5: Run the executor ---
echo "Running executor (model: $MODEL)..."
EXECUTOR_INSTRUCTIONS="$(cat "$SCRIPT_DIR/../../references/executor.md")"

CLAUDE_OUTPUT="$(
  cd "$WORKTREE" && \
  claude -p "$(printf '%s\n\nFind one high-value improvement in this codebase. Follow the instructions above.' "$EXECUTOR_INSTRUCTIONS")" \
    --allowedTools "Read,Glob,Grep,Bash,Write,Edit" \
    --model "$MODEL" \
    --permission-mode bypassPermissions \
    --output-format json \
    --max-turns 50 \
    2>&1
)"

# --- Step 6: Capture outputs ---
echo "Capturing outputs..."

# Extract transcript text and usage stats from JSON output
echo "$CLAUDE_OUTPUT" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    print(data.get("result", ""))
except (json.JSONDecodeError, KeyError):
    print(sys.stdin.read() if hasattr(sys.stdin, "read") else "")
' > "$OUTPUT_DIR/transcript.txt"

echo "$CLAUDE_OUTPUT" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    usage = data.get("usage", {})
    stats = {
        "input_tokens": usage.get("input_tokens", 0) + usage.get("cache_read_input_tokens", 0) + usage.get("cache_creation_input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
        "total_cost_usd": data.get("total_cost_usd", 0),
        "duration_ms": data.get("duration_ms", 0),
        "num_turns": data.get("num_turns", 0),
    }
    json.dump(stats, sys.stdout, indent=2)
except (json.JSONDecodeError, KeyError):
    json.dump({}, sys.stdout)
' > "$OUTPUT_DIR/usage.json"

# Capture diff
git -C "$WORKTREE" diff > "$OUTPUT_DIR/diff.patch"

# Capture changed files
git -C "$WORKTREE" diff --name-only > "$OUTPUT_DIR/changed_files.txt"

# --- Step 7: Run grading ---
echo "Running assertion checks..."
"$SCRIPT_DIR/check_assertions.sh" "$BRANCH" "$WORKTREE" "$OUTPUT_DIR" "$OUTPUT_DIR/transcript.txt" > "$OUTPUT_DIR/grading.json"

# --- Step 8: Run LLM judge ---
echo "Running LLM judge..."
DETECTED_SCENARIO="$(python3 -c '
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
print(data.get("detected_scenario", "none"))
' "$OUTPUT_DIR/grading.json")"

"$SCRIPT_DIR/judge.sh" "$DETECTED_SCENARIO" "$OUTPUT_DIR/diff.patch" "$OUTPUT_DIR/transcript.txt" "$OUTPUT_DIR/judge.json" --model "$MODEL"

# --- Step 10: Print summary ---
echo ""
echo "=== Eval Complete ==="
echo "Scenario detected: $DETECTED_SCENARIO"

JUDGE_SCORE="$(python3 -c '
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
print(data.get("score", "N/A"))
' "$OUTPUT_DIR/judge.json" 2>/dev/null || echo "N/A")"

echo "Judge score: $JUDGE_SCORE"
echo "Output directory: $OUTPUT_DIR"
