---
name: raise-pr
description: Create pull requests with intelligent branch names and descriptions by analyzing git changes. This skill should be used when raising PRs, creating pull requests, pushing changes, committing code, reviewing staged changes, or submitting code for review. Automatically infers meaningful branch names and PR titles from git diffs.
---

# Raising Pull Requests

Follow these steps in order.

### 1. Check Branch Safety

```bash
git branch --show-current
```

- **On main/master or detached HEAD**: Proceed
- **On another branch**: Ask user whether to (a) stash and switch to main/master, or (b) stack on current branch

### 2. Stage Files and Run Quality Checks

1. Stage all changes: `git add -A`
2. Check `package.json` for lint/format commands (prefer `lint:changed`/`format:changed` over `lint`/`format`)
3. Run any found commands. If they modify files, re-stage and re-run. If they fail, stop and ask user.
4. If no quality commands exist, ask user if they want to skip.

### 3. Analyze Changes

Spawn the pr-research agent:

```
Task tool with subagent_type: "pr-research"
Prompt: "Analyze the staged git changes and report what was modified."
```

From the agent's factual report, determine the **intent** (why were these changes made?) and **change type** (feat, fix, refactor, etc.).

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
- **pr-research agent fails**: Ask user for branch name and PR title

## References

For detailed examples, see [references/examples.md](references/examples.md).
