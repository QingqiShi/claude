# Auto-Improve — Open Work

## Up next

1. **Re-run scenarios 1 and 2** to validate the post-scenario-2-failure fixes:
   - **Harness fix**: `eval-shim-hook.sh` now intercepts `gh pr list/view/checkout/close/comment/merge` (previously only mutations were routed through the shim, so real GitHub state was bleeding into eval runs). `gh-shim.sh` has stubs for all of these.
   - **Skill fix**: `planner.md` now ignores CLOSED (without merge) PRs in the dedupe skip list — closed PRs are too ambiguous to drive skip decisions. Only OPEN and MERGED count.
   - **New feature**: pre-cycle PR maintenance landed (see below).
   - Scenario 1 baseline to preserve: 8m 40s, $9.07, judge 5/5.
   - Scenario 2 failed last run (1/5 judge) due to the `gh pr list` leak surfacing a historical closed PR #33 that the Planner then over-aggressively skipped, pivoting to a wrong-direction feature addition. Both fixes should unblock it.

2. **Validate the new pre-cycle PR maintenance step** (also just landed). In eval mode the shim returns an empty PR list so the maintenance path is a no-op — the feature only gets real exercise against a live repo with at least one problematic open auto-improve PR. Worth a manual test against shiqingqi.com or similar once scenarios 1 and 2 are green.

3. **Scenarios 3–5 baselines** once 1–2 confirm the refactor and fixes hold.

2. **Scenarios 3–5 baselines** once 1–2 confirm the refactor holds up.

3. **Full matrix run** once 1–2 pass. Real baseline cost / quality / false-positive numbers across all 5 scenarios on the new architecture.

## Open ideas / things to revisit

- **Monitor Planner context pressure.** Planner holds `Read`/`Glob`/`Grep`/`Bash` plus prior PRs plus per-cycle findings. If sessions start stopping after only 2–3 PR cycles because the Planner is out of context, the delegation boundary needs a nudge in `planner.md` — currently the Planner decides for itself when to offload a batch read to an `Explore` sub-agent.

- **Scenario-1 validated at 8m 40s / $9.07 / judge 5/5** (loop-20260411-020855), beating the 4-agent baseline of 9m 12s / $9.97 / judge 5/5. Scenario 2 still needs to be run under the new architecture.

- **Explore sub-agent path untested by scenario 1.** In the 020855 run the Planner did all exploration via direct tools (14 Reads, 4 Greps, 2 Globs) and never spawned an `Explore` sub-agent — correct for a small app, but means scenario 2 or a larger project is needed to exercise the delegation path.

- **Speculative sub-agent spawning.** Optimization deferred during planning: overlapping the next `Explore` sub-agent with the Executor cycle using `git show origin/main:<path>` to avoid the half-modified-tree problem. Only worth revisiting if eval wall clock regresses on multi-cycle runs.

- **Deterministic grader false positive on clean-file checks.** `check_assertions.sh` flags any modification to a non-scenario file, which can't distinguish thoughtful utility extensions (e.g. 235634's `useLocalStorage` extension, praised by the judge) from real scope creep. Options: only flag if not transitively referenced by the primary edit, or only flag if the judge also flags it.

- **Fingerprint-based dedupe.** Current dedupe matches on file paths + pattern category, which relies on the Planner's judgment. A grep-signature fingerprint stored in PR bodies (written by `raise-pr`, read by Planner) would be more robust. Adds writer-side complexity.

- **Closed-without-merge handling.** Planner currently treats closed-without-merge PRs as "user rejected, skip." Could be wrong — the PR might have been superseded or closed for unrelated reasons. Worth revisiting after a few real runs to see how often this misfires.

- **Where do the durable learnings live?** The previous PROGRESS.md had a "Key Learnings" section with empirical gotchas (sub-agent Bash PATH bypass, sub-agent JSONL location, linked-worktree exclude behavior, project-local skill discovery path). Most are now reflected in the implementation, but if any get re-discovered the hard way, consider extracting them into a `LEARNINGS.md` or memory entries before this file is deleted entirely.
