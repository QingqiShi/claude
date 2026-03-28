---
name: auto-improve
description: Start an autonomous improvement loop that finds and fixes issues in the current project. Each cycle has three phases — a maintainer agent keeps existing PRs healthy, an executor agent finds one improvement, and an evaluator agent reviews it before raising a PR. Cycles run with a 20-minute gap between them. Use this skill when the user wants to run continuous autonomous improvements, background PR generation, automated code quality sweeps, or hands-free codebase maintenance. Trigger on phrases like "auto improve", "background improvements", "keep finding things to fix", "autonomous PRs", or "improvement loop".
user-invocable: true
---

# Auto-Improve Loop

When invoked, start a recurring loop that autonomously improves the current project. Each cycle runs three subagents sequentially: maintainer → executor → evaluator. Cycles are separated by a 20-minute gap.

## Context

Project directory: !`pwd`

## Precondition

This skill must be invoked from within a **worktree**. If the working directory is not under `.claude/worktrees/`, stop and tell the user to enter a worktree first (e.g. via EnterWorktree).

## Initial Setup

Before starting the loop:

1. Ensure the `auto-improve` label exists on the repo: `gh label create auto-improve --description "Automated improvement PR" --color 0E8A16 --force` (idempotent — safe to run if it already exists).

Then run the first cycle immediately.

## Cycle

Each cycle runs these steps in order:

### 1. Fetch latest

`git fetch && git checkout origin/main` to put the worktree on a detached HEAD at the latest main. If fetch fails, stop and tell the user.

### 2. Maintainer (conditional)

Run `gh pr list --label auto-improve --state open --json number` to check for open auto-improve PRs. If there are none, skip to step 3.

Otherwise, spawn the maintainer agent: `subagent_type: "auto-improve-maintainer"`, `mode: "auto"`, **foreground** (must complete before the executor starts). Pass the project directory in the prompt.

If the maintainer fails, log the error but continue to step 3.

### 3. Executor

Spawn the executor agent: `subagent_type: "auto-improve-executor"`, `mode: "auto"`, `run_in_background: true`, `description: "auto-improve-executor"`.

### 4. Handle executor result

When the executor completes:

- **`NO_IMPROVEMENTS_FOUND`** in the result → increment the consecutive empties counter. Skip to step 7.
- **`IMPROVEMENTS_READY`** in the result → continue to step 5. Save the executor's summary text (everything before the `IMPROVEMENTS_READY` signal) for the evaluator.
- **Neither signal present** (agent crashed or returned unexpected output) → do NOT increment consecutive empties. Log the error and skip to step 7.

### 5. Evaluator

Spawn the evaluator agent: `subagent_type: "auto-improve-evaluator"`, `mode: "auto"`, `run_in_background: true`, `description: "auto-improve-evaluator"`. Pass the executor's summary in the prompt.

### 6. Handle evaluator result

When the evaluator completes:

- **`PR_RAISED`** in the result → reset consecutive empties counter to 0.
- **`CHANGES_REJECTED`** in the result → increment consecutive empties counter.
- **Neither signal present** (agent crashed or returned unexpected output) → do NOT increment consecutive empties. Log the error and continue to step 7.

### 7. Reset worktree

Run `git checkout origin/main` to discard any uncommitted changes and return to detached HEAD. This ensures a clean slate for the next cycle.

### 8. Check stopping condition

If the consecutive empties counter reaches **3**, stop the loop and tell the user: "Three consecutive cycles found no improvements or had changes rejected — stopping the loop."

### 9. Schedule next cycle

Calculate the time 20 minutes from now. Run `date "+%M %H %d %m"` to get the current time, add 20 minutes (handling hour/day rollover), and create a one-shot cron job:

Use CronCreate with `recurring: false` and a pinned cron expression for the calculated time. The prompt should instruct the orchestrator to run a full cycle (steps 1-9) using the same project directory.

## After First Cycle

Tell the user what's been set up:
- The first cycle has run (share the result — PR raised, rejected, or no improvements)
- Next cycle is scheduled for ~20 minutes from now
- Each cycle: maintainer checks existing PRs → executor finds an improvement → evaluator reviews and raises a PR
- The loop stops after 3 consecutive empty/rejected cycles
- They can stop it with Ctrl+C or by asking to cancel the scheduled job
