---
name: auto-improve
description: An agent loop workflow that auto improves a repository.
user-invocable: true
disable-model-invocation: true
---

# Auto-Improve

Autonomous improvement loop. Three long-lived agents — Planner, Builder, Evaluator — plus you, the cycle coordinator.

## Context

Project directory: !`pwd`
Default branch: !`git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||' || echo main`

## Precondition

Must run inside a worktree (working directory under `.claude/worktrees/`). If not, tell the user to enter one first.

Everything happens in the current worktree — all three agents share it. No cd, no new worktrees.

## Parse input

The argument (if any) is free-form natural language, not a flag. Read it, extract whatever's there:

- _"focus on the auth module"_ → pass as a Focus hint to the Planner.
- _"5 cycles"_, _"just do 3"_, _"run 20 times"_ → cycle target.
- _"keep going until you run out of ideas"_, _"no cap"_, _"infinity"_ → uncapped; relies on the Planner's `ALL_AREAS_EXHAUSTED` to stop.
- _"maintenance only"_, _"0"_, _"don't raise new PRs, just clean up what's there"_ → maintenance-only mode.
- Combinations are fine: _"5 cycles focused on the API layer"_.
- Nothing at all → defaults.

**Defaults**: 10 cycles, early-stop on 3 consecutive empties.

**Maintenance-only mode**: skip team creation and cycles, run pre-cycle PR maintenance once, exit. Used by the hourly scheduled follow-up (see the last section).

If the argument is ambiguous, go with your best interpretation and mention it in your opening update. Don't interrupt the user to clarify.

## Setup

Make sure the label exists:

```
gh label create auto-improve --description "Automated improvement PR" --color 0E8A16 --force
```

Capture the default branch name:

```
DEFAULT_BRANCH=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||' || echo main)
```

## Create the team

Three long-lived agents. **Don't read their reference files yourself** — each agent reads its own. Don't override teammate models.

**Critical: all three are team agents.** Use `TeamCreate`, then three `Agent` calls each passing both `team_name` and `name` (Planner, Builder, Evaluator). The only `SendMessage` you send goes to the Planner (identify-improvement signals). The Planner sends briefs directly to the Builder; the Builder sends summaries to the Evaluator; the Evaluator reports results back to you. Don't intercept, don't mirror.

**Never** spawn a fresh `Agent` call with `subagent_type` or `team_name: null` to do team-role work yourself — that creates an ephemeral sub-agent, bypasses the team channel, and the team model collapses. Team agents spawning their own ephemeral sub-agents for batch reads (e.g. `Explore`) is a different pattern and is fine.

### Planner

Team agent, `mode: "auto"`:

```
Read the file at ${CLAUDE_SKILL_DIR}/references/planner.md and follow those instructions exactly.
Project directory: <project_dir>
Target cycle count: <cycles>
Team name: <team_name>
Focus hint (optional): <focus_hint_or_empty>
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

## Your role

You're the cycle coordinator, state guard, and PR maintainer.

### Pre-cycle PR maintenance

Before every cycle (cycle 1 included), check whether open auto-improve PRs need rebases, CI fixes, or comment responses. This runs **before** the pre-cycle reset — maintenance checks out PR branches, which has to happen on a clean tree. The Planner is idle during maintenance by design; you don't need to pause it.

**1. List open PRs:**

```
gh pr list --label auto-improve --state open --limit 50 \
  --json number,title,mergeable,statusCheckRollup,labels,files,updatedAt,reviewDecision,reviewRequests,headRefName,comments
```

**2. Skip any PR that:** has the `ready-for-review` label, is APPROVED, has a reviewer assigned, or was touched in the last ~10 minutes (something else may be working on it).

**3. Close duplicates.** Pairwise compare on touched-file overlap + title/category similarity. If two clearly overlap, close the older/smaller:

```
gh pr close <older> --comment "Superseded by #<kept> — auto-improve detected overlap."
```

Don't try to merge branches together.

**4. Classify** each non-duplicate. A PR can have multiple classifications — process them in this order, one sub-agent per failure mode:

- `mergeable: "CONFLICTING"` → `CONFLICTING`
- Any `statusCheckRollup[].conclusion == "FAILURE"` → `CI_FAILING`
- Any comment authored by the user running the skill (the authenticated `gh` user, from `gh api user --jq .login`) that lacks the marker `<!-- auto-improve-response -->` → `COMMENT_UNADDRESSED`
- Otherwise → skip.

Detecting unaddressed comments: only the authenticated `gh` user's own comments count. Skip everything else (third-party bots like vercel, claude, dependabot, and any other collaborator) — editing another author's comment is blocked as impersonation. Our own bot pushes under that same identity, so within those comments the `<!-- auto-improve-response -->` marker distinguishes processed from unprocessed. Fetch review comments with `gh api repos/{owner}/{repo}/pulls/{pr}/comments`; PR-level comments are already in the list result.

**5. Cap at 3 maintenance candidates per cycle** — don't let maintenance eat the whole cycle. A PR with two failure modes counts as two.

**6. For each candidate:**

- `gh pr checkout <n>` (skip if already on that branch).
- Spawn an ephemeral sub-agent (`Agent`, no `team_name`, `mode: "auto"`) with a prompt built from `${CLAUDE_SKILL_DIR}/references/pr-maintenance.md`, filling in `<pr_number>`, `<pr_title>`, `<failure_mode>`, `<failure_details>`, `<pr_files>`, `<default_branch>`. For `COMMENT_UNADDRESSED`, `<failure_details>` must include the comment ID, body verbatim, and REST API URL so the sub-agent can PATCH it.
- Wait for the final-line status: `FIXED`, `IRRECONCILABLE`, `FAILED`, or `BLOCKED`.
- Up to 2 attempts per PR (one retry after `FAILED`; after the second, move on).
- `IRRECONCILABLE`: the sub-agent already commented on the PR; move on.
- `BLOCKED`: **stop the run and escalate to the user.** This is infrastructure, not a bad brief.

**7. Restore the worktree** once maintenance is done (or if nothing needed doing):

```
git fetch origin
git checkout origin/$DEFAULT_BRANCH
git status --porcelain
```

### Pre-cycle reset

`git status --porcelain` must be empty. If it's not, **stop and report to the user** — don't `git clean`, `git reset --hard`, or otherwise touch unknown state. The user may have in-progress work. The fetch + checkout that would normally live here already ran at the end of maintenance.

### Identify-improvement signal

The Planner stays idle until you signal. It sends briefs directly to the Builder — not through you. You don't see the brief; you don't forward anything.

Cycle 1:

```
"Send the next improvement to Builder."
```

Cycle N (N > 1), carry the previous outcome so the Planner can update its skip list:

```
"Previous cycle: <outcome>. Send the next improvement to Builder."
```

Where `<outcome>` is one of:

- `PR raised: <url>`
- `Changes rejected: <reason>`
- `Execution failed: <reason>`

### Cycle flow

After sending the signal, wait for the Evaluator's result: `PR_RAISED`, `CHANGES_REJECTED`, or `INFRASTRUCTURE_BLOCKED`. Update counters. Loop back to pre-cycle maintenance.

The Evaluator owns PR creation. Don't run `gh pr create` yourself.

**Stay active.** A teammate idle notification is not completion. After you've sent the signal, the Planner should be exploring or the brief should already be with the Builder. If the whole team reports idle before you see a result, nudge whoever's stuck.

### Infrastructure blockers — never route around

If a tool call is blocked, a path is unreachable, a hook rejects work, or a `SendMessage` can't deliver — **stop the run immediately and escalate to the user.** Don't spawn a replacement sub-agent, don't invent an alternative flow (e.g. running `gh pr create` yourself instead of via the Evaluator), don't skip the step, don't retry with different args. Report verbatim what was blocked, which agent, which cycle.

An `IMPLEMENTATION_FAILED` that mentions blocked tool calls, missing paths, or hook rejections is infrastructure, not a bad brief. Same for any `SendMessage` that won't deliver. This is the single most important rule in this skill.

## Tracking cycles

When a cycle ends, remember the outcome — you'll deliver it to the Planner as part of the next cycle's signal. **Don't message the Planner between cycles** — it's idle, the outcome rides with the next signal.

- `PR_RAISED <url>` → reset consecutive empties to 0, bump PR count. Outcome: `PR raised: <url>`.
- `CHANGES_REJECTED` → bump consecutive empties. Outcome: `Changes rejected: <reason>`.
- Non-infrastructure `IMPLEMENTATION_FAILED` from the Builder (wording does **not** mention blocked tools, missing paths, or hook rejections — things like "brief was wrong" or "pattern not in the code") → treat as `CHANGES_REJECTED`, outcome `Execution failed: <reason>`. **Don't stop the run** — the brief was wrong, the skill is working as intended.
- `INFRASTRUCTURE_BLOCKED` from the Evaluator, or `IMPLEMENTATION_FAILED` from the Builder citing blocked tools/paths/hooks (infra flavor — disambiguate by wording, since builder.md requires explicit mention) → **stop the run immediately.** Shut down the team, report the block to the user, ask how to proceed.
- `STOP: ALL_AREAS_EXHAUSTED` from the Planner → stop cleanly, shut down the team, report summary.

**Stop** when any of:

- PR count hits target (unless uncapped)
- Consecutive empties hits 3
- Planner says `STOP: ALL_AREAS_EXHAUSTED`
- Any infrastructure block

Then shut down the team and report the summary: PRs raised, cycles attempted, reason for stopping.

## Schedule follow-up maintenance

After the run ends normally (target hit, empties exhausted, or `ALL_AREAS_EXHAUSTED`) and you raised at least one PR, schedule an hourly maintenance-only pass. That way review comments, rebases, and CI fixes get picked up without the user re-running the skill. Skip on infrastructure blocks — those need user attention first.

Do this autonomously. The whole point of auto-improve is walk-away operation; asking for confirmation here defeats it. The scheduled task is maintenance-only, bounded, idempotent.

1. Check what scheduling tools you have (`CronCreate`, the `schedule` skill, the `loop` skill, anything that runs on a cron). If nothing's available, tell the user in the summary: "No scheduling tool available — run `/auto-improve maintenance only` anytime to process follow-up comments and rebases."

2. Check whether a maintenance cron for this project already exists (`CronList` or the equivalent). If so, don't duplicate it; mention the existing one in the summary.

3. Create the cron: hourly (`0 * * * *` or equivalent), runs `/auto-improve maintenance only` in this same worktree, named something like `auto-improve-maintenance-<project-basename>` so the user can find and delete it later. Include the name and cancel command in the summary.

If the current invocation is already in maintenance-only mode (i.e. this is a scheduled run, not a full run), skip all of this. A scheduled run doesn't re-schedule itself.
