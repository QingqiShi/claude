#!/usr/bin/env bash
# git-shim — intercepts git commands that interact with the remote.
# Local operations (status, diff, log, commit, checkout, etc.) pass through.
#
# Shimmed commands:
#   git fetch  → no-op (origin/main is pre-set to the harness commit)
#   git push   → no-op (prevent pushing to real remote)
#   git pull   → no-op (prevent fetch+merge from real remote)

case "${1:-}" in
  fetch|push|pull)
    exit 0
    ;;
esac

real_git="${REAL_GIT:-}"
if [[ -z "$real_git" || ! -x "$real_git" ]]; then
  shim_dir="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"
  real_git="$(which -a git 2>/dev/null | grep -vF "$shim_dir" | head -1 || true)"
fi
if [[ -z "$real_git" || ! -x "$real_git" ]]; then
  for candidate in /opt/homebrew/bin/git /usr/bin/git /usr/local/bin/git; do
    [[ -x "$candidate" ]] && real_git="$candidate" && break
  done
fi

if [[ -n "$real_git" && -x "$real_git" ]]; then
  exec "$real_git" "$@"
fi

echo "git-shim: cannot find real git" >&2
exit 1
