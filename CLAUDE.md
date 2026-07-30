ALWAYS use the `raise-pr` skill for creating PRs.
Merge PRs with `gh pr merge [PR_NUMBER] --squash` (add `--auto` if checks are still running), and run it ONCE only.
Do NOT retry merge commands if they don't show verbose output — GitHub commands work silently.
Verify merge status with `gh pr view [PR_NUMBER]` instead of attempting duplicate merges.
When working from within a worktree, use `git checkout origin/main` instead of `git checkout main`, because main is likely already checked out in another worktree.
Reading a web page: use the `playwright-cli` skill, never `WebFetch` (unreliable). `WebSearch` is fine for finding URLs. Exception: reading a claude.ai Artifact's content — use `WebFetch` there as the Artifact tool documents; the page is auth-gated, so a plain browser hits a login wall.
Deliverables that require human review should be produced in HTML format.
Plan before large chunks of work, but NEVER use Plan Mode.
"Clean up" (worktrees, branches, folders, etc.) means remove only what is **no longer used** — never delete everything; check first (uncommitted changes, merge status, references) and flag anything ambiguous.
Keep comments and JSDoc to a line or two saying only what the code can't say itself — no design rationale, history, alternatives considered, or prose that restates the implementation.
If a CONTEXT.md exists with a glossary (or a CONTEXT-MAP.md pointing at per-context CONTEXT.md files), use its terms in code, comments, copy, and conversation. If the user's wording is ambiguous or uses a synonym or an `_Avoid_` term, confirm which glossary term they mean before acting — especially while planning, so requirements are stated in unambiguous language.
