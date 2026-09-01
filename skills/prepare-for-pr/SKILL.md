---
name: prepare-for-pr
description: Use whenever the user asks to raise, open, or create a pull request. Takes a finished change to a merge-ready PR: judges what review it needs, applies the findings, invokes raise-pr, and drives CI green.
user-invocable: true
---

# Prepare for PR

## 1. Review

```bash
git status --short
```

Nothing changed → say so and stop. `git add -N` any untracked path that belongs to the change — the tools below diff tracked files only.

Pick what the change needs, possibly nothing. Say what you picked and why.

**`/simplify`** — four cleanup agents (Reuse, Simplification, Efficiency, Altitude). Skip it when you're certain the change has nothing to find.

```
Skill({ skill: "simplify", args: "--fix" })
```

**Codex adversarial** — challenges assumptions and tradeoffs rather than the code. Worth it when a design decision could be wrong. Reports only.

```bash
node "$(jq -r '..|strings|select(test("openai-codex/codex/"))' ~/.claude/plugins/installed_plugins.json | head -1)/scripts/codex-companion.mjs" adversarial-review --wait
```

If Codex was wanted and didn't run, say the review was Codex-degraded and suggest `/codex:setup`.

**`code-review`** — only when the user asks. If the change warrants it, say so and let them decide. Subsumes `/simplify` — don't run both.

```
Workflow({ name: "code-review", args: "<high|xhigh|max> <scope or focus>" })
```

Use the level they named. Otherwise scale it to how much damage a missed defect does, not to diff size. Runs in the background; findings arrive as a task notification — report them with `ReportFindings`, then again with an `outcome` per finding (`fixed`, `no_change_needed`, `skipped`) before any prose summary; the per-finding status updates only from that call. Never invoke `ultra` — a billed cloud review only the user can start.

## 2. Apply

Fix each finding directly. Skip any whose fix would change intended behaviour or reach well outside the diff; note the skip.

Review a fix that carries material risk of its own.

## 3. Raise

Invoke **`raise-pr`**.

A concern you judged acceptable rather than fixed is context for it — the reasoning, so a reviewer can disagree with it.

## 4. Drive CI green

Once raise-pr reports the PR number, confirm the PR can merge before you watch CI — a conflicting PR builds nothing, so the watch would wait forever:

```bash
gh pr view <PR#> --json mergeable,baseRefName
```

`UNKNOWN` → GitHub is still computing; wait a few seconds, retry. `CONFLICTING` → rebase onto the base branch:

```bash
git fetch origin <base> && git rebase origin/<base>
```

Resolve each conflict so the change keeps its intent, `git rebase --continue`, then `git push --force-with-lease`. Re-run the check; once it says `MERGEABLE`, watch:

```bash
gh pr checks <PR#> --watch
```

Run it in background Bash; its completion notification is the signal to act. "No checks reported" → wait a minute, retry once; still nothing → no CI, report and finish.

On failure, read before touching anything: `gh pr checks <PR#>` for which check failed, `gh run view <run-id> --log-failed` for why.

**The change broke it.** Fix every red in one round, run that check locally, push. Prefer `git commit --amend --no-edit && git push --force-with-lease` so the PR stays one clean commit; use a follow-up commit only if someone has already engaged with the PR.

Review a fix that carries material risk of its own.

**It didn't** — a failure in untouched code, or a runner/network flake. `gh run rerun <run-id> --failed`, once. The same failure twice is real.

Every push must target the failure the last log showed. Pushes that don't move it, or fixes that keep surfacing new failures, mean something structural — stop and report.

## 5. Report

Short: the PR link, what you fixed, anything left open and why, where CI landed. If you stopped short of raising, what stopped you.
