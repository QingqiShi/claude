---
name: merge-dependabot
description: Process, review, and merge open Dependabot PRs. Use when the user mentions Dependabot, dependency updates, version bumps, or wants to triage open bot PRs.
user-invocable: true
---

# Merge Dependabot PRs

Process open Dependabot PRs one at a time. Merge if safe, skip if uncertain, report at the end.

## Repository context

```!
bash "${CLAUDE_SKILL_DIR}/scripts/detect-context.sh"
```

Use these values wherever `<placeholder>` appears below. If `package-manager` or `default-branch` is `unknown`, or the PR list errored, stop and ask the user.

## Phase 1 — Discover

If there are no open Dependabot PRs, exit.

## Phase 2 — For each PR

The work tree is shared, so PRs must run **serially**. Each PR is otherwise independent — delegate the per-PR work to a fresh `general-purpose` sub-agent so its install logs, rebase output, and browser transcripts don't bloat this main context.

For each open PR, the orchestrator (main thread):

1. Resets the work tree to a known-clean state on the default branch:
   ```bash
   git fetch origin <default-branch> && git checkout origin/<default-branch>
   ```
2. Spawns a `general-purpose` sub-agent with this exact prompt — substitute the four values from the detected context and the current PR, but otherwise pass it verbatim and add nothing else:

   > You are a sub-agent in a larger orchestration that I am coordinating. Your only task is to process Dependabot PR #`<number>` by reading and following the instructions in `${CLAUDE_SKILL_DIR}/references/process-pr.md`.
   >
   > Use these values throughout that file:
   >
   > - PR number: `<number>`
   > - Head branch: `<head-branch>`
   > - Default branch: `<default-branch>`
   > - Package manager: `<package-manager>`
   >
   > Read **only** that instructions file. Do not read SKILL.md or browse other files in the skill directory — the instructions file is self-contained for this task. When done, report back briefly: whether the PR was merged, skipped (and why), or stopped pending human attention (and what's blocking).

3. When the sub-agent finishes, note its outcome — merged, skipped with reason, or stopped pending human attention — along with the PR's title and URL from the detected context, for the Phase 3 report.
4. Moves to the next PR.

## Phase 3 — Report

Produce a markdown table with one row per PR processed: a clickable link (`[#NNNN](url)`), the PR's title, and the final status. Status is one of `Merged`, `Skipped — <reason>`, or `Needs attention — <what's blocking>`. If any rows need attention, surface them as bullets above the table so they aren't missed.

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

Omit the **Needs attention** callout entirely if no rows need it.
