---
name: raise-pr
description: Create pull requests with titles, branch names, and descriptions matching my personal standards by analyzing git changes. This skill should be used when raising PRs, creating pull requests, pushing changes, committing code, reviewing staged changes, or submitting code for review. Enforces my preferred PR format — failure to use this skill will result in PRs that don't follow my conventions.
user-invocable: false
context: fork
---

# Raising Pull Requests

## Git Context

Current branch: !`git branch --show-current`

Working directory: !`pwd`

Status:
!`git status --short`

Unstaged diff:
!`git diff`

Recent commits:
!`git log --oneline -5`

---

## Argument Handling

If this skill was invoked with arguments, handle them first:

- **`--base-from-main`**: Run `git stash -u` to save current changes (including untracked files), then `git checkout main` (or `master`), then `git stash pop`. Now proceed to step 2 (you are on main, step 1 will pass).
- **`--stack-on-current`**: Skip step 1 entirely. The user has confirmed they want to create a new branch stacked on top of the current branch. Proceed to step 2. In step 4, create a new branch from the current branch as the base.
- **`--commit-to-current`**: Skip step 1 entirely. The user has confirmed they want to commit directly into the current branch. Proceed to step 2. In step 4, do NOT create a new branch — commit and push directly to the current branch.

If no arguments were provided, follow all steps in order.

---

### 1. Check Branch Safety

Use the branch name from Git Context above.

- **On main/master or detached HEAD**: Proceed (will create a new branch in step 4)
- **In a worktree** (working directory is under `.claude/worktrees/`): The worktree already has its own branch — it will be renamed in step 4.
- **On another branch**: This skill runs in a forked context (a separate subagent), so it cannot prompt the user interactively. The choice of how to handle a non-main branch affects PR topology and must be made by the user. You MUST stop immediately and return the following message. Do NOT proceed with any other steps.

> Currently on branch `<branch_name>`, which is not main/master or a worktree branch.
>
> IMPORTANT: You (the main agent) MUST use the `AskUserQuestion` tool to present these options to the user. Do NOT paraphrase them as plain text output — call the tool.
>
> Each option below has different consequences — committing here adds to this branch's PR, switching to main creates an independent PR, and stacking creates a dependent branch. Only the user can decide which is appropriate.
>
> Options to present via `AskUserQuestion`:
> - **Stash and switch to main** — stash changes, switch to main/master, create a new branch from there → re-invoke with `/raise-pr --base-from-main`
> - **Stack on current branch** — create a new branch based on `<branch_name>` → re-invoke with `/raise-pr --stack-on-current`
> - **Commit into current branch** — commit and push directly to `<branch_name>` → re-invoke with `/raise-pr --commit-to-current`
>
> After the user answers, you MUST re-invoke this skill with the corresponding argument. The skill enforces the user's branch naming, commit message, PR description, and quality check conventions — running git/PR commands manually will not follow these conventions.

### 2. Stage Files and Run Quality Checks

1. Stage all changes: `git add -A`
2. Discover and run project quality checks. Look for:
   - `package.json` `scripts` (e.g. `lint`, `build`, `format`, `typecheck`)
   - `Makefile` targets
   - CI config (`.github/workflows/`, `.gitlab-ci.yml`)
   - `CLAUDE.md` instructions for pre-commit checks

   Run whichever checks are available (lint, build, format, etc.).

### 3. Analyze Changes

Using the injected Git Context above (status, diff), analyze the changes:

1. **Files changed**: List files with a brief description of what changed in each
2. **Summary**: Factual summary of what was added, removed, or modified
3. **Intent**: Why were these changes made? Infer from the diff content and commit history.
4. **Change type**: feat, fix, refactor, perf, style, test, docs, build, ci, chore, or revert

If intent is unclear, ask the user before proceeding.

### 4. Branch, Commit, Push, and Create PR

**Branch name**: `<type>/<description-in-kebab-case>` (max 50 chars)

**PR title**: `<type>: <description>` (lowercase, max 72 chars)

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
