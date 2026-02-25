---
name: raise-pr
description: Create pull requests with intelligent branch names and descriptions by analyzing git changes. This skill should be used when raising PRs, creating pull requests, pushing changes, committing code, reviewing staged changes, or submitting code for review. Automatically infers meaningful branch names and PR titles from git diffs.
context: fork
---

# Raising Pull Requests

## Git Context

Current branch: !`git branch --show-current`

Working directory: !`pwd`

Status:
!`git status --short`

Staged diff:
!`git diff --cached`

Unstaged diff:
!`git diff`

Recent commits:
!`git log --oneline -5`

---

Follow these steps in order.

### 1. Check Branch Safety

Use the branch name from Git Context above.

- **On main/master or detached HEAD**: Proceed (will create a new branch in step 4)
- **In a worktree** (working directory is under `.claude/worktrees/`): The worktree already has its own branch — it will be renamed in step 4.
- **On another branch**: Ask user whether to (a) stash and switch to main/master, or (b) stack on current branch

### 2. Stage Files and Run Quality Checks

1. Stage all changes: `git add -A`
2. Check `package.json` for lint/format commands (prefer `lint:changed`/`format:changed` over `lint`/`format`)
3. Run any found commands. If they modify files, re-stage and re-run. If they fail, stop and ask user.
4. If no quality commands exist, ask user if they want to skip.

### 3. Analyze Changes

Using the injected Git Context above (status, staged diff, unstaged diff, recent commits) plus a fresh `git diff --cached` after staging in step 2, analyze the changes:

1. **Files changed**: List files with a brief description of what changed in each
2. **Summary**: Factual summary of what was added, removed, or modified
3. **Intent**: Why were these changes made? Infer from the diff content and commit history.
4. **Change type**: feat, fix, refactor, perf, style, test, docs, build, ci, chore, or revert

If intent is unclear, ask the user before proceeding.

### 4. Branch, Commit, Push, and Create PR

**Branch name**: `<type>/<description-in-kebab-case>` (max 50 chars)

**PR title**: `<type>: <description>` (lowercase, max 72 chars)

**Commit message**: Same as PR title. No Co-Authored-By.

**PR description**: Explain **why** the change is being made, not what files changed — reviewers can see the diff. Keep it to 2-5 sentences. Use this template:

```markdown
## Summary
<why and what at high level>

## Context
<optional: background, trade-offs, decisions>
```

```bash
# If in a worktree: rename the current branch instead of creating a new one
git branch -m <branch_name>
# Otherwise:
git checkout -b <branch_name>

git commit -m "<type>: <short description>"
git push -u origin <branch_name>
gh pr create --title "<pr_title>" --body "$(cat <<'EOF'
## Summary
...
## Context
...
EOF
)"
```

Return the PR URL, branch name, and title when done.

## Conventional Commit Types

feat, fix, refactor, perf, style, test, docs, build, ci, chore, revert

## Error Handling

- **Linting fails**: Show errors, ask user
- **Branch already exists**: Ask for different name
- **PR creation fails**: Show error and suggest fixes
- **No changes staged**: Warn user
- **Intent unclear from diff**: Ask user for branch name and PR title

## References

For detailed examples, see [references/examples.md](references/examples.md).
