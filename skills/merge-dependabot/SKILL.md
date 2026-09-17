---
name: merge-dependabot
description: Process, review, and merge open Dependabot PRs. Use when the user mentions Dependabot, dependency updates, version bumps, or wants to triage open bot PRs.
user-invocable: true
---

# Merge Dependabot PRs

Process open Dependabot PRs. Merge if safe, skip if uncertain, report at the end.

Release notes are fetched deterministically, up front, before the workflow runs: one fetch per PR gathers that PR's release notes from the source repositories into a file under `/tmp/merge-dependabot`. Then the work runs as a workflow, and one agent owns each PR end to end — it judges how much of the notes the bump warrants reading, rebases, installs, runs the project's checks, picks a verification that fits what the dependency can break, and either merges or parks the PR for the user. Those agents run one PR at a time, because the work tree is shared and every squash-merge moves the default branch. An agent receives the path to its notes file, never the contents, because a group bump's notes can reach hundreds of kilobytes; the workflow is otherwise just that one agent per PR plus the handover at the end. The instructions and output schemas live in `scripts/merge-dependabot.workflow.js`; the prompt an agent receives is complete on its own.

## Repository context

```!
bash "${CLAUDE_SKILL_DIR}/scripts/detect-context.sh"
```

If `packageManager` or `defaultBranch` is `unknown`, or `prs` is an error string, stop and ask the user. If `prs` is empty, exit.

## Fetch release notes

Before calling the Workflow tool, fetch every PR's release notes yourself, in parallel, so the fetch is deterministic and not an agent's job. For each PR number `<n>` in `prs` above, background one call and then wait for all of them:

    mkdir -p /tmp/merge-dependabot
    "${CLAUDE_SKILL_DIR}/scripts/fetch-release-notes.sh" <n> "/tmp/merge-dependabot/notes-pr-<n>.md" &

    wait

Run all of them, one `&` per PR, then a single `wait`. A failed fetch for one PR does not stop or block the others: each is its own background job, and `wait` returns once every job has finished regardless of its exit status. The script's own coverage line on stdout is useful to skim, but the workflow does not depend on it — a missing or empty notes file is a normal outcome that the per-PR agent is told to expect.

## Run

Call the Workflow tool from the repository, not from the skill directory, with `scriptPath` set to `${CLAUDE_SKILL_DIR}/scripts/merge-dependabot.workflow.js` and the context object above as `args`, verbatim. To process a subset, pass only those entries in `prs`. The run is in the background; the completion notification carries the result. If the run dies part-way, relaunch with the same `scriptPath` and `args` plus `resumeFromRunId`, and the finished agents return from cache.

## Report

Print the result's `markdown` field as it is. It is the summary table, with a callout above it for any PR the run parked, in this shape:

```
## Dependabot PR Summary

**You are standing in `<branch>`**, parked at [#NNNN](url) — <what stopped it> The work so far is committed on that branch and unpushed.

| PR | Title | Status |
|----|-------|--------|
| [#NNNN](url) | <title> | Merged |
| [#NNNN](url) | <title> | Skipped — <reason> |
| [#NNNN](url) | <title> | Parked — <what stopped it> |
```

The run always finishes the whole queue before it hands over. One parked PR and it checks that branch out for the user; several and it leaves the work tree on the default branch and the callout lists each parked PR with its checkout command; none and it leaves the tree where the last PR left it.
