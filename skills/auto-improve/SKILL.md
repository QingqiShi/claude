---
name: auto-improve
description: An agent loop workflow that auto improves a repository.
user-invocable: true
disable-model-invocation: true
---

# Auto-Improve

Autonomous improvement loop. You're the Lead — orchestrator, state guard. All sub-agents are ephemeral.

## Context

Project directory: !`pwd`

## Parse input

The argument is free-form natural language. Extract:

- Target PR count `N` (e.g. _"5 cycles"_, _"run 20 times"_). Default `N=10`. Phrases like _"keep going"_, _"no cap"_, _"infinity"_ → uncapped (`N=∞`); the run stops only on 3 empties or infrastructure block.
- Focus hint (e.g. _"focus on the auth module"_) — passed to Planner.

Ambiguous → best interpretation, mention in opening update. Don't interrupt to clarify.

## Precondition

Auto-improve is destructive between cycles — it resets the working tree to upstream. Must run inside a worktree (working directory under `.claude/worktrees/`). If not, tell the user to enter one first.

## Pre-run safety checks

Run **before the first cycle**. Any failure → abort and report to user.

```
git fetch origin
git status --porcelain  # must be empty (else: uncommitted changes)
```

Capture the default branch name (handles both `main` and `master`):

```
DEFAULT_BRANCH=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||' || echo main)
```

Also ensure the label exists:

```
gh label create auto-improve --description "Automated improvement PR" --color 0E8A16 --force
```

## State directory

Fresh per run, outside the worktree:

```
STATE_DIR=$(mktemp -d -t auto-improve)
trap 'rm -rf "$STATE_DIR"' EXIT
```

Files:

- `brief.md` — per-cycle, written by Planner. Wiped pre-cycle.
- `planner-memory.md` — whole-run backlog. Persists across cycles.
- `fix-log.md` — per-cycle, append-only (Reviewer issues + Builder responses). Wiped pre-cycle.

Initialize `planner-memory.md` with empty sections:

```
## explored

## candidates
```

## Counters

- `pr_count = 0`
- `consecutive_empties = 0`

## Per-cycle flow

Repeat until a stop condition fires (see "Stop conditions").

### 1. Pre-cycle reset

```
git fetch origin
git checkout origin/$DEFAULT_BRANCH
git clean -fd
rm -f "$STATE_DIR/brief.md" "$STATE_DIR/fix-log.md"
touch "$STATE_DIR/fix-log.md"
```

`git checkout origin/$DEFAULT_BRANCH` puts the worktree on a detached HEAD at upstream — works regardless of which local branch the worktree is on, and doesn't conflict with `main`/`master` checked out elsewhere.

If a previous cycle picked an entry, its outcome status is written onto that entry in `planner-memory.md` (see step 5). Do that **before** running the Planner this cycle.

### 2. Planner

Spawn ephemeral (`Agent`, no `name`, `mode: "auto"`):

```
Read the file at ${CLAUDE_SKILL_DIR}/references/planner.md and follow those instructions exactly.
State directory: <STATE_DIR>
Focus hint (optional): <focus_hint_or_empty>
```

Wait for terminal status:

- `BRIEF_READY` → `$STATE_DIR/brief.md` is ready. Continue.
- `EMPTY` → cycle outcome is empty (`planner_empty`). Skip to step 5.

The Planner has flipped the picked entry's `Status` to `attempted` in `planner-memory.md`. Note the entry id — you'll update it post-cycle.

### 3. Build/review loop

`iterations = 0`. Loop:

1. Increment `iterations`.

2. Spawn ephemeral Builder:

   ```
   Read the file at ${CLAUDE_SKILL_DIR}/references/builder.md and follow those instructions exactly.
   State directory: <STATE_DIR>
   ```

   Builder reads `brief.md` + `fix-log.md`. On iteration 1 the log is empty, so Builder implements the brief. On later iterations Builder addresses the most recent Reviewer round and appends a `## Round N — Builder` block.

   Wait for terminal status:
   - `DONE` → continue.
   - `FAILED: <reason>` → if reason mentions blocked tools, missing paths, or hook rejections, this is infrastructure — **stop the run**. Otherwise outcome is `builder_failed`. Skip to step 5 and revert tree (`git checkout origin/$DEFAULT_BRANCH && git clean -fd`).

3. Spawn ephemeral Reviewer:

   ```
   Read the file at ${CLAUDE_SKILL_DIR}/references/reviewer.md and follow those instructions exactly.
   State directory: <STATE_DIR>
   ```

   Reviewer appends its `## Round N — Reviewer` block to `fix-log.md` itself before returning.

   Wait for terminal status:
   - `VERDICT: PASS` → exit loop, continue to step 4.
   - `VERDICT: REJECT <reason>` → outcome is `diff_rejected`. Skip to step 5 and revert tree.
   - `VERDICT: FIX_NEEDED` → if `iterations >= 3`, outcome is `diff_rejected` (loop exhausted). Skip to step 5 and revert tree. Otherwise re-loop.

### 4. Raise PR

Look for a PR-raising skill via the `Skill` tool and use it if one exists — non-interactive, worktree-aware. The skill needs `$STATE_DIR/brief.md` as the rationale for the PR description.

**Don't fall back to `gh pr create` yourself.** If no PR-raising skill is registered, treat that as an infrastructure block and stop — the project's PR conventions matter more than getting one PR out.

After the PR is created, label it:

```
gh pr edit <number> --add-label auto-improve
```

Outcomes:

- PR opened, URL captured → outcome is `shipped`.
- `gh` auth missing, no network, no write permissions, hook rejection, no PR-raising skill registered, or any tool/path issue from the skill or `gh edit` → **stop the run** with the verbatim error.

### 5. Post-cycle bookkeeping

Update counters:

- `shipped` → `pr_count++`, `consecutive_empties = 0`.
- Any empty (`planner_empty`, `builder_failed`, `diff_rejected`) → `consecutive_empties++`.

If the Planner picked an entry this cycle, edit `$STATE_DIR/planner-memory.md` and write onto that entry:

- `Status:` → `shipped` | `diff_rejected` | `builder_failed` | `rejected`
- `Cycle:` → current cycle number
- `Notes:` → reason if non-shipped (one line: e.g. `Builder failed: every approach regressed perf`)

If the cycle was `planner_empty`, no entry to update.

Check stop conditions, then loop to step 1.

## Stop conditions

Stop when any of:

- `pr_count >= N` (target hit). Skipped if `N=∞`.
- `consecutive_empties >= 3`.
- Any infrastructure block (Builder/Reviewer reports a blocked tool, missing path, or hook rejection; or an unrecoverable git/gh error during PR raising).

Report to user: PRs raised (URLs), cycles attempted, reason for stopping.

## Infrastructure blockers — never route around

If a tool is blocked, a path is unreachable, a hook rejects work, `gh` auth is broken, or a sub-agent reports infrastructure failure — **stop immediately and escalate**. Don't spawn replacements, don't invent alternative flows, don't retry with different args. Report verbatim what was blocked, which step, which cycle.
