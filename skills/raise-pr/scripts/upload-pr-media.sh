#!/usr/bin/env bash
# Upload PR screenshots to an orphan `pr-assets` branch and print their raw URLs.
#
#   upload-pr-media.sh <slug> <file>...
#
# <slug> namespaces the upload (use the PR branch name). Exits 3 on a private
# repo — raw.githubusercontent.com 404s for GitHub's image proxy there, so the
# images would render broken. Callers treat 3 as "skip media", not an error.
set -euo pipefail

BRANCH="pr-assets"
MAX_BYTES=$((10 * 1024 * 1024))

[ $# -ge 2 ] || { echo "usage: $0 <slug> <file>..." >&2; exit 2; }
slug=$1; shift

read -r nwo private < <(gh repo view --json nameWithOwner,isPrivate \
  --jq '[.nameWithOwner, (.isPrivate|tostring)] | @tsv')
[ "$private" = "false" ] || exit 3

# Orphan branch: no parents, so it never merges into main and carries no history.
if ! gh api "/repos/$nwo/git/ref/heads/$BRANCH" >/dev/null 2>&1; then
  blob=$(gh api "/repos/$nwo/git/blobs" --jq .sha \
    -f encoding=utf-8 -f content='Screenshots referenced by pull request descriptions.')
  tree=$(jq -n --arg s "$blob" \
    '{tree:[{path:"README.md", mode:"100644", type:"blob", sha:$s}]}' \
    | gh api "/repos/$nwo/git/trees" --input - --jq .sha)
  commit=$(jq -n --arg t "$tree" \
    '{message:"chore: init pr-assets branch", tree:$t, parents:[]}' \
    | gh api "/repos/$nwo/git/commits" --input - --jq .sha)
  jq -n --arg r "refs/heads/$BRANCH" --arg s "$commit" '{ref:$r, sha:$s}' \
    | gh api "/repos/$nwo/git/refs" --input - >/dev/null
fi

for f in "$@"; do
  [ -f "$f" ] || { echo "no such file: $f" >&2; exit 1; }
  bytes=$(wc -c <"$f" | tr -d ' ')
  [ "$bytes" -le "$MAX_BYTES" ] || { echo "too large (${bytes}B): $f" >&2; exit 1; }

  path="$slug/$(basename "$f")"
  # Re-runs must pass the existing blob sha or the API rejects the overwrite.
  sha=$(gh api "/repos/$nwo/contents/$path?ref=$BRANCH" --jq .sha 2>/dev/null || true)

  jq -n --arg m "add $path" --arg b "$BRANCH" \
        --arg c "$(base64 <"$f" | tr -d '\n')" --arg s "$sha" \
        '{message:$m, branch:$b, content:$c} + (if $s == "" then {} else {sha:$s} end)' \
    | gh api -X PUT "/repos/$nwo/contents/$path" --input - >/dev/null

  echo "https://raw.githubusercontent.com/$nwo/$BRANCH/$path"
done
