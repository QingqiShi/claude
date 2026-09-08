#!/usr/bin/env bash
# Detect repository context for the merge-dependabot skill and print it as
# the JSON object the workflow script takes as `args`.
#
# Designed to be called via `!` shell injection from SKILL.md, but also
# safe to run standalone.

set +e

DEFAULT_BRANCH="$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name 2>/dev/null)"
[ -n "$DEFAULT_BRANCH" ] || DEFAULT_BRANCH=unknown

if [ -f pnpm-lock.yaml ]; then
  PM=pnpm
elif [ -f bun.lock ] || [ -f bun.lockb ]; then
  PM=bun
elif [ -f yarn.lock ]; then
  PM=yarn
elif [ -f package-lock.json ]; then
  PM=npm
else
  PM=unknown
fi

PRS="$(gh pr list --author app/dependabot --state open \
  --json number,title,mergeable,headRefName,url \
  --jq '[.[] | {number, title, url, mergeable, headBranch: .headRefName}]' 2>/dev/null)"
[ -n "$PRS" ] || PRS='"error: gh CLI not authenticated or not in a GitHub repo"'

jq -n \
  --arg defaultBranch "$DEFAULT_BRANCH" \
  --arg packageManager "$PM" \
  --argjson prs "$PRS" \
  '{defaultBranch: $defaultBranch, packageManager: $packageManager, prs: $prs}'
