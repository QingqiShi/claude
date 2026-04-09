---
name: auto-improve
description: Start an autonomous improvement loop that finds and fixes issues in the current project. Uses an agent team with an explorer that continuously scans the codebase and a planner that triages and prioritizes findings. The lead spawns short-lived executor and evaluator agents per cycle. Use this skill when the user wants to run continuous autonomous improvements, background PR generation, automated code quality sweeps, or hands-free codebase maintenance. Trigger on phrases like "auto improve", "background improvements", "keep finding things to fix", "autonomous PRs", or "improvement loop".
user-invocable: true
---

# Auto-Improve

When invoked, start an autonomous improvement loop using an agent team.

## Context

Project directory: !`pwd`

## Precondition

This skill must be invoked from within a **worktree**. If the working directory is not under `.claude/worktrees/`, stop and tell the user to enter a worktree first (e.g. via EnterWorktree).

## Parse Input

Check the user's prompt for a cycle count (e.g. `/auto-improve 5`, `/auto-improve 3 cycles`). Default to **1** cycle if not specified. This is the maximum number of PRs to raise before stopping.

## Initial Setup

1. Ensure the `auto-improve` label exists: `gh label create auto-improve --description "Automated improvement PR" --color 0E8A16 --force`

## Create Team

Create a team with **two long-lived agents**: Explorer and Planner.

**IMPORTANT: Do NOT read the reference files yourself.** Pass the file paths to the agents and let them read their own instructions. This saves your context window.

### Explorer

Spawn as a team agent with `mode: "auto"`. Use this exact prompt (fill in the variables):

```
Read the file at ${CLAUDE_SKILL_DIR}/references/explorer.md and follow those instructions exactly.

Project directory: <project_dir>

Team name: <team_name>
```

### Planner

Spawn as a team agent with `mode: "auto"`. Use this exact prompt (fill in the variables):

```
Read the file at ${CLAUDE_SKILL_DIR}/references/planner.md and follow those instructions exactly.

Project directory: <project_dir>
Target cycle count: <cycles>

Team name: <team_name>
```

## Your Role as Lead

**You are the monitor and executor-spawner.** After creating the team, your ONLY job is to:
1. Watch for messages from the Planner
2. When the Planner sends `EXECUTE:`, spawn the Executor and Evaluator
3. Report results back to the Planner
4. Track cycle count and stop when done

**Do NOT exit or finish until** the target cycle count is reached or 3 consecutive cycles produce no PR. You must remain active and responsive to team messages throughout the entire run.

**IMPORTANT**: The Explorer needs time to scan the codebase (this can take several minutes). Do NOT treat teammate idle notifications as completion. If the Planner goes idle before sending `EXECUTE:`, message it: `"The Explorer is still scanning. Stay active and wait for findings."` If the Explorer goes idle, message it: `"Continue exploring, the Planner needs more findings."` Only treat the run as complete when you have reached the target cycle count or hit the consecutive empties limit.

## Cycle Loop

After creating the team, enter the cycle loop. Each cycle:

### 1. Monitor for Planner signal

Send a message to the Planner: `"Ready for next improvement. Send EXECUTE: when you have one prioritized."`

Then wait. The Planner will send a message containing `EXECUTE:` followed by the improvement brief. The brief includes: what to change, which files, why it's high value, and the approach.

If the Planner has not responded and appears idle, send another message: `"Status check — do you have improvements ready to execute?"`

### 2. Prepare executor worktree

Once you receive the `EXECUTE:` signal, create a fresh worktree for the executor:

```
git fetch
git worktree add ~/.claude/worktrees/auto-improve-executor-<timestamp> origin/main
```

### 3. Spawn Executor

Spawn a **subagent** (not a team agent) in `mode: "auto"`, **foreground**. Use this prompt template (fill in the variables):

```
Read the file at ${CLAUDE_SKILL_DIR}/references/executor.md and follow those instructions exactly.

Work in this directory: <executor_worktree_path>

The improvement has already been identified and validated. Skip exploration, go straight to implementation.

Improvement brief:
<planner_brief>
```

Wait for the executor to complete. Check for `IMPROVEMENTS_READY` or `NO_IMPROVEMENTS_FOUND` in the result.

### 4. Spawn Evaluator

If the executor signals `IMPROVEMENTS_READY`, spawn a **subagent** (not a team agent) in `mode: "auto"`, **foreground**. Use this prompt template:

```
Read the file at ${CLAUDE_SKILL_DIR}/references/evaluator.md and follow those instructions exactly.

Work in this directory: <executor_worktree_path>

Executor summary:
<executor_summary>
```

Wait for the evaluator to complete. Check for `PR_RAISED` or `CHANGES_REJECTED`.

### 5. Clean up executor worktree

Remove the executor worktree: `git worktree remove --force ~/.claude/worktrees/auto-improve-executor-<timestamp>`

### 6. Handle result

- **`PR_RAISED`**: Reset consecutive empties to 0. Increment PR count. Tell the Planner: `CYCLE_COMPLETE: PR raised. <cycle_count>/<target> cycles done.`
- **`CHANGES_REJECTED`**: Increment consecutive empties. Tell the Planner: `CYCLE_COMPLETE: Changes rejected. Reason: <reason>. Pick a different improvement.`
- **`NO_IMPROVEMENTS_FOUND`** or executor error: Increment consecutive empties. Tell the Planner: `CYCLE_COMPLETE: Executor failed to implement. Pick a different improvement.`

### 7. Check stopping condition

Stop the loop if:
- PR count has reached the target cycle count, OR
- Consecutive empties reaches **3**

If stopping, tell the Planner and Explorer to shut down, clean up the team, and report the final summary to the user.

If continuing, go back to step 1.

## Final Report

After all cycles complete (or early stop), report to the user:
- How many PRs were raised (with URLs)
- How many cycles were rejected or empty
- Total cycles run
