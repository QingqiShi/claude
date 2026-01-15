---
name: Raising Pull Requests
description: Create pull requests with intelligent branch names and descriptions by analyzing git changes. Use when raising PRs, creating pull requests, pushing changes, committing code, reviewing staged changes, or submitting code for review. Automatically infers meaningful branch names and PR titles from git diffs.
---

# Raising Pull Requests

Automates the PR workflow: branch creation, quality checks, commit, and PR creation with intelligent branch names and descriptions based on code analysis.

## Workflow

**IMPORTANT**: Copy this checklist and track your progress through the PR creation workflow:

```
PR Creation Progress:
- [ ] Step 1: Check branch safety
- [ ] Step 2: Stage files and run quality checks
- [ ] Step 3: Analyze changes with pr-research agent
- [ ] Step 4: Construct branch name, PR title, and commit message
- [ ] Step 5: Push and create PR
- [ ] Step 6: Return results
```

Follow these steps in order when raising a pull request:

### 1. Check Branch Safety

Verify the current branch before creating a new branch:

```bash
git branch --show-current
```

- **On main/master**: ✅ Proceed to next step
- **On another branch**: ⚠️ Ask user to choose:
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
   - **If checks pass**: ✅ Proceed to next step
   - **If checks modify files**: Stage changes with `git add -A`, then verify with `git status`
   - **If checks fail**: ⚠️ **STOP** - Show specific errors and ask user to fix
   - **If no quality commands exist**: Ask user if they want to skip quality checks

**Important**: Do not proceed until quality checks pass or user explicitly approves skipping them.

### 3. Analyze Changes

**Use the pr-research agent** to understand what changed and why. This is critical for meaningful branch names, PR titles, and descriptions.

```
Task tool with subagent_type: "pr-research"
Prompt: "Analyze the staged git changes to understand what changed and why."
```

The agent provides:

- **What Changed** - factual summary of modifications
- **Why (Inferred Intent)** - purpose and reasoning
- **Change Type** - feat, fix, refactor, perf, style, test, docs, build, ci, chore
- **Key Details** - important technical context

### 4. Construct Branch Name, PR Title, and Commit Message

Based on pr-research analysis, construct:

**Branch Name** - Format: `<type>/<description-in-kebab-case>`

- Type: feat, fix, refactor, perf, style, test, docs, build, ci, chore
- Description: Purpose-based, max 50 chars
- Examples: `feat/jwt-authentication`, `fix/memory-leak-in-parser`

**PR Title** - Format: `<type>: <description>`

- Lowercase type, no capitalization after colon
- Explain WHY, not just WHAT, max 72 chars
- Examples: `feat: add JWT authentication for API security`

**Commit Message** - Use HEREDOC pattern:

```
<type>: <short description>

<detailed explanation from pr-research analysis>
```

- First line: max 72 characters
- Body: Explain what and why
- Do NOT include Claude Code references

**Create branch and commit:**

```bash
# Create and checkout new branch
git checkout -b <branch_name>

# Commit using HEREDOC for proper formatting
git commit -m "$(cat <<'EOF'
<type>: <short description>

<detailed explanation from pr-research analysis>
EOF
)"
```

### 5. Push and Create PR

Construct PR description using pr-research analysis:

**PR Description Template:**

```markdown
## Summary

<Why (Inferred Intent) from pr-research>

## Changes

<What Changed as bullet points>

## Key Details

<Important technical context>

## Test Plan

<How to test these changes (if applicable)>
```

**Push and create PR:**

```bash
# Push with upstream tracking
git push -u origin <branch_name>

# Create PR using HEREDOC
gh pr create --title "<pr_title>" --body "$(cat <<'EOF'
## Summary
<inferred intent>

## Changes
- <change 1>
- <change 2>

## Key Details
<technical context>
EOF
)"
```

**Guidelines:**

- Focus on WHY changes matter
- Do NOT include Claude Code references
- Keep concise but informative

### 6. Return Results

Provide PR URL and summary:

```
✅ Pull request created successfully!

Branch: <branch_name>
PR: <pr_url>
Title: <pr_title>

Summary: <brief description>
```

## Error Handling

**Common errors and responses:**

- **Linting fails**: Show errors, ask if user wants to fix or skip
- **No remote repository**: Warn and ask if they want to set up remote
- **Branch already exists**: Ask for different name or checkout existing
- **PR creation fails**: Show gh CLI error and suggest fixes
- **No changes staged**: Warn that there are no changes to commit
- **pr-research agent fails**: Fall back to asking user for branch name and PR title

## Examples

Examples demonstrate the complete flow from pr-research analysis to final PR.

### Example 1: Feature Addition

**Input** - pr-research agent analysis:

```
What Changed: Added JWT authentication system with token generation, validation middleware, /login and /logout endpoints

Why: Implement authentication to secure the API, which currently allows unrestricted access

Change Type: feature

Key Details: JWT for stateless auth, middleware for selective route protection
```

**Output** - You construct:

Branch: `feat/jwt-authentication`

PR Title: `feat: add JWT authentication for API security`

Commit:

```bash
git commit -m "$(cat <<'EOF'
feat: add JWT authentication for API security

Implement JWT token generation and validation to secure the API.
Add login/logout endpoints and session middleware.
Update API routes to require authentication where needed.
EOF
)"
```

PR Description:

```markdown
## Summary

Implements JWT-based authentication to secure the API, addressing the current security gap of unrestricted access.

## Changes

- Created JWT token generation and validation utilities
- Created authentication middleware for protecting routes
- Added new /login and /logout endpoints
- Integrated auth middleware into existing API routes

## Key Details

- Uses JWT for stateless authentication
- Middleware pattern allows selective route protection
- Existing API functionality preserved
```

### Example 2: Bug Fix

**Input** - pr-research agent analysis:

```
What Changed: Modified parser to clean up event listeners in destructor and dispose method

Why: Fix memory leak where listeners were never removed after disposal, causing unbounded memory growth in long-running processes

Change Type: bug fix

Key Details: Particularly problematic in server environments, follows standard dispose pattern
```

**Output** - You construct:

Branch: `fix/parser-memory-leak`

PR Title: `fix: resolve memory leak in parser module`

Commit:

```bash
git commit -m "$(cat <<'EOF'
fix: resolve memory leak in parser module

Remove event listeners in cleanup phase to prevent memory accumulation.
Add proper disposal of parser instances when no longer needed.
EOF
)"
```

PR Description:

```markdown
## Summary

Fixes memory leak where event listeners were never removed after parser disposal, causing unbounded memory growth in long-running processes.

## Changes

- Added cleanup logic in parser destructor
- Implemented event listener removal in dispose method

## Key Details

- Particularly problematic in server environments
- Follows standard dispose pattern for event-driven code
- No functional changes to parser behavior
```

### Example 3: Refactoring

**Input** - pr-research agent analysis:

```
What Changed: Migrated from Redux to React Context API - removed Redux (~500 lines), created Context providers and hooks (~200 lines), updated components

Why: Simplify state management as Redux is over-engineered for this application's simple state needs

Change Type: refactoring

Key Details: ~60% code reduction, no functional changes, atomic migration
```

**Output** - You construct:

Branch: `refactor/context-api-migration`

PR Title: `refactor: migrate from Redux to Context API`

Commit:

```bash
git commit -m "$(cat <<'EOF'
refactor: migrate from Redux to Context API

Simplify state management by replacing Redux with React Context API.
Reduces boilerplate and improves maintainability for the current use case.
No functional changes to application behavior.
EOF
)"
```

PR Description:

```markdown
## Summary

Simplifies state management by replacing Redux with React Context API. Redux was over-engineered for this application's simple state needs.

## Changes

- Removed all Redux store, actions, reducers (~500 lines)
- Created new Context providers and hooks (~200 lines)
- Updated all components to use new Context hooks

## Key Details

- ~60% reduction in state management code
- No functional changes - application behavior identical
- Migration done atomically to avoid broken intermediate states
```

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

## Notes

- This skill requires `gh` CLI to be installed and authenticated
- Quality checks are **project-specific** - look for lint/format commands in the project's package.json or configuration
- Prefer quality check commands that run only on changed files (e.g., `lint:changed`, `lint:staged`) for better performance
- The pr-research agent is critical for understanding intent - don't skip it
- Always use conventional commit format - it's a strict requirement
- Focus on explaining **why** changes were made, not just **what** changed
