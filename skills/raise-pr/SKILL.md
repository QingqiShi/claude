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

## Argument Handling

If this skill was invoked with arguments, handle them first:

- **`--base-from-main`**: Run `git stash` to save current changes, then `git checkout main` (or `master`), then `git stash pop`. Now proceed to step 2 (you are on main, step 1 will pass).
- **`--stack-on-current`**: Skip step 1 entirely. The user has confirmed they want to create a new branch stacked on top of the current branch. Proceed to step 2. In step 4, create a new branch from the current branch as the base.
- **`--commit-to-current`**: Skip step 1 entirely. The user has confirmed they want to commit directly into the current branch. Proceed to step 2. In step 4, do NOT create a new branch — commit and push directly to the current branch.

If no arguments were provided, follow all steps in order.

---

### 1. Check Branch Safety

Use the branch name from Git Context above.

- **On main/master or detached HEAD**: Proceed (will create a new branch in step 4)
- **In a worktree** (working directory is under `.claude/worktrees/`): The worktree already has its own branch — it will be renamed in step 4.
- **On another branch**: This skill runs in a forked context and cannot ask the user directly. You MUST stop immediately and respond with ONLY this message:

> Currently on branch `<branch_name>`, which is not main/master or a worktree branch.
>
> Use the **AskUserQuestion** tool to ask the user which option they prefer, then re-invoke the skill with the chosen flag:
> - **Stash and switch to main** — stash changes, switch to main/master, create a new branch from there → `/raise-pr --base-from-main`
> - **Stack on current branch** — create a new branch based on `<branch_name>` → `/raise-pr --stack-on-current`
> - **Commit into current branch** — commit and push directly to `<branch_name>` → `/raise-pr --commit-to-current`

Do NOT proceed with any other steps. Stop here and return the message above.

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
