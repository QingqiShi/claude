---
name: prepare-for-pr
description: Final review-and-fix gate to run before raising a PR — decides which review the change needs (/simplify, the built-in code-review workflow, or a Codex adversarial pass), applies the findings, then invokes raise-pr and drives CI green. Use when work is finished and a PR is the next step — "prep for PR", "ready to raise", "final check", "code's done, raise it" — or before raising a PR for substantive changes that have not had a final review this session. Works on prose a model reads (skills, CLAUDE.md, agent and command definitions) as well as on code.
argument-hint: "[high|xhigh|max]"
user-invocable: true
---

# Prepare for PR

Take a finished change to a merge-ready PR: choose the review it needs, run it, apply what comes back, raise the PR, drive CI green.

Which review, how deep, and how many rounds are yours to judge from the change in front of you.

## 1. See the change

```bash
git status --short
```

`git add -N` any untracked path that belongs to the change — the reviews below diff tracked files only.

If nothing changed, say so and stop. Otherwise read the diff, not just the file list — step 2 turns on what's in it.

## 2. Choose the review

Three tools. Say what you picked and why before running anything.

**`code-review`** — correctness angles in parallel plus a cleanup finder, every candidate independently verified, findings ranked and capped. Reviews only.

**`/simplify`** — four cleanup agents in parallel (Reuse, Simplification, Efficiency, Altitude). Applies its own fixes.

**Codex adversarial** — challenges the approach: assumptions, tradeoffs, whether this design is right. Reviews only. Worth it when there was a real design decision that could be wrong.

### code-review vs /simplify

code-review's coverage is a superset — the same cleanup lenses, plus Conventions (the diff against the CLAUDE.md files governing it), plus correctness. What `/simplify` adds is depth and fixes: code-review folds every lens into one finder, and when the cap forces a cut correctness always outranks cleanup, so cleanup findings are the first crowded out.

So pick on correctness risk: `code-review` when there's risk left to catch, `/simplify` when there isn't.

Neither category nor size decides it: a bug fix you've already reasoned through may want only `/simplify`; a rename whose blast radius you never traced wants `code-review`. Run both only when the cap would crowd cleanup out.

### Depth

| Level | Fan-out |
| --- | --- |
| `high` | 3 correctness angles, ≤10 findings |
| `xhigh` | 5 angles plus a gap sweep, ≤15 findings |
| `max` | same fan-out as `xhigh`, more reasoning per agent |

Scale to blast radius, not diff size — two lines of auth logic outrank a thousand-line rename. `high` by default; `xhigh` for architectural changes, cross-subsystem work, changed persisted formats, or security; `max` when the reasoning is the hard part rather than the surface area.

Pass the level explicitly — a bare call inherits the session's effort slider. If the user named one, use theirs.

## 3. Run it

**`/simplify` first**, if you're running it — it rewrites the working tree, so reviews that ran before it are stale.

```
Workflow({ name: "code-review", args: "<level> <scope or focus>" })
```

Runs in the background; verified findings arrive as a task notification. Anything after the level is the review target — exclude paths with it, or say what the change is *for*. Don't put `--fix` there; it parses as target text.

Never invoke `ultra` — a billed cloud review only the user can start. If the change warrants it, say so and let them type `/code-review ultra`.

If the workflow name doesn't resolve, don't improvise — ask the user to run `/code-review <level> --fix` and continue from step 4.

**Codex**, when the approach is what's in question:

```bash
node "$(jq -r '..|strings|select(test("openai-codex/codex/"))' ~/.claude/plugins/installed_plugins.json | head -1)/scripts/codex-companion.mjs" adversarial-review --wait
```

Resolve the path rather than hardcoding a version — several are usually installed.

## 4. Apply what came back

Report findings with `ReportFindings`, then fix each directly. Skip any whose fix would change intended behaviour, reach well outside the diff, or that you judge a false positive — note the skip rather than arguing with it. Then call `ReportFindings` again with the same findings, each carrying an `outcome` of `fixed`, `no_change_needed`, or `skipped`, before any prose summary; the per-finding status updates only from that call.

Run the repo's typecheck, lint and tests, including after `/simplify`. Use commands this session actually learned. A failure that predates the change isn't this change's fault; say which it was rather than chasing it.

## 5. Decide whether to go again

Judgement, not a fixed number: is there now materially unreviewed risk another pass would catch? Usually yes when the fixes are themselves substantial — several files touched, or logic changed rather than a line corrected. Scope the round to what moved:

```
Workflow({ name: "code-review", args: "<level> <paths the fixes touched> — review only these" })
```

Not because findings existed, the count felt high, or you want to be thorough — those reasons never run out. Each round should answer a narrower question than the last; when it wouldn't, you're done.

If a round surfaces something structural — fixes fighting each other, a defect that keeps reappearing — stop and report instead of raising.

## 6. Raise

Invoke **`raise-pr`**.

Carry what's still open into the PR description: findings you skipped, and correctness findings verified PLAUSIBLE rather than CONFIRMED — real mechanisms with unproven triggers, left for the user to judge. Give the finding and its evidence, not a count.

If Codex was wanted and didn't run, say the review was Codex-degraded and suggest `/codex:setup`.

## 7. Drive CI green

Once raise-pr reports the PR number:

```bash
gh pr checks <PR#> --watch
```

Run it in background Bash; its completion notification is the signal to act. No `--fail-fast`, so one fix round can cover every red. "No checks reported" → wait a minute, retry once; still nothing → no CI, report and finish.

On failure read before touching anything: `gh pr checks <PR#>` for which check failed, `gh run view <run-id> --log-failed` for why.

**The change broke it.** Fix every red in one round, run that check locally, push. Prefer `git commit --amend --no-edit && git push --force-with-lease` so the PR stays one clean commit; use a follow-up commit only if someone has already engaged with the PR. A CI fix beyond a few lines invalidates the review that just passed — go back to step 2 first.

**It didn't** — a failure in untouched code, or a runner/network flake. `gh run rerun <run-id> --failed`, once. The same failure twice is real.

Every push must target the failure the last log showed. Pushes that don't move it, or fixes that keep surfacing new failures, mean something structural — stop and report.

## 8. Report

Short: the PR link, what you fixed, anything left open and why, where CI landed. If you stopped short of raising, what stopped you.
