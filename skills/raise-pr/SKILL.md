---
name: raise-pr
description: Create pull requests with intelligent branch names and descriptions by analyzing git changes. This skill should be used when raising PRs, creating pull requests, pushing changes, committing code, reviewing staged changes, or submitting code for review. Automatically infers meaningful branch names and PR titles from git diffs.
---

# Raising Pull Requests

Automates the PR workflow: branch creation, quality checks, commit, and PR creation with intelligent branch names and descriptions based on code analysis.

## Workflow

Copy this checklist to track progress through the PR creation workflow:

```
PR Creation Progress:
- [ ] Step 1: Check branch safety
- [ ] Step 2: Stage files and run quality checks
- [ ] Step 3: Analyze changes with pr-research agent
- [ ] Step 4: Construct branch name, PR title, and commit message
- [ ] Step 5: Push and create PR
- [ ] Step 6: Return results
```

Follow these steps in order when raising a pull request.

### 1. Check Branch Safety

Verify the current branch before creating a new branch:

```bash
git branch --show-current
```

- **On main/master**: Proceed to next step
- **Detached HEAD** (empty output): Treat as main/master, proceed to next step
- **On another branch**: Ask the user to choose:
  1. Stash changes and switch to main/master for a clean branch
  2. Stack changes on top of current branch
  - Wait for user decision before proceeding

### 2. Stage Files and Run Quality Checks

Stage files and run project-specific quality checks in a validation loop.

**Quality check workflow:**

1. **Stage all changes:**

   ```bash
   git add -A
   ```

2. **Find project-specific commands** (check `package.json`):

   - Prefer: `lint:changed`, `lint:staged`, `format:changed` (faster)
   - Fallback: `lint`, `format` (if changed-file versions don't exist)

3. **Run quality checks:**

   ```bash
   # Run linting (examples: pnpm lint:changed, npm run lint:staged)
   <run project's lint command>

   # Run formatting (examples: pnpm format:changed, npm run format)
   <run project's format command>
   ```

4. **Validation loop** (iterate until passing):
   - **If checks pass**: Proceed to next step
   - **If checks modify files**: Stage changes with `git add -A`, then verify with `git status`
   - **If checks fail**: **STOP** - Show specific errors and ask user to fix
   - **If no quality commands exist**: Ask user if they want to skip quality checks

Do not proceed until quality checks pass or user explicitly approves skipping them.

### 3. Analyze Changes

Use the pr-research agent to get a factual summary of what changed.

```
Task tool with subagent_type: "pr-research"
Prompt: "Analyze the staged git changes and report what was modified."
```

The agent provides factual information:

- **Files Changed** - what files were added, modified, or deleted
- **Summary of Modifications** - what code was changed
- **Observations** - patterns and technical context

Based on this analysis, **you** determine:

1. **Intent** - Why were these changes made? What problem do they solve?
2. **Change Type** - Is this a feat, fix, refactor, etc.? (See Conventional Commit Types below)

**If intent is unclear**: Ask the user before proceeding. The "why" is the most important part of a PR description. Examples:
- "I see changes to the lint config, but I'm not sure why. Is this fixing a broken command? Adding stricter rules?"
- "This looks like a dependency upgrade. What does the new version provide that we need?"

### 4. Construct Branch Name, PR Title, and Commit Message

Based on the pr-research facts and your determination of intent/change type, construct:

**Branch Name** - Format: `<type>/<description-in-kebab-case>`

- Type: feat, fix, refactor, perf, style, test, docs, build, ci, chore
- Description: Purpose-based, max 50 chars
- Examples: `feat/jwt-authentication`, `fix/memory-leak-in-parser`

**PR Title** - Format: `<type>: <description>`

- Lowercase type, no capitalization after colon
- Concise summary of what changed, max 72 chars
- Examples: `feat: add JWT authentication`, `fix: resolve memory leak in parser`

**Commit Message** - Keep it brief. The PR description is where detail lives.

- First line: Same as PR title
- Optional body: Brief context if needed
- Do NOT include Claude Code references

**Create branch and commit:**

```bash
git checkout -b <branch_name>
git commit -m "<type>: <short description>"
```

### 5. Push and Create PR

Construct PR description using the pr-research facts and your understanding of intent.

**PR Description Principles:**

The goal of a PR description is to explain **what changed** and **why**. Reviewers can see the code diff themselves, so:

- **Never list files or individual code changes** - the reviewer will see these in the diff
- **Focus on intent** - Why is this PR being raised? What problem does it solve?
- **Provide context the diff doesn't show** - Background, motivation, trade-offs, future implications
- **Keep it concise** - A few sentences is often enough

**If intent is unclear**: Ask the user before creating the PR. Examples of questions to clarify:
- "Is this fixing a bug? If so, what was the issue?"
- "What prompted this change?"
- "What's the benefit of this refactor?"

**PR Description Template:**

```markdown
## Summary

<1-3 sentences explaining WHY this change is being made and WHAT it accomplishes at a high level>

## Context

<Optional: Background information, what led to this change, any non-obvious trade-offs or decisions>
```

**Push and create PR:**

```bash
# Push with upstream tracking
git push -u origin <branch_name>

# Create PR using HEREDOC
gh pr create --title "<pr_title>" --body "$(cat <<'EOF'
## Summary

<why and what at high level>

## Context

<background if needed>
EOF
)"
```

**Guidelines:**

- Do NOT list files changed or bullet-point every modification
- Do NOT include Claude Code references
- Prefer 2-5 sentences over long structured lists

### 6. Return Results

Provide PR URL and summary:

```
PR created successfully.

Branch: <branch_name>
PR: <pr_url>
Title: <pr_title>

Summary: <brief description>
```

## Error Handling

Common errors and responses:

- **Linting fails**: Show errors, ask if user wants to fix or skip
- **No remote repository**: Warn and ask if they want to set up remote
- **Branch already exists**: Ask for different name or checkout existing
- **PR creation fails**: Show gh CLI error and suggest fixes
- **No changes staged**: Warn that there are no changes to commit
- **pr-research agent fails**: Fall back to asking user for branch name and PR title

## Conventional Commit Types

Reference for constructing branch names, PR titles, and commit messages:

- **feat**: New feature or functionality
- **fix**: Bug fix
- **refactor**: Code restructuring without behavior change
- **perf**: Performance improvements
- **style**: Formatting only (whitespace, semicolons)
- **test**: Adding or updating tests
- **docs**: Documentation changes
- **build**: Build system, dependencies, project config (Node version, webpack, Docker)
- **ci**: CI/CD configuration and scripts (GitHub Actions, Jenkins)
- **chore**: Miscellaneous (gitignore, editor configs)
- **revert**: Reverting a previous commit

## References

For detailed examples, see [references/examples.md](references/examples.md).

## Notes

- This skill requires `gh` CLI to be installed and authenticated
- Quality checks are **project-specific** - look for lint/format commands in the project's package.json or configuration
- Prefer quality check commands that run only on changed files (e.g., `lint:changed`, `lint:staged`) for better performance
- The pr-research agent provides factual analysis - do not skip it
- Always use conventional commit format
- **PR descriptions should explain WHY, not list WHAT** - reviewers can see the code diff
- **When intent is unclear, ask the user** - a good PR description requires understanding the purpose
