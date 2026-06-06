## CRITICAL INSTRUCTIONS

Reminder: violating these instructions wastes time and is NOT HELPFUL.

### GitHub PR

- ALWAYS use the `raise-pr` skill for creating/updating PRs
- Use `gh pr merge [PR_NUMBER] --squash` or `gh pr merge [PR_NUMBER] --squash --auto` ONCE only
- Do NOT retry merge commands if they don't show verbose output - GitHub commands work silently
- Always verify merge status with `gh pr view [PR_NUMBER]` instead of attempting duplicate merges

### Worktrees

- If you need to update from upstream, run `git checkout origin/main` from within the worktree

### Command Line

- Assume the current directory is the working directory for the git repository — no need to specify `-C` paths

### Clean Up

- "Clean up" (worktrees, branches, folders, etc.) means remove things that are **no longer used** — never delete everything
- Always check status first (uncommitted changes, whether branches are merged, whether folders are referenced) before removing anything
- Flag anything ambiguous for the user's decision

### Browser Use

- Always use the `playwright-cli` skill to operate the browser.

### Output Style

- When reporting information to me, be extremely concise, sacrifice grammar for the sake of concision.
