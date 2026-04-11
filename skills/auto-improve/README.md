# Auto-Improve

Autonomous improvement loop. Finds issues in a project, implements fixes, raises PRs — unattended, until a target count is hit or nothing useful is left.

Runs inside a worktree. All team agents share the same worktree; there is no per-agent isolation.

## Team

| Agent         | Role                                                                           |
| ------------- | ------------------------------------------------------------------------------ |
| **Lead**      | Main session. Coordinates cycles, runs PR maintenance, tracks stop conditions. |
| **Planner**   | Explores the codebase, triages findings, writes problem-only briefs.           |
| **Builder**   | Receives a brief, designs a solution, implements it, hands off.                |
| **Evaluator** | Reviews the Builder's diff, iterates via `FIX_NEEDED`, raises the PR.          |

Planner, Builder, and Evaluator are long-lived **team agents** (via `TeamCreate`). When the Lead needs one of them to act, it uses `SendMessage` to the existing teammate — it never spawns a fresh `Agent` call to do their job, because that would collapse the team model into ephemeral one-shots. The team agents themselves are free to spawn sub-agents (e.g. `Explore` for batch reads) whenever it helps.

## Cycle flow

The Planner is idle by default — it only explores when the Lead sends it an explicit start-cycle signal. That removes any race with PR maintenance and keeps the control flow linear.

1. **Pre-cycle PR maintenance** — Lead checks open auto-improve PRs, rebases or fixes CI for any that need it.
2. **Lead sends identify-improvement signal** to Planner ("Send the next improvement to Builder". Planner begins exploring.
3. **Planner** explores and sends an identified improvement along with some code pointers to the Builder.
4. **Builder** reads the brief, designs a fix, implements it, runs quality checks, leaves the worktree dirty, reports `IMPLEMENTATION_DONE` to the Evaluator.
   - If a solution cannot be found, send `IMPLEMENTATION_FAILED` to the lead.
5. **Evaluator** challenges the problem and reviews the solution. Three outcomes:
   - **Clean** → raises PR via the user's preferred method (skill or otherwise) → `PR_RAISED <url>` to Lead.
   - **Fixable** → `FIX_NEEDED` to Builder (line-level fixes or "try a different approach"); Builder replies `FIX_APPLIED`; re-review.
   - **Fundamental problem** → `CHANGES_REJECTED` to Lead.
6. **Lead** updates counters and the stored outcome, then loops back to step 1.

## Design principles

- Planner is eager to explore, it tries to understand an area fully before identifying improvement opportunities.
- Planner can identify multiple opportunities at once, it will triage them for the highest valuable and sends only that one to the Builder. It's up to the Planner if it wants to keep exploring in the next round or send the next improvement it already knows.
- Planner should prioritize user facing bug fixes first, then architectural issues as the next high priority, followed by other improvements such as security vulnerabilities, accessibility, edge case handling, performance optimization, and SEO etc.
- Builder owns solution design, and delivers high quality solution. It must be very strict about following project instructions. No taking shortcuts just to check the improvement as complete. If an improvement can't be done after meaningful attempt, that's fine.
- If any tool call is blocked, a hook rejects work, or a team agent can't perform its role for reasons the skill didn't anticipate, Lead stops the run and reports to the user. Never route around.
- **Stay in the current worktree.** No `cd`, no new worktrees, no `git clean`/`reset --hard` on unknown state. The user's in-progress work may be in the worktree.

## Stop conditions

- Target PR count reached (default 10, `infinity` removes the cap).
- 3 consecutive empty cycles (`CHANGES_REJECTED` or `IMPLEMENTATION_FAILED`).
- Planner sends `STOP: ALL_AREAS_EXHAUSTED`.
- Infrastructure block (immediate escalation, not counted).

## Files

```
SKILL.md                        Lead's instructions (coordinator + PR maintainer)
README.md                       This file
references/planner.md           Planner agent instructions
references/builder.md           Builder agent instructions
references/evaluator.md         Evaluator agent instructions
references/pr-maintenance.md    Ephemeral sub-agent prompt for PR rebase/CI-fix
evals/                          Scenario-based evaluation harness
```
