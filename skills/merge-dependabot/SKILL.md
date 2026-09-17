---
name: merge-dependabot
description: Process, review, and merge open Dependabot PRs. Use when the user mentions Dependabot, dependency updates, version bumps, or wants to triage open bot PRs.
user-invocable: true
---

# Merge Dependabot PRs

Process open Dependabot PRs. Merge if safe, skip if uncertain, report at the end.

Release notes are fetched deterministically, up front, before the workflow runs: one fetch per PR gathers that PR's release notes from the source repositories into a file in this session's scratchpad. Then the work runs as a workflow, and one agent owns each PR end to end — it judges how much of the notes the bump warrants reading, rebases, installs, runs the project's checks, picks a verification that fits what the dependency can break, and either merges or parks the PR for the user. Those agents run one PR at a time, because the work tree is shared and every squash-merge moves the default branch. An agent receives the path to its notes file, never the contents, because a group bump's notes can reach hundreds of kilobytes; the workflow is otherwise just that one agent per PR plus the handover at the end. The instructions and output schemas live in `scripts/merge-dependabot.workflow.js`; the prompt an agent receives is complete on its own. The verification guides under `references/verification/` are for those agents, one file per dependency, and each agent opens only the one that matches its bump — you do not read them.

## Repository context

```!
bash "${CLAUDE_SKILL_DIR}/scripts/detect-context.sh"
```

If `packageManager` or `defaultBranch` is `unknown`, or `prs` is an error string, stop and ask the user. If `prs` is empty, exit.

## Fetch release notes

Before calling the Workflow tool, fetch every PR's release notes yourself, in parallel, so the fetch is deterministic and not an agent's job.

Put the notes in a `merge-dependabot` directory under the scratchpad directory your system prompt names, so they land outside the repository; if your session names no scratchpad, make one with `mktemp -d`. That directory is `<notesDir>` here and in `args` below.

For each PR number `<n>` in `prs` above, background one call and then wait for all of them:

    mkdir -p <notesDir>
    "${CLAUDE_SKILL_DIR}/scripts/fetch-release-notes.sh" <n> "<notesDir>/notes-pr-<n>.md" &

    wait

Run all of them, one `&` per PR, then a single `wait`. A failed fetch for one PR does not stop or block the others: each is its own background job, and `wait` returns once every job has finished regardless of its exit status.

Every line the script prints starts with its PR number, because the jobs interleave; a line that says `WARNING` means that PR's notes file is known to be incomplete. Skim them, then start the workflow whatever they say — the per-PR agent takes the list of bumps from the diff and gathers what its notes file lacks.

## Run

Call the Workflow tool from the repository, not from the skill directory, with `scriptPath` set to `${CLAUDE_SKILL_DIR}/scripts/merge-dependabot.workflow.js` and, as `args`, the context object above verbatim plus `notesDir`, the directory you fetched the notes into. To process a subset, pass only those entries in `prs`. The run is in the background; the completion notification carries the result. If the run dies part-way, relaunch with the same `scriptPath` and `args` plus `resumeFromRunId`, and the finished agents return from cache.

## Report

Print the result's `markdown` field as it is. It is the summary table, with a callout above it for any PR the run parked, in this shape:

```
## Dependabot PR Summary

**You are standing in `<branch>`**, parked at [#NNNN](url) — <what stopped it> The work so far is committed on that branch and unpushed.

> <the agent's `detail`: where it got to, which routes it tried, what it takes to finish>

| PR | Title | Status |
|----|-------|--------|
| [#NNNN](url) | <title> | Merged |
| [#NNNN](url) | <title> | Skipped — <reason> |
| [#NNNN](url) | <title> | Parked |

Deleted 3 local `dependabot/*` branches whose upstream is gone.
```

A parked PR carries its reason and its `detail` in the callout, so the table cell only says `Parked`. A skipped PR gets no callout, so its reason stays in the cell.

The run always finishes the whole queue before it hands over. One parked PR and it checks that branch out for the user; several and it leaves the work tree on a detached HEAD at `origin/<defaultBranch>` and gives each parked PR its own bullet, with its `detail` and its checkout command; none and it leaves the tree where the last PR left it. Nothing restores the branch the session started on, so the several-parks callout names it.

The handover also deletes the local `dependabot/*` branches whose remote branch is gone — what a merged PR leaves behind — and the closing line says how many, because nothing else tells the user they are gone.
