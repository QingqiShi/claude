#!/usr/bin/env bash
# Detect repository context for the merge-dependabot skill.
#
# Prints the default branch, package manager, and the open Dependabot PR
# list. The model derives everything else (install commands, lockfile
# path, scripts, CI health) on demand.
#
# Designed to be called via `!` shell injection from SKILL.md, but also
# safe to run standalone for agent systems that don't support dynamic
# context injection — they can shell out to this script and feed its
# stdout to the model.

set +e

echo "default-branch: $(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name 2>/dev/null || echo unknown)"

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
echo "package-manager: $PM"

echo "open-dependabot-prs:"
gh pr list --author "app/dependabot" --state open --json number,title,mergeable,headRefName,url \
  --jq '.[] | "  #\(.number) [\(.mergeable)] \(.headRefName) — \(.title) — \(.url)"' 2>/dev/null \
  || echo "  (gh CLI not authenticated or not in a GitHub repo)"
