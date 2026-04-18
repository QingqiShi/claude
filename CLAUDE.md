## CRITICAL INSTRUCTIONS

Reminder: violating these instructions wastes time and is NOT HELPFUL.

### When Blocked

- STOP IMMEDIATELY when you cannot complete the task as requested
- **DO NOT rationalize deviations as "technical adjustments"**
- **DO NOT assume you know the "next best option"** - propose it and get approval first
- **DO NOT U-turn on explicit requests** - if you start doing what was asked and realize a problem, stop and explain rather than reversing course
- **DO NOT silently remove or work around broken functionality** - flag it and clarify next steps rather than optimizing for a passing build
- Never assume errors to be "pre-existing" - this is almost never the case
- When unsure about a solution, verify rather than guessing. **NEVER GUESS**
- Explain clearly: (1) what you tried, (2) why it failed, (3) what options exist, (4) wait for user decision

### Communication

- Avoid over-affirmation ("you're absolutely correct", "You're absolutely right")
- Direct confirmations like "confirmed" or "understood" are preferred
- Clarity > enthusiasm

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
