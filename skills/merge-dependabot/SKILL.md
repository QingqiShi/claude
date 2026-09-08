---
name: merge-dependabot
description: Process, review, and merge open Dependabot PRs. Use when the user mentions Dependabot, dependency updates, version bumps, or wants to triage open bot PRs.
user-invocable: true
---

# Merge Dependabot PRs

Process open Dependabot PRs. Merge if safe, skip if uncertain, report at the end.

The work runs as a workflow so that judgement and mechanics sit in different agents on different models. Per PR, a read-only scout gathers facts, a decide agent on the session model writes a brief, and an executor on a cheap model carries the brief out and stops at the first thing the brief did not cover. Scouting and deciding run in parallel. Execution runs one PR at a time, because the work tree is shared and every squash-merge moves the default branch. Each role's instructions and output schema live together in `scripts/merge-dependabot.workflow.js`; the prompt an agent receives is complete on its own.

## Repository context

```!
bash "${CLAUDE_SKILL_DIR}/scripts/detect-context.sh"
```

If `packageManager` or `defaultBranch` is `unknown`, or `prs` is an error string, stop and ask the user. If `prs` is empty, exit.

## Run

Call the Workflow tool from the repository, not from the skill directory, with `scriptPath` set to `${CLAUDE_SKILL_DIR}/scripts/merge-dependabot.workflow.js` and the context object above as `args`, verbatim. To process a subset, pass only those entries in `prs`. The run is in the background; the completion notification carries the result. If the run dies part-way, relaunch with the same `scriptPath` and `args` plus `resumeFromRunId`, and the finished agents return from cache.

## Report

Print the result's `markdown` field as it is. It is the summary table, with a needs-attention callout above it when any row needs one, in this shape:

```
## Dependabot PR Summary

**Needs attention:**
- [#NNNN](url) — <what's blocking>

| PR | Title | Status |
|----|-------|--------|
| [#NNNN](url) | <title> | Merged |
| [#NNNN](url) | <title> | Skipped — <reason> |
| [#NNNN](url) | <title> | Needs attention — <what's blocking> |
```
