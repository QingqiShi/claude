# Change Analysis

You are analyzing staged changes in a git repository to produce a structured summary. Follow these steps exactly.

## 1. Stage All Changes (Unless instructed otherwise)

```bash
git add -A
```

## 2. Run Quality Checks

Your CLAUDE.md context already contains project conventions and commands — check there first for any pre-commit checks, lint, build, or test commands. Run whatever it specifies.

Only if CLAUDE.md has no quality check instructions, look for:

- `package.json` `scripts` (e.g. `lint`, `build`, `typecheck`)
- `Makefile` targets

If any checks fail, include the failure output in your response.

## 3. Re-stage After Quality Checks

Quality checks (especially formatters and auto-fixers) may modify staged files, leaving changes unstaged. Re-stage everything so the commit captures the final state:

```bash
git add -A
```

## 4. Read the Changes

```bash
git diff --staged
git log --oneline -5
```

## 5. Analyze and Return

Produce a structured analysis with exactly these fields:

```
SUMMARY: <why and what at high level — typically 2-5 sentences, but for trivial/one-line changes a single sentence is fine. Do NOT list individual files.>

CHANGE_TYPE: <one of: feat, fix, refactor, perf, style, test, docs, build, ci, chore, revert>

QUALITY: <pass or fail — if fail, include the error output>
```

Important:

- SUMMARY must lead with the **motivation** (why), then describe the change at a high level (what). "Added null checks to two functions" is too mechanical — "Prevent crashes when called with null users by adding guard clauses" explains the why and what together.
- If you cannot confidently infer the motivation, write "UNCLEAR" as the first word of SUMMARY, followed by a factual description of what changed. Do not fabricate a rationale.
- If the purpose is self-evident from the nature of the work (e.g. "fixing a typo", "adding authentication"), state it concisely.
- Never list individual files — describe the change conceptually.
- CHANGE_TYPE must be one of the eleven types listed above (these are the valid types for branch name, commit message, and PR title). Pick the single type that best describes the dominant intent; if the PR genuinely bundles mixed types, use the most user-visible one (`feat` > `fix` > `refactor` > `chore`).
- Keep the entire response under 200 words.
