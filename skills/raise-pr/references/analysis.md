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
WHAT: <factual high-level description of the change — typically 2-5 sentences, but for trivial/one-line changes a single sentence is fine. Do NOT list individual files.>

CHANGE_TYPE: <one of: feat, fix, refactor, perf, style, test, docs, build, ci, chore, revert>

QUALITY: <pass or fail — if fail, include the error output>
```

Important:

- **WHAT describes what the diff does, factually. Do not speculate about motivation.** You do not have access to the conversation that produced this change, so you cannot know why it was made — only what it does. The orchestrator will source the WHY separately.
- Forbidden phrases — these are speculation about intent: "to improve", "to keep clean", "to remove ad-hoc", "to follow best practices", "to reduce", "to enable", "in order to", "so that". If you find yourself writing one, rewrite the sentence as a factual description instead.
- "Removed the X script tag from the root layout" is correct. "Removed the X script tag to keep the codebase clean" is forbidden — you don't know that.
- If the purpose is genuinely self-evident from the diff itself (a literal typo fix, a null guard for an obvious crash), you may state it as a fact ("Fixes typo in error message"). Otherwise stay descriptive.
- Never list individual files — describe the change conceptually.
- CHANGE_TYPE must be one of the eleven types listed above (these are the valid types for branch name, commit message, and PR title). Pick the single type that best describes the dominant nature of the change; if the PR genuinely bundles mixed types, use the most user-visible one (`feat` > `fix` > `refactor` > `chore`).
- Keep the entire response under 200 words.
