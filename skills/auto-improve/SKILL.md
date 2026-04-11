---
name: auto-improve
description: Start an autonomous improvement loop that finds and fixes issues in the current project. Uses a persistent three-agent team — Planner explores the codebase and decides what to fix (spawning ephemeral Explore sub-agents when it wants to offload a batch read), Executor implements fixes, Evaluator reviews and raises PRs. Use this skill when the user wants to run continuous autonomous improvements, background PR generation, automated code quality sweeps, or hands-free codebase maintenance. Trigger on phrases like "auto improve", "background improvements", "keep finding things to fix", "autonomous PRs", or "improvement loop".
user-invocable: true
---

# Auto-Improve

Start an autonomous improvement loop using an agent team.

## Context

Project directory: !`pwd`
Default branch: !`git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||' || echo main`

## Precondition

Must be invoked from within a **worktree** (working directory under `.claude/worktrees/`). If not, tell the user to enter one first.

Everything in this skill happens in the **current worktree**. Do NOT create additional worktrees. Do not cd out of the current directory. All three agents share the same working tree.

**Recommended environment**: the Planner benefits from the 1M-context Opus variant for multi-cycle runs. Due to [anthropics/claude-code#32368](https://github.com/anthropics/claude-code/issues/32368), spawned team agents do not inherit the parent session's model variant — they fall back to the 200K Opus default. To put the whole team on 1M, set `ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-6[1m]` in your shell before launching `claude`. Not required for single-cycle runs; matters more the more cycles you target.

## Parse Input

Check for a cycle count (e.g. `/auto-improve 5`). **Default: 10 cycles**, early-stop on 3 consecutive empties (see stop criteria below). The user may also pass `infinity` to mean "no cap".

## Setup

Ensure the label exists: `gh label create auto-improve --description "Automated improvement PR" --color 0E8A16 --force`

Capture the default branch name into a shell variable you will reuse:
```
DEFAULT_BRANCH=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||' || echo main)
```

## Create Team

Create a team with **three long-lived agents**. **Do NOT read the reference files yourself** — each agent reads its own.

### Critical: all three must be team agents

Use `TeamCreate`, then three `Agent` tool calls that each pass **both** `team_name` and `name` (Planner, Executor, Evaluator). All three are long-lived teammates for the entire run.

When a cycle needs the Executor or Evaluator to act, use `SendMessage` to the existing teammate. **Never** spawn a fresh `Agent` call with `subagent_type` or with a null `team_name` to do Executor/Evaluator work — that creates an ephemeral sub-agent, bypasses the team channel, and the team model collapses.

(The Planner is allowed to spawn ephemeral sub-agents via `Agent` with `subagent_type: "Explore"` and no `team_name` — these are read-only exploration sub-agents used for context-offloaded batch reads, per `references/planner.md`. That's a different pattern from team-agent SendMessage and does not collapse the team.)

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
Default branch: <DEFAULT_BRANCH>
Team name: <team_name>
```

## Your Role

You are the **cycle coordinator, state guard, and PR maintainer**. After creating the team:

### Pre-cycle PR maintenance

Before every cycle (including cycle 1), check whether any open auto-improve PRs need rebasing or CI fixes. This runs before the pre-cycle reset so that maintenance work (which involves checking out PR branches) can happen safely in the shared worktree.

1. **Send PAUSE to the Planner** so it doesn't read the worktree while you're switching branches:
   ```
   "PAUSE: Lead running PR maintenance. Do not read files or spawn Explore sub-agents until RESUME."
   ```

2. **List open auto-improve PRs**:
   ```
   gh pr list --label auto-improve --state open --limit 50 \
     --json number,title,mergeable,statusCheckRollup,labels,files,updatedAt,reviewDecision,reviewRequests,headRefName
   ```

3. **Apply guards** — drop any PR that matches any of:
   - Has `ready-for-review` label
   - `reviewDecision == "APPROVED"`
   - `reviewRequests` is non-empty (a reviewer is assigned)
   - `updatedAt` is within the last ~10 minutes (something may be in-progress elsewhere)

4. **Detect duplicates** among remaining PRs. Pairwise compare on touched-file overlap + title/category similarity. If two PRs clearly duplicate each other, close the older/smaller one:
   ```
   gh pr close <older_number> --comment "Superseded by #<kept_number> — auto-improve detected overlap."
   ```
   Do NOT attempt to merge branches together — just close the dup, its content is almost certainly already in the kept PR.

5. **Classify** each remaining non-duplicate:
   - `mergeable: "CONFLICTING"` → needs rebase
   - Any `statusCheckRollup[].conclusion == "FAILURE"` → needs CI fix
   - Otherwise → skip, nothing to do

6. **Cap at 3 maintenance candidates per cycle** (bounded work — don't let maintenance dominate the cycle).

7. **For each candidate**:
   - `gh pr checkout <n>` — check out the PR branch locally
   - Spawn an ephemeral sub-agent via `Agent` (no `team_name`, `mode: "auto"`) with the prompt constructed from `${CLAUDE_SKILL_DIR}/references/pr-maintenance.md`, filling in `<pr_number>`, `<pr_title>`, `<failure_mode>`, `<failure_details>`, `<pr_files>`, `<default_branch>` placeholders
   - Wait for the sub-agent's final-line status: `FIXED`, `IRRECONCILABLE`, `FAILED`, or `BLOCKED`
   - Up to 2 attempts per PR (if the first sub-agent reports `FAILED`, you may spawn a second with the same brief; after the second `FAILED`, move on)
   - On `IRRECONCILABLE`: the sub-agent has already posted a PR comment. Move on.
   - On `BLOCKED`: **stop the run immediately and escalate to the user** — this is an infrastructure failure, not a bad brief

8. **Restore the worktree** to a clean state after all maintenance (or if no maintenance was needed):
   ```
   git fetch origin
   git checkout origin/$DEFAULT_BRANCH
   git status --porcelain
   ```

9. **Send RESUME to the Planner**:
   ```
   "RESUME: Maintenance finished. You may resume exploration."
   ```

### Pre-cycle reset

After maintenance (and with the Planner now resumed), verify the worktree is clean before proceeding:
```
git status --porcelain
```
The output MUST be empty. If it is not empty, **stop the run and report to the user**. Do not `git clean`, `git reset --hard`, or otherwise mutate unknown state — the user's in-progress work may be in the worktree. The `git fetch` + `git checkout origin/$DEFAULT_BRANCH` that would normally live here is already done at the end of the maintenance step above.

### Cycle flow

1. Wait for `EXECUTE:` from the Planner. The Planner's brief already contains the file paths and approach.
2. Verify the worktree is still clean (`git status --porcelain` empty). If not, abort the cycle and report.
3. Forward the Planner's full EXECUTE brief verbatim to the Executor: `"Implement this improvement. Read the files listed in the brief yourself via sub-agent."` The Executor reads its own files.
4. Wait for `CYCLE_COMPLETE` from the Evaluator. The Evaluator owns PR creation; you do not run `gh pr create` yourself.
5. Loop back to pre-cycle reset for the next cycle.

**Stay active** until done. Teammate idle notifications are NOT completion — the Planner needs time to explore the codebase (it may be running `Glob`/`Grep` directly or waiting on an `Explore` sub-agent to return a batch of findings). If the Planner idles before `EXECUTE:`, message: `"Keep exploring. Read a file, run a grep, or spawn an Explore sub-agent if you don't have a hypothesis yet. Stay active."`

### Escalate infrastructure blockers — do not route around

If an agent reports that it cannot perform its documented role — because a tool call was blocked, a path was unreachable, a sub-agent refused to spawn, or similar — **stop the run immediately and report to the user**. Do NOT:
- Spawn a sub-agent yourself to do the blocked agent's job
- Invent an alternative flow (e.g., running `gh pr create` yourself instead of via the Evaluator)
- Silently skip the affected step
- Retry with a different path or working directory

These count as infrastructure failures, not bad briefs:
- `IMPLEMENTATION_FAILED` that mentions blocked tool calls, missing paths, or hook rejections
- Team agents failing to receive or respond to SendMessage
- Any tool permission error the skill's design did not anticipate

Report to the user verbatim: what was blocked, which agent, what cycle, and ask how to proceed. This is the single most important rule in this skill.

## Tracking Cycles

On `CYCLE_COMPLETE: PR_RAISED <url>` from the Evaluator:
- Reset consecutive empties to 0, increment PR count.
- Message Planner: `"PR raised. <count>/<target> cycles done."`

On `CYCLE_COMPLETE: CHANGES_REJECTED` from the Evaluator:
- Increment consecutive empties.
- Message Planner: `"Changes rejected. Reason: <reason>. Pick a different improvement."`

On `CYCLE_COMPLETE: INFRASTRUCTURE_BLOCKED` from the Evaluator, or `IMPLEMENTATION_FAILED` from the Executor citing a blocked tool call:
- **Stop the run immediately.** This is the escalation case. Shut down the team, report to the user with the specific block reason, and ask how to proceed.

On `STOP: ALL_AREAS_EXHAUSTED` from the Planner:
- Stop the run cleanly. Shut down the team and report summary.

**Stop** when any of:
- PR count = target (unless `infinity`)
- Consecutive empties = 3
- Planner reports `STOP: ALL_AREAS_EXHAUSTED`
- Any infrastructure block (escalation case above)

Shut down team and report summary to user: PRs raised, cycles attempted, reason for stopping.
