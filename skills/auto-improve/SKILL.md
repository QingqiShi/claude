---
name: auto-improve
description: Start an autonomous improvement loop that finds and fixes issues in the current project. Uses an agent team with an explorer that continuously scans the codebase and a planner that triages and prioritizes findings. The lead spawns short-lived executor and evaluator agents per cycle. Use this skill when the user wants to run continuous autonomous improvements, background PR generation, automated code quality sweeps, or hands-free codebase maintenance. Trigger on phrases like "auto improve", "background improvements", "keep finding things to fix", "autonomous PRs", or "improvement loop".
user-invocable: true
---

# Auto-Improve

Start an autonomous improvement loop using an agent team.

## Context

Project directory: !`pwd`

## Precondition

Must be invoked from within a **worktree** (working directory under `.claude/worktrees/`). If not, tell the user to enter one first.

## Parse Input

Check for a cycle count (e.g. `/auto-improve 5`). Default: **1** cycle.

## Setup

Ensure the label exists: `gh label create auto-improve --description "Automated improvement PR" --color 0E8A16 --force`

## Create Team

Create a team with **four agents**. **Do NOT read the reference files yourself.**

### Explorer
Team agent, `mode: "auto"`:
```
Read the file at ${CLAUDE_SKILL_DIR}/references/explorer.md and follow those instructions exactly.
Project directory: <project_dir>
Team name: <team_name>
```

### Planner
Team agent, `mode: "auto"`:
```
Read the file at ${CLAUDE_SKILL_DIR}/references/planner.md and follow those instructions exactly.
Project directory: <project_dir>
Target cycle count: <cycles>
Team name: <team_name>
```

### Executor
Team agent, `mode: "auto"`:
```
Read the file at ${CLAUDE_SKILL_DIR}/references/executor.md and follow those instructions exactly.
Project directory: <project_dir>
Team name: <team_name>
```

### Evaluator
Team agent, `mode: "auto"`:
```
Read the file at ${CLAUDE_SKILL_DIR}/references/evaluator.md and follow those instructions exactly.
Project directory: <project_dir>
Team name: <team_name>
```

## Your Role

You are the **worktree manager and cycle tracker**. After creating the team:

1. Wait for `EXECUTE:` from the Planner
2. Create an executor worktree: `git fetch && git worktree add ~/.claude/worktrees/auto-improve-executor-<timestamp> origin/main`
3. Message the Explorer: `"Send code context for [improvement] to the Executor. Worktree path: <path>"`
4. Message the Executor: `"Implement the improvement in <worktree_path>. The Explorer will send you the code context."`
5. Wait for `CYCLE_COMPLETE` from the Evaluator
6. Clean up: `git worktree remove --force <worktree_path>`
7. Track result and check stopping condition

**Stay active** until done. Teammate idle notifications are NOT completion — the Explorer needs time to scan. If the Planner idles before `EXECUTE:`, message: `"The Explorer is still scanning. Stay active."` If the Explorer idles, message: `"Continue exploring."`

## Tracking Cycles

On `CYCLE_COMPLETE: PR_RAISED`:
- Reset consecutive empties to 0, increment PR count
- Message Planner: `"PR raised. <count>/<target> cycles done."`

On `CYCLE_COMPLETE: CHANGES_REJECTED`:
- Increment consecutive empties
- Message Planner: `"Changes rejected. Reason: <reason>. Pick a different improvement."`

**Stop** when PR count = target OR consecutive empties = 3. Shut down team and report summary to user.
