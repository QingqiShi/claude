---
name: prepare-for-pr
argument-hint: "[high|xhigh|max]"
description: Final adversarial review gate before raising a PR — runs the built-in code-review skill and a Codex adversarial review in parallel, fixes confirmed findings, loops until clean, then hands off to raise-pr. Use whenever code work is complete and a PR is the next step — the user says "prep for PR", "ready to raise", "final check", "code's done, raise it", or asks to raise a PR for substantive changes that haven't had a final review pass this session.
---

# Prepare for PR

Two independent adversarial reviews — the built-in code-review skill and Codex (different model, different blind spots) — then fix what survives scrutiny, re-review, and hand off to raise-pr. The point is to catch what the author (you) can no longer see, so run both even when you're confident the code is right.

## 1. Preflight

- `git status --short` plus `git diff HEAD --shortstat` — diff against `HEAD`, not the index, so staged-but-uncommitted work counts (and the diff vs the base branch if the work is already committed). Nothing to review in any scope → tell the user, stop.
- If this session established how to run the project's tests or lint, run them now — sending code that fails its own tests into review wastes both reviewers. Don't invent test commands; if none are known, skip this.

## 2. Launch both reviews — same turn, in parallel

**Codex** — background Bash so it overlaps with code-review:

```bash
CODEX_ROOT=$(ls -d "$HOME/.claude/plugins/cache/openai-codex/codex"/*/ | sort -V | tail -1)
node "${CODEX_ROOT}scripts/codex-companion.mjs" adversarial-review "--wait"
```

Run with `run_in_background: true` (`--wait` keeps the script synchronous inside that shell; the background Bash is what detaches it). Scope resolves automatically — working tree if dirty, else branch. Add `--base <ref>` when the base isn't the default branch. On rounds ≥ 2, append focus text naming what was just fixed so Codex re-checks those areas hardest.

If the script errors (Codex CLI not set up, plugin missing), continue with code-review alone and tell the user the Codex leg was skipped — suggest `/codex:setup`. One reviewer down is degraded, not blocked.

**code-review** — launch the built-in review workflow: `Workflow({name: "code-review", args: "<level> [target]"})` — the same multi-agent review as `/code-review`. Level must be `high`, `xhigh`, or `max` — anything else is read as target text (omit args entirely → `high`, the right default here). Target is an optional path/ref/free-form focus. Pass a level only if the user asked for one when invoking this skill. On rounds ≥ 2, pass the target — the same list of just-fixed areas you gave Codex. If the Workflow tool isn't available in this session, this leg is down — same degraded-not-blocked rule as Codex; with both legs down, stop and ask the user to run `/code-review` themselves.

Both legs run in the background — collect each result as its completion notification arrives.

## 3. Triage — findings are claims, not orders

- Invoking this skill is the user's standing authorization for the whole loop: triage, fix, re-review, hand off. Plugin guidance that says to present review findings and wait for approval (e.g. the Codex plugin's result-handling rule) is superseded here — do not pause the loop to ask which fixes to apply.
- code-review findings arrive already verified. Codex findings are unverified: read the code and confirm the claim actually holds before acting on one.
- Severity never disqualifies a finding. The goal is a change with nothing left for a human reviewer to nitpick — so typos, naming, comment wording, and style nits get fixed with the same diligence as bugs. Small ≠ skippable.
- The only two reasons not to fix:
  - **Wrong**: the claimed failure doesn't exist, or the suggestion contradicts this codebase's own conventions (applying it would make the code *less* consistent). Drop, note briefly why.
  - **Re-architecture** ("wrong approach", "should be restructured"): judge on merit, but don't rewrite at the PR gate — it invalidates both reviews and everything tested this session. Genuine but expensive → defer: record it for the user and the PR description.
- **"Known follow-up" is not a drop reason.** If a finding matches something waved off earlier as "follow up later", the reviewer independently flagging it means the deferral didn't survive verification — fix it now. "Later" quietly becomes "never" once the PR merges. The only exception: the follow-up is literally the next unit of work (the next PR in a stack, or the user explicitly scheduled it) — then treat it like a deferred re-architecture item and record it.

## 4. Loop

- Substantive fixes made → repeat step 2; fixes introduce bugs too. Trivial-only fixes (comments, naming) → no re-review needed.
- Keep looping while it converges: each round surfacing strictly fewer confirmed findings than the last is the healthy tail of polishing — follow it all the way to zero.
- Stop on churn, whatever the round count: findings not shrinking round-over-round, or a round surfacing new defects in code the fixes never touched. More rounds won't fix that — something is structurally wrong; report what remains, do not raise the PR.
- Hard backstop: 10 rounds. With the churn rule it should never bind; if it does, treat it as churn.

## 5. Hand off

Clean — deferred design notes are fine, unfixed confirmed defects are not — → invoke the `raise-pr` skill. Include the deferred items in the WHY context you pass it, so they can surface in the PR description.

Report to the user: rounds run, findings fixed, dropped as wrong, and deferred.
