#!/usr/bin/env bash
# run-eval.sh — Orchestrate auto-improve eval runs.
#
# Modes:
#   Combined:       run-eval.sh [--runs N] [--model MODEL] [--output-dir DIR]
#   Targeted:       run-eval.sh --scenario N [--runs N] [--model MODEL] [--output-dir DIR]
#   Full matrix:    run-eval.sh --all-scenarios [--runs N] [--model MODEL] [--output-dir DIR]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Defaults ---
RUNS=1
MODEL="sonnet"
OUTPUT_DIR=""
SCENARIO=""
ALL_SCENARIOS=false

# --- Parse arguments ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --runs)           RUNS="$2";       shift 2 ;;
    --model)          MODEL="$2";      shift 2 ;;
    --output-dir)     OUTPUT_DIR="$2"; shift 2 ;;
    --scenario)       SCENARIO="$2";   shift 2 ;;
    --all-scenarios)  ALL_SCENARIOS=true; shift ;;
    -h|--help)
      echo "Usage: run-eval.sh [--runs N] [--model MODEL] [--output-dir DIR]"
      echo "       run-eval.sh --scenario N [--runs N] [--model MODEL] [--output-dir DIR]"
      echo "       run-eval.sh --all-scenarios [--runs N] [--model MODEL] [--output-dir DIR]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# --- Output directory ---
if [[ -z "$OUTPUT_DIR" ]]; then
  OUTPUT_DIR="$HOME/.claude/skills/auto-improve/evals/results/eval-$(date +%Y%m%d-%H%M%S)"
fi
mkdir -p "$OUTPUT_DIR"

START_TIME="$(date +%s)"

echo "=== Auto-Improve Eval ==="
echo "Model: $MODEL"
echo "Runs per target: $RUNS"
echo "Output: $OUTPUT_DIR"
echo ""

# --- Helper: run N times against a branch, placing results in a parent dir ---
run_batch() {
  local branch="$1"
  local parent_dir="$2"

  for i in $(seq 1 "$RUNS"); do
    local run_dir="$parent_dir/run-$i"
    mkdir -p "$run_dir"
    echo "--- Run $i/$RUNS against $branch ---"
    "$SCRIPT_DIR/run-single.sh" \
      --branch "$branch" \
      --model "$MODEL" \
      --output-dir "$run_dir"
    echo ""
  done
}

# --- Execute based on mode ---
if [[ "$ALL_SCENARIOS" == "true" ]]; then
  echo "Mode: full matrix (scenarios 1-5, $RUNS runs each)"
  echo ""
  for s in 1 2 3 4 5; do
    echo "=== Scenario $s ==="
    run_batch "eval/auto-improve-scenario/$s" "$OUTPUT_DIR/scenario-$s"
  done

elif [[ -n "$SCENARIO" ]]; then
  echo "Mode: targeted (scenario $SCENARIO, $RUNS runs)"
  echo ""
  run_batch "eval/auto-improve-scenario/$SCENARIO" "$OUTPUT_DIR"

else
  echo "Mode: combined (harness branch, $RUNS runs)"
  echo ""
  run_batch "eval/auto-improve-harness" "$OUTPUT_DIR"
fi

# --- Aggregate results ---
echo "=== Aggregating results ==="
"$SCRIPT_DIR/aggregate.sh" "$OUTPUT_DIR"

# --- Print elapsed time ---
END_TIME="$(date +%s)"
ELAPSED=$(( END_TIME - START_TIME ))
MINUTES=$(( ELAPSED / 60 ))
SECONDS_REM=$(( ELAPSED % 60 ))
echo ""
echo "Total time elapsed: ${MINUTES}m ${SECONDS_REM}s"
