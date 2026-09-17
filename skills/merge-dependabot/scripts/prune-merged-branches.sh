#!/usr/bin/env bash
# Delete the local branch of every Dependabot PR that is closed on the remote,
# for the merge-dependabot skill. A `dependabot/*` branch whose upstream is
# gone is a merged or closed PR; a parked PR still has its remote branch, so
# its local branch stays.
#
# Prints one line per deleted branch, then `deleted: <count>`.

set -uo pipefail

if ! git fetch --prune --quiet; then
  echo "git fetch --prune failed, so nothing was deleted" >&2
  echo "deleted: 0"
  exit 1
fi

CURRENT="$(git symbolic-ref --quiet --short HEAD)"
DELETED=0

while read -r BRANCH TRACK; do
  [ "$TRACK" = "[gone]" ] || continue
  [ "$BRANCH" != "$CURRENT" ] || continue
  # A squash-merge rewrites the commits, so the branch is not an ancestor of
  # the default branch and `git branch -d` refuses it. The gone upstream is
  # the proof that the PR is closed.
  if git branch -D "$BRANCH" >/dev/null; then
    DELETED=$((DELETED + 1))
    echo "deleted $BRANCH"
  else
    echo "could not delete $BRANCH" >&2
  fi
# `**` and not `*`, because a for-each-ref pattern stops a `*` at a slash and
# a Dependabot branch name has two or more of them.
done < <(git for-each-ref --format='%(refname:short) %(upstream:track)' 'refs/heads/dependabot/**')

echo "deleted: $DELETED"
