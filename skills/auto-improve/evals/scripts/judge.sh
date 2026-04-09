#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  echo "Usage: judge.sh <scenario_id> <diff_file> <transcript_file> <output_file> [--model MODEL]"
  echo ""
  echo "Runs an LLM judge to score an auto-improve executor run."
  echo ""
  echo "Arguments:"
  echo "  scenario_id      Scenario ID from scenarios.json (or 'none' if no planted scenario)"
  echo "  diff_file        Path to the diff file from the executor run"
  echo "  transcript_file  Path to the transcript file from the executor run"
  echo "  output_file      Path to write the JSON judge result"
  echo "  --model MODEL    Model to use for judging (default: sonnet)"
  exit 1
}

if [[ $# -lt 4 ]]; then
  usage
fi

SCENARIO_ID="$1"
DIFF_FILE="$2"
TRANSCRIPT_FILE="$3"
OUTPUT_FILE="$4"
MODEL="sonnet"

shift 4
while [[ $# -gt 0 ]]; do
  case "$1" in
    --model)
      MODEL="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      ;;
  esac
done

# --- Read inputs ---

SCENARIOS_FILE="$SCRIPT_DIR/../scenarios.json"
JUDGE_PROMPT_FILE="$SCRIPT_DIR/judge-prompt.md"

if [[ ! -f "$SCENARIOS_FILE" ]]; then
  echo "Error: scenarios.json not found at $SCENARIOS_FILE" >&2
  exit 1
fi

if [[ ! -f "$JUDGE_PROMPT_FILE" ]]; then
  echo "Error: judge-prompt.md not found at $JUDGE_PROMPT_FILE" >&2
  exit 1
fi

if [[ ! -f "$DIFF_FILE" ]]; then
  echo "Error: diff file not found at $DIFF_FILE" >&2
  exit 1
fi

if [[ ! -f "$TRANSCRIPT_FILE" ]]; then
  echo "Error: transcript file not found at $TRANSCRIPT_FILE" >&2
  exit 1
fi

SYSTEM_PROMPT="$(cat "$JUDGE_PROMPT_FILE")"

# Get scenario description
if [[ "$SCENARIO_ID" == "none" || -z "$SCENARIO_ID" ]]; then
  SCENARIO_DESC="No specific scenario was planted. Evaluate whatever the executor found on its own merits -- score based on whether it identified a real, meaningful structural issue and fixed it well."
else
  SCENARIO_DESC="$(jq -r --arg id "$SCENARIO_ID" '.[] | select(.id == $id) | .description' "$SCENARIOS_FILE")"
  if [[ -z "$SCENARIO_DESC" || "$SCENARIO_DESC" == "null" ]]; then
    echo "Error: scenario '$SCENARIO_ID' not found in scenarios.json" >&2
    exit 1
  fi
fi

DIFF_CONTENT="$(cat "$DIFF_FILE")"
TRANSCRIPT_CONTENT="$(cat "$TRANSCRIPT_FILE")"

# Truncate transcript to last 5000 chars if very long
TRANSCRIPT_LEN="${#TRANSCRIPT_CONTENT}"
if [[ "$TRANSCRIPT_LEN" -gt 5000 ]]; then
  TRANSCRIPT_CONTENT="[... truncated, showing last 5000 chars ...]
${TRANSCRIPT_CONTENT: -5000}"
fi

# --- Build user prompt ---

USER_PROMPT="## Scenario

${SCENARIO_DESC}

## Diff

\`\`\`diff
${DIFF_CONTENT}
\`\`\`

## Executor Transcript

\`\`\`
${TRANSCRIPT_CONTENT}
\`\`\`

Score this executor run. Output ONLY the JSON object as specified."

# --- Run the judge ---

RAW_OUTPUT="$(echo "$USER_PROMPT" | claude -p \
  --system-prompt "$SYSTEM_PROMPT" \
  --model "$MODEL" \
  --max-turns 1)"

# --- Extract JSON from output ---
# Handle potential markdown code blocks around the JSON
JSON_OUTPUT="$(echo "$RAW_OUTPUT" | sed -n '/^{/,/^}/p')"

# If sed didn't find bare JSON lines, try stripping markdown fences
if [[ -z "$JSON_OUTPUT" ]]; then
  JSON_OUTPUT="$(echo "$RAW_OUTPUT" | sed 's/^```json//; s/^```//' | sed -n '/^{/,/^}/p')"
fi

# Final fallback: try to extract JSON object with jq from the raw output
if [[ -z "$JSON_OUTPUT" ]]; then
  JSON_OUTPUT="$(echo "$RAW_OUTPUT" | jq -r 'if type == "object" then . else empty end' 2>/dev/null || true)"
fi

if [[ -z "$JSON_OUTPUT" ]]; then
  echo "Error: could not extract JSON from judge output" >&2
  echo "Raw output:" >&2
  echo "$RAW_OUTPUT" >&2
  exit 1
fi

# Validate JSON structure
if ! echo "$JSON_OUTPUT" | jq -e '.score and .summary and .feedback' > /dev/null 2>&1; then
  echo "Error: judge output missing required fields (score, summary, feedback)" >&2
  echo "Extracted JSON:" >&2
  echo "$JSON_OUTPUT" >&2
  exit 1
fi

# Write result
echo "$JSON_OUTPUT" | jq '.' > "$OUTPUT_FILE"

SCORE="$(echo "$JSON_OUTPUT" | jq -r '.score')"
echo "Judge score: $SCORE/5"
echo "Result written to $OUTPUT_FILE"
