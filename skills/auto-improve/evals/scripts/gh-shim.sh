#!/usr/bin/env bash
# gh shim — intercepts gh commands during auto-improve eval runs.
# Captures `gh pr create` arguments, stubs out other commands.
#
# Env vars:
#   GH_SHIM_CAPTURE_DIR  — where to write captured args (default: .)
#   GH_SHIM_PR_STATE     — path to a JSON file tracking raised PRs across cycles.
#                           If set, `gh pr create` appends to it and `gh pr list` reads from it.
#                           If unset, `gh pr list` returns [].
#   REAL_GIT             — path to real git binary (bypasses discovery logic).

set -euo pipefail

CAPTURE_DIR="${GH_SHIM_CAPTURE_DIR:-.}"
PR_STATE="${GH_SHIM_PR_STATE:-}"

if [[ "${1:-}" == "pr" && "${2:-}" == "create" ]]; then
  shift 2  # consume "pr create"

  title=""
  body=""
  base=""
  labels=()
  extra_args=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --title)  title="$2";  shift 2 ;;
      --body)   body="$2";   shift 2 ;;
      --base)   base="$2";   shift 2 ;;
      --label)  labels+=("$2"); shift 2 ;;
      *)        extra_args+=("$1"); shift ;;
    esac
  done

  # Determine PR number
  pr_number=42
  if [[ -n "$PR_STATE" && -f "$PR_STATE" ]]; then
    pr_number=$(python3 -c "
import json
with open('$PR_STATE') as f:
    prs = json.load(f)
print(len(prs) + 1)
" 2>/dev/null || echo "42")
  fi

  # Write captured data as JSON (using python3 for safe encoding)
  cat > "$CAPTURE_DIR/gh_pr_create_args.json" <<JSONEOF
{
  "number": $pr_number,
  "title": $(printf '%s' "$title" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "body": $(printf '%s' "$body" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "base": $(printf '%s' "$base" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "labels": $(printf '%s' "$(IFS=,; echo "${labels[*]:-}")" | python3 -c 'import json,sys; vals=sys.stdin.read().strip(); print(json.dumps(vals.split(",") if vals else []))'),
  "extra_args": $(printf '%s' "${extra_args[*]:-}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().split()))')
}
JSONEOF

  # Append to stateful PR list if tracking is enabled
  if [[ -n "$PR_STATE" ]]; then
    python3 -c "
import json, sys
state_file = '$PR_STATE'
try:
    with open(state_file) as f:
        prs = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    prs = []
prs.append({
    'number': $pr_number,
    'title': $(printf '%s' "$title" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
    'state': 'OPEN',
    'labels': [{'name': l} for l in $(printf '%s' "$(IFS=,; echo "${labels[*]:-}")" | python3 -c 'import json,sys; vals=sys.stdin.read().strip(); print(json.dumps(vals.split(",") if vals else []))')],
})
with open(state_file, 'w') as f:
    json.dump(prs, f, indent=2)
"
  fi

  # Capture the diff at PR creation time.
  # Use REAL_GIT env var if set, otherwise discover real git binary.
  real_git="${REAL_GIT:-}"
  if [[ -z "$real_git" || ! -x "$real_git" ]]; then
    # Discovery fallback: resolve dirname of this script to filter shim dir
    shim_dir="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"
    real_git="$(which -a git 2>/dev/null | grep -vF "$shim_dir" | head -1 || true)"
  fi
  if [[ -z "$real_git" || ! -x "$real_git" ]]; then
    for candidate in /opt/homebrew/bin/git /usr/bin/git /usr/local/bin/git; do
      [[ -x "$candidate" ]] && real_git="$candidate" && break
    done
  fi

  diff_file="$CAPTURE_DIR/diff-${pr_number}.patch"
  changed_file="$CAPTURE_DIR/changed_files-${pr_number}.txt"

  if [[ -n "$real_git" && -x "$real_git" ]]; then
    # Try merge-base against origin/main, fall back to HEAD~1
    merge_base="$("$real_git" merge-base HEAD refs/remotes/origin/main 2>/dev/null || echo "")"
    if [[ -n "$merge_base" ]]; then
      "$real_git" diff "$merge_base" HEAD > "$diff_file" 2>/dev/null || true
      "$real_git" diff --name-only "$merge_base" HEAD > "$changed_file" 2>/dev/null || true
    else
      "$real_git" diff HEAD~1 HEAD > "$diff_file" 2>/dev/null || true
      "$real_git" diff --name-only HEAD~1 HEAD > "$changed_file" 2>/dev/null || true
    fi
  fi

  # Also write to diff.patch / changed_files.txt for backwards compat (single-PR runs)
  [[ -s "$diff_file" ]] && cp "$diff_file" "$CAPTURE_DIR/diff.patch"
  [[ -s "$changed_file" ]] && cp "$changed_file" "$CAPTURE_DIR/changed_files.txt"

  # Touch marker file for completion detection
  touch "$CAPTURE_DIR/pr-raised-$pr_number"

  # Return fake PR URL
  echo "https://github.com/test-org/test-repo/pull/$pr_number"
  exit 0
fi

if [[ "${1:-}" == "pr" && "${2:-}" == "list" ]]; then
  # If stateful PR tracking is enabled, return tracked PRs
  if [[ -n "$PR_STATE" && -f "$PR_STATE" ]]; then
    cat "$PR_STATE"
  else
    echo "[]"
  fi
  exit 0
fi

if [[ "${1:-}" == "label" && "${2:-}" == "create" ]]; then
  exit 0
fi

if [[ "${1:-}" == "pr" && "${2:-}" == "edit" ]]; then
  exit 0
fi

# For any other gh command, pass through to real gh (if available)
real_gh="$(which -a gh 2>/dev/null | grep -v "$0" | head -1 || true)"
if [[ -n "$real_gh" ]]; then
  exec "$real_gh" "$@"
else
  echo "gh shim: unhandled command: gh $*" >&2
  exit 1
fi
