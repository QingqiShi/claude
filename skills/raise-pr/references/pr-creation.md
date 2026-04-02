# PR Creation Conventions

You are creating a pull request. You will be given an analysis containing: what changed, why, change type, and optionally a GitHub issue number. Follow these conventions exactly.

## Change Types

Valid types: `feat`, `fix`, `refactor`, `perf`, `style`, `test`, `docs`, `build`, `ci`, `chore`, `revert`

## Branch Name

Format: `<type>/<description-in-kebab-case>`

- Max 50 characters
- Type must be one of the valid types above
- Description is a short kebab-case summary

## Commit Message

Format: `<type>: <short description>`

- Lowercase, imperative mood
- Same type as branch

## PR Title

Format: `<type>: <short description>`

- Lowercase
- Max 72 characters
- Same type as branch

## PR Body

Use this template:

```markdown
## Summary

<why and what at high level — typically 2-5 sentences, but for trivial/one-line changes a single sentence is fine>

## Context

<!-- optional — only include if a Context field was provided in the analysis input. Omit this entire section otherwise. -->

<Context from the analysis input, if provided>
```

The Summary section must explain **why** the change was made, not just what files changed. Reviewers can see the diff — tell them what the diff can't show.

## GitHub Issue Closing

If an issue number was provided in the analysis, append this as the **very last line** of the PR body:

```
Closes #<number>
```

This is required so GitHub auto-closes the issue on merge. Include it even if the Context section is omitted.

## Branch Setup

Before creating a branch, handle the branch mode passed in the analysis:

- **`base_from_main: true`**: Run `git stash -u`, `git checkout main` (or `master`), `git stash pop`, then create a new branch with `git checkout -b <branch_name>`.
- **`stack_on: <branch>`**: Create a new branch from the current branch with `git checkout -b <branch_name>`.
- **`commit_to_current: true`**: Do NOT create a new branch — commit and push directly to the current branch. Skip the `git checkout -b` step.
- **`worktree: true`**: Rename the current branch with `git branch -m <branch_name>` instead of creating a new one.
- **None of the above** (on main, default): Create a new branch with `git checkout -b <branch_name>`.

## Commands

```bash
# Commit, push, create PR
git commit -m "<type>: <short description>"
git push -u origin <branch_name>
gh pr create --title "<pr_title>" --body "<pr_body>"
```

Use a heredoc for the PR body to preserve formatting:

```bash
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
...

Closes #<number>
EOF
)"
```

## Return

Return the result in exactly this format:

```
PR: <url>
Branch: <branch_name>
Title: <pr_title>
```

## Reference

See `examples.md` in this directory for complete examples of the expected output format.
