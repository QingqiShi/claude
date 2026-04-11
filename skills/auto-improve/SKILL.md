---
name: auto-improve
description: Start an autonomous improvement loop that finds and fixes issues in the current project. Uses a persistent three-agent team — Planner explores the codebase and decides what to fix (spawning ephemeral Explore sub-agents when it wants to offload a batch read), Builder implements fixes, Evaluator reviews and raises PRs. Use this skill when the user wants to run continuous autonomous improvements, background PR generation, automated code quality sweeps, or hands-free codebase maintenance. Trigger on phrases like "auto improve", "background improvements", "keep finding things to fix", "autonomous PRs", or "improvement loop".
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

Use `TeamCreate`, then three `Agent` tool calls that each pass **both** `team_name` and `name` (Planner, Builder, Evaluator). All three are long-lived teammates for the entire run.

Your own communication with teammates is always via `SendMessage`. **Never** spawn a fresh `Agent` call with `subagent_type` or with a null `team_name` to do team-role work (identifying improvements, building, evaluating) yourself — that creates an ephemeral sub-agent, bypasses the team channel, and the team model collapses. You only send to the Planner (identify-improvement signals); the Planner sends directly to the Builder, the Builder to the Evaluator, and the Evaluator back to you with the review result (`PR_RAISED`, `CHANGES_REJECTED`, or `INFRASTRUCTURE_BLOCKED`). Don't intercept or mirror those messages.

Team agents themselves are free to spawn their own ephemeral sub-agents via `Agent` (e.g. `subagent_type: "Explore"` for batch reads) to keep their context lean — that's a different pattern from team-agent `SendMessage` and does not collapse the team.

### Planner
Team agent, `mode: "auto"`:
```
Read the file at ${CLAUDE_SKILL_DIR}/references/planner.md and follow those instructions exactly.
Project directory: <project_dir>
Target cycle count: <cycles>
Team name: <team_name>
```

### Builder
Team agent, `mode: "auto"`:
```
Read the file at ${CLAUDE_SKILL_DIR}/references/builder.md and follow those instructions exactly.
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

Before every cycle (including cycle 1), check whether any open auto-improve PRs need rebasing or CI fixes. This runs before the pre-cycle reset so that maintenance work (which involves checking out PR branches) can happen safely in the shared worktree. The Planner is idle by design during maintenance — it never reads files or explores unless you've explicitly sent it a start-cycle signal for the current cycle, so you don't need to pause it.

1. **List open auto-improve PRs**:
   ```
   gh pr list --label auto-improve --state open --limit 50 \
     --json number,title,mergeable,statusCheckRollup,labels,files,updatedAt,reviewDecision,reviewRequests,headRefName
   ```

2. **Apply guards** — drop any PR that matches any of:
   - Has `ready-for-review` label
   - `reviewDecision == "APPROVED"`
   - `reviewRequests` is non-empty (a reviewer is assigned)
   - `updatedAt` is within the last ~10 minutes (something may be in-progress elsewhere)

3. **Detect duplicates** among remaining PRs. Pairwise compare on touched-file overlap + title/category similarity. If two PRs clearly duplicate each other, close the older/smaller one:
   ```
   gh pr close <older_number> --comment "Superseded by #<kept_number> — auto-improve detected overlap."
   ```
   Do NOT attempt to merge branches together — just close the dup, its content is almost certainly already in the kept PR.

4. **Classify** each remaining non-duplicate:
   - `mergeable: "CONFLICTING"` → needs rebase
   - Any `statusCheckRollup[].conclusion == "FAILURE"` → needs CI fix
   - Otherwise → skip, nothing to do

5. **Cap at 3 maintenance candidates per cycle** (bounded work — don't let maintenance dominate the cycle).

6. **For each candidate**:
   - `gh pr checkout <n>` — check out the PR branch locally
   - Spawn an ephemeral sub-agent via `Agent` (no `team_name`, `mode: "auto"`) with the prompt constructed from `${CLAUDE_SKILL_DIR}/references/pr-maintenance.md`, filling in `<pr_number>`, `<pr_title>`, `<failure_mode>`, `<failure_details>`, `<pr_files>`, `<default_branch>` placeholders
   - Wait for the sub-agent's final-line status: `FIXED`, `IRRECONCILABLE`, `FAILED`, or `BLOCKED`
   - Up to 2 attempts per PR (if the first sub-agent reports `FAILED`, you may spawn a second with the same brief; after the second `FAILED`, move on)
   - On `IRRECONCILABLE`: the sub-agent has already posted a PR comment. Move on.
   - On `BLOCKED`: **stop the run immediately and escalate to the user** — this is an infrastructure failure, not a bad brief

7. **Restore the worktree** to a clean state after all maintenance (or if no maintenance was needed):
   ```
   git fetch origin
   git checkout origin/$DEFAULT_BRANCH
   git status --porcelain
   ```

### Pre-cycle reset

Verify the worktree is clean before proceeding:
```
git status --porcelain
```
The output MUST be empty. If it is not empty, **stop the run and report to the user**. Do not `git clean`, `git reset --hard`, or otherwise mutate unknown state — the user's in-progress work may be in the worktree. The `git fetch` + `git checkout origin/$DEFAULT_BRANCH` that would normally live here is already done at the end of the maintenance step above.

### Send the identify-improvement signal

Send the Planner an identify-improvement signal. It has been idle since the previous cycle ended (or since team creation, for cycle 1) — it will not explore until you signal. The Planner sends its brief **directly to the Builder**, not through you; you don't see the brief and you don't forward anything.

For cycle 1:
```
"Send the next improvement to Builder."
```

For cycle N (N > 1), include the previous cycle's outcome so the Planner can update its skip list:
```
"Previous cycle: <outcome>. Send the next improvement to Builder."
```

Where `<outcome>` is one of:
- `PR raised: <url>` — Planner should add the executed finding to its skip list.
- `Changes rejected: <reason>` — Planner should add the rejected finding to its skip list and pick a different improvement.
- `Execution failed: <reason>` — same as rejected.

### Cycle flow

1. After the identify-improvement signal, wait for the Evaluator's review result (`PR_RAISED`, `CHANGES_REJECTED`, or `INFRASTRUCTURE_BLOCKED`). You are not in the message path between Planner and Builder — the Planner sends the brief directly to the Builder, the Builder implements, the Evaluator reviews, and only then does the result come back to you.
2. Update counters (see "Tracking Cycles" below).
3. Loop back to pre-cycle PR maintenance for the next cycle.

The Evaluator owns PR creation; you do not run `gh pr create` yourself.

**Stay active** until done. A teammate idle notification is NOT completion. After you've sent the Planner its identify-improvement signal, it should be actively exploring or the brief should already be with the Builder — if the whole team reports idle before you receive the review result, nudge whichever agent is stuck: if the Planner hasn't sent, prompt it to keep exploring; if the Builder or Evaluator is stuck, check whether they received the previous message.

### Escalate infrastructure blockers — never route around

If any tool call is blocked, a path is unreachable, a hook rejects work, a team agent can't receive `SendMessage`, or any other unanticipated permission error surfaces, **stop the run immediately**. Don't spawn a replacement sub-agent, invent an alternative flow (e.g. running `gh pr create` yourself instead of via the Evaluator), skip the step, or retry with different args. Report to the user verbatim: what was blocked, which agent, what cycle, and ask how to proceed.

An `IMPLEMENTATION_FAILED` that mentions blocked tool calls, missing paths, or hook rejections is an infrastructure failure, not a bad brief. Same for any `SendMessage` that can't be delivered. This is the single most important rule in this skill.

## Tracking Cycles

When a cycle ends, update your internal counters and remember the outcome — you'll deliver it to the Planner as part of the next cycle's start-cycle signal (see "Start the cycle" above). **Do not message the Planner immediately after a cycle ends** — it's idle waiting for the next signal, and the outcome is part of that signal.

On `PR_RAISED <url>` from the Evaluator:
- Reset consecutive empties to 0, increment PR count.
- Remember outcome: `PR raised: <url>`.

On `CHANGES_REJECTED` from the Evaluator:
- Increment consecutive empties.
- Remember outcome: `Changes rejected: <reason>`.

On non-infrastructure `IMPLEMENTATION_FAILED: <reason>` from the Builder (reason does NOT mention blocked tool calls, missing paths, or hook rejections — e.g. "brief was wrong", "pattern doesn't exist in the code", "files listed don't contain what the Planner claimed"):
- Treat as equivalent to `CHANGES_REJECTED`.
- Increment consecutive empties.
- Remember outcome: `Execution failed: <reason>`.
- Do NOT stop the run — the brief was wrong, the skill is working as intended.

On `INFRASTRUCTURE_BLOCKED` from the Evaluator, or `IMPLEMENTATION_FAILED` from the Builder citing a blocked tool call, missing path, or hook rejection (infra flavor only — disambiguate by message wording, since builder.md requires the Builder to say so explicitly):
- **Stop the run immediately.** This is the escalation case. Shut down the team, report to the user with the specific block reason, and ask how to proceed.

On `STOP: ALL_AREAS_EXHAUSTED` from the Planner:
- Stop the run cleanly. Shut down the team and report summary.

**Stop** when any of:
- PR count = target (unless `infinity`)
- Consecutive empties = 3
- Planner reports `STOP: ALL_AREAS_EXHAUSTED`
- Any infrastructure block (escalation case above)

Shut down team and report summary to user: PRs raised, cycles attempted, reason for stopping.
