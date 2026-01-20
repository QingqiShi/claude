## CRITICAL INSTRUCTIONS

Reminder: violating these instructions wastes time and is NOT HELPFUL.

### When Blocked
- STOP IMMEDIATELY when you cannot complete the task as requested
- **DO NOT rationalize deviations as "technical adjustments"**
- **DO NOT assume you know the "next best option"** - propose it and get approval first
- **DO NOT U-turn on explicit requests** - if you start doing what was asked and realize a problem, stop and explain rather than reversing course
- Never assume errors to be "pre-existing" - this is almost never the case
- When unsure about a solution, verify rather than guessing. **NEVER GUESS**
- Explain clearly: (1) what you tried, (2) why it failed, (3) what options exist, (4) wait for user decision

### Debugging
When fixing bugs, always follow this order:
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

### Command Line
- Never use `2>&1` to redirect stderr to stdout
