#!/usr/bin/env bash
# check_assertions.sh — Deterministic assertion checker for auto-improve evals.
#
# Usage: check_assertions.sh <scenario_id_or_branch> <worktree_dir> <capture_dir> [transcript_file] [changed_files_override]
#
# Reads scenarios.json to look up scenario info, then checks:
#   1. Signal (IMPROVEMENTS_READY / NO_IMPROVEMENTS_FOUND)
#   2. Scenario detection (which scenario's files were changed)
#   3. Changed file check (expected scenario files modified)
#   4. Clean file check (negative controls untouched)
#
# If changed_files_override is provided (path to a file), its contents are used
# instead of inspecting the worktree. This is needed for run-loop.sh where the
# worktree is reset before grading.
#
# Outputs JSON with expectations array, summary, and detected_scenario.

set -euo pipefail

SCENARIO_ARG="$1"
WORKTREE_DIR="$2"
CAPTURE_DIR="$3"
TRANSCRIPT="${4:-}"
CHANGED_FILES_OVERRIDE="${5:-}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCENARIOS_JSON="$SCRIPT_DIR/../scenarios.json"

passed_count=0
failed_count=0
results=()
detected_scenario="none"

# Helper: add assertion result
assert() {
  local name="$1" passed="$2" evidence="$3"
  results+=("{\"text\":\"$name\",\"passed\":$passed,\"evidence\":$(printf '%s' "$evidence" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}")
  if [[ "$passed" == "true" ]]; then
    ((passed_count++)) || true
  else
    ((failed_count++)) || true
  fi
}

# Helper: check if file contains string
file_contains() {
  grep -qF -- "$2" "$1" 2>/dev/null
}

# Helper: run scenario file checks (detection, expected files, clean files)
# Uses $scenario_id, $changed_files, $SCENARIOS_JSON from outer scope.
# Sets detected_scenario in outer scope.
check_scenario_files() {
  if [[ -n "$scenario_id" ]]; then
    detected_scenario="$scenario_id"

    # Single python3 call for all file checks
    local check_result
    check_result="$(python3 -c "
import json
with open('$SCENARIOS_JSON') as f:
    scenarios = json.load(f)
changed = set('''$changed_files'''.strip().split('\n')) if '''$changed_files'''.strip() else set()
for s in scenarios:
    if s['id'] == '$scenario_id':
        matched = sorted(changed & set(s['files']))
        violated = sorted(changed & set(s.get('clean_files', [])))
        print(json.dumps({
            'matched_files': ', '.join(matched) if matched else 'none',
            'expected_changed': bool(matched),
            'clean_violated': 'VIOLATED: ' + ', '.join(violated) if violated else 'CLEAN',
        }))
        break
" 2>/dev/null || echo '{"matched_files":"none","expected_changed":false,"clean_violated":"CLEAN"}')"

    local matched_files expected_changed clean_status
    matched_files="$(echo "$check_result" | python3 -c 'import json,sys; print(json.load(sys.stdin)["matched_files"])')"
    expected_changed="$(echo "$check_result" | python3 -c 'import json,sys; print(str(json.load(sys.stdin)["expected_changed"]).lower())')"
    clean_status="$(echo "$check_result" | python3 -c 'import json,sys; print(json.load(sys.stdin)["clean_violated"])')"

    assert "Scenario detected: $scenario_id" "true" "Matched files: $matched_files"

    if [[ "$expected_changed" == "true" ]]; then
      assert "Changed expected scenario files" "true" "At least one scenario file was modified"
    else
      assert "Changed expected scenario files" "false" "No scenario files were modified"
    fi

    if [[ "$clean_status" == "CLEAN" ]]; then
      assert "No clean files modified" "true" "All negative-control files untouched"
    else
      assert "No clean files modified" "false" "$clean_status"
    fi
  else
    detected_scenario="none"
    assert "Scenario detected: none" "false" "No scenario matched changed files"
  fi
}

# --- Get changed files ---
changed_files=""
if [[ -n "$CHANGED_FILES_OVERRIDE" && -s "$CHANGED_FILES_OVERRIDE" ]]; then
  changed_files="$(cat "$CHANGED_FILES_OVERRIDE")"
else
  if [[ -d "$WORKTREE_DIR/.git" ]] || [[ -f "$WORKTREE_DIR/.git" ]]; then
    changed_files="$(cd "$WORKTREE_DIR" && git diff --name-only 2>/dev/null || true)"
    untracked="$(cd "$WORKTREE_DIR" && git ls-files --others --exclude-standard 2>/dev/null || true)"
    if [[ -n "$untracked" ]]; then
      if [[ -n "$changed_files" ]]; then
        changed_files="$changed_files"$'\n'"$untracked"
      else
        changed_files="$untracked"
      fi
    fi
  fi

  if [[ -n "$changed_files" ]]; then
    echo "$changed_files" > "$CAPTURE_DIR/changed_files.txt"
  else
    touch "$CAPTURE_DIR/changed_files.txt"
  fi
fi

# --- Determine scenario to check ---
scenario_id=""

if [[ "$SCENARIO_ARG" =~ ^eval/auto-improve-scenario/([0-9]+)$ ]]; then
  scenario_num="${BASH_REMATCH[1]}"
  scenario_id="$(python3 -c "
import json
with open('$SCENARIOS_JSON') as f:
    scenarios = json.load(f)
for s in scenarios:
    if s['scenario_number'] == $scenario_num:
        print(s['id'])
        break
" 2>/dev/null || true)"

elif [[ "$SCENARIO_ARG" == "eval/auto-improve-harness" ]]; then
  if [[ -n "$changed_files" ]]; then
    scenario_id="$(python3 -c "
import json
with open('$SCENARIOS_JSON') as f:
    scenarios = json.load(f)
changed = set('''$changed_files'''.strip().split('\n'))
best_id = ''
best_count = 0
for s in scenarios:
    match_count = len(changed & set(s['files']))
    if match_count > best_count:
        best_count = match_count
        best_id = s['id']
if best_id:
    print(best_id)
" 2>/dev/null || true)"
  fi

else
  scenario_id="$SCENARIO_ARG"
fi

# --- Signal check and file assertions ---
has_improvements_ready=false
has_no_improvements=false

if [[ -n "$TRANSCRIPT" ]] && [[ -f "$TRANSCRIPT" ]]; then
  if file_contains "$TRANSCRIPT" "IMPROVEMENTS_READY"; then
    has_improvements_ready=true
  fi
  if file_contains "$TRANSCRIPT" "NO_IMPROVEMENTS_FOUND"; then
    has_no_improvements=true
  fi
fi

if [[ "$has_no_improvements" == "true" ]]; then
  assert "Signal: NO_IMPROVEMENTS_FOUND" "true" "Found NO_IMPROVEMENTS_FOUND in transcript"
  detected_scenario="none"

elif [[ "$has_improvements_ready" == "true" ]]; then
  assert "Signal: IMPROVEMENTS_READY" "true" "Found IMPROVEMENTS_READY in transcript"
  check_scenario_files

else
  if [[ -n "$changed_files" ]]; then
    assert "Signal: IMPROVEMENTS_READY (inferred)" "true" "No signal in transcript but changed files exist"
    check_scenario_files
  else
    assert "Signal: IMPROVEMENTS_READY" "false" "No signal found in transcript"
    assert "Signal: NO_IMPROVEMENTS_FOUND" "false" "No signal found in transcript"
  fi
fi

# --- Output results as JSON ---
total=$((passed_count + failed_count))
pass_rate=$(python3 -c "print(round($passed_count / $total, 2) if $total > 0 else 0)")

echo "{"
echo "  \"expectations\": ["
for i in "${!results[@]}"; do
  if [[ $i -lt $((${#results[@]} - 1)) ]]; then
    echo "    ${results[$i]},"
  else
    echo "    ${results[$i]}"
  fi
done
echo "  ],"
echo "  \"summary\": {"
echo "    \"passed\": $passed_count,"
echo "    \"failed\": $failed_count,"
echo "    \"total\": $total,"
echo "    \"pass_rate\": $pass_rate"
echo "  },"
echo "  \"detected_scenario\": $(printf '%s' "$detected_scenario" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')"
echo "}"
