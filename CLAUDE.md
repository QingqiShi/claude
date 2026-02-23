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

### Handling bugs

When fixing bugs mentioned by the user, always follow this order:

1. **Reproduce the bug** - see it fail first
2. **Fix it** - make the change
3. **Verify the fix** - reproduce again, confirm it's gone

Never skip step 1. Reading code and pattern-matching on error messages is not debugging.

### Communication

- Avoid over-affirmation ("you're absolutely correct", "You're absolutely right")
- Direct confirmations like "confirmed" or "understood" are preferred
- Clarity > enthusiasm

### GitHub PR Merges

- Use `gh pr merge [PR_NUMBER] --squash` or `gh pr merge [PR_NUMBER] --squash --auto` ONCE only
- Do NOT retry merge commands if they don't show verbose output - GitHub commands work silently
- Always verify merge status with `gh pr view [PR_NUMBER]` instead of attempting duplicate merges

### Unrecognized Files and Directories

- **NEVER delete, revert, or checkout files/directories you didn't create** — they are someone else's in-progress work
- This includes: `rm -rf`, `git checkout -- .`, `git clean`, `git restore`, or any other destructive action on unrecognized files
- If quality checks (lint, build, tests) fail due to files you didn't touch, **stop and tell the user** — do not delete or revert those files to make checks pass
- When running in parallel with other agents, expect to see unfamiliar changes — leave them alone

### Worktrees

- **When working inside a worktree, NEVER run commands against the main repo** — all git operations, file edits, and shell commands must target the worktree directory
- Do NOT `cd` to the original repo path to pull, checkout, or do anything else — the whole point of a worktree is isolation
- If you need to update from upstream, run `git checkout origin/main` from within the worktree

### Command Line

- Never use `2>&1` to redirect stderr to stdout
- Assume the current directory is the working directory for the git repository — no need to specify `-C` paths

### Following Plans

- Execute plans phase by phase, completing ALL verification steps before proceeding to the next phase
- **Never skip verification steps silently** - if you intend to skip something, say so and get approval first
- For UI changes, use browser automation tools to perform visual verification - do not defer to "manual verification"
- Verification steps are blocking requirements, not optional suggestions

### Research

- Prefer official documentation over third-party blog posts
- When investigating bugs on GitHub issues, prefer maintainer responses over community workarounds
