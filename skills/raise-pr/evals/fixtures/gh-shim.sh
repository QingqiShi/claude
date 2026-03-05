#!/usr/bin/env bash
# gh shim — captures `gh pr create` arguments instead of calling real gh.
# Place this on PATH before real gh so the eval agent thinks it succeeded.
#
# Writes captured args to $GH_SHIM_CAPTURE_DIR/gh_pr_create_args.json
# Returns a fake PR URL on stdout.

set -euo pipefail

CAPTURE_DIR="${GH_SHIM_CAPTURE_DIR:-.}"

if [[ "${1:-}" == "pr" && "${2:-}" == "create" ]]; then
  shift 2  # consume "pr create"

  title=""
  body=""
  base=""
  extra_args=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --title)  title="$2";  shift 2 ;;
      --body)   body="$2";   shift 2 ;;
      --base)   base="$2";   shift 2 ;;
      *)        extra_args+=("$1"); shift ;;
    esac
  done

  # Write captured data as JSON
  cat > "$CAPTURE_DIR/gh_pr_create_args.json" <<JSONEOF
{
  "title": $(printf '%s' "$title" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "body": $(printf '%s' "$body" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "base": $(printf '%s' "$base" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "extra_args": $(printf '%s' "${extra_args[*]:-}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().split()))')
}
JSONEOF

  # Return fake PR URL
  echo "https://github.com/test-org/test-repo/pull/42"
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
