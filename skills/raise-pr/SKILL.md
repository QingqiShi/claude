---
name: PR Raiser
description: Create pull requests with smart branch names and descriptions. Use when the user wants to raise a PR, create a pull request, push changes, or submit code for review. Analyzes staged changes to infer meaningful branch names and PR titles automatically.
---

# PR Raiser

Automates the PR workflow: branch creation, quality checks, commit, and PR creation with intelligent branch names and descriptions based on code analysis.

## Workflow

Follow these steps in order when raising a pull request:

### 1. Check Branch Safety

**IMPORTANT**: Before proceeding, verify the current branch is safe for creating a new branch.

```bash
git branch --show-current
```

- **If on main/master branch**: ✅ Safe to proceed
- **If on another branch**: ⚠️ **STOP** and ask user:
  - "You're currently on `<branch-name>`. Would you like to:"
    1. "Stash changes and switch to main/master for a clean branch?"
    2. "Stack changes on top of current branch `<branch-name>`?"
  - Wait for user decision before proceeding

### 2. Stage Files and Run Quality Checks

Stage all modified files and run **project-specific** quality checks.

**Important**: Look for project-specific commands that run only on changed files:
- Check `package.json` scripts for commands like `lint:changed`, `lint:staged`, `format:changed`
- Check for lint-staged, husky, or other pre-commit tools
- Prefer commands that run only on staged/changed files for speed
- Fall back to full `lint` and `format` commands if changed-file versions don't exist

```bash
# Stage all changes
git add -A

# Look for and run project-specific linting on changed files
# Examples: pnpm lint:changed, npm run lint:staged, pnpm lint --fix
<run project's lint command for changed files>

# Look for and run project-specific formatting on changed files
# Examples: pnpm format:changed, npm run format, pnpm prettier --write
<run project's format command for changed files>

# Check if linting/formatting created new changes
git status
```

**After running lint/format:**
- If new changes detected: Stage them with `git add -A`
- If lint/format **fails**: ⚠️ **STOP** and warn the user with specific errors
- If no quality check commands exist: Ask user if they want to skip quality checks
- If successful: ✅ Proceed to next step

### 3. Analyze Changes

**Use the pr-research agent to understand what changed and why.** This is critical for creating meaningful branch names, PR titles, and descriptions.

Launch the pr-research agent using the Task tool:

```
Task tool with subagent_type: "pr-research"
Prompt: "Analyze the staged git changes to understand what changed and why."
```

The pr-research agent will:
1. Run git commands (`git status`, `git diff --staged`, `git log`)
2. Read relevant files if needed for context
3. Provide analysis of what changed and the inferred intent/purpose

The agent response will include:
- **What Changed** - factual summary of modifications
- **Why (Inferred Intent)** - purpose and reasoning behind changes
- **Change Type** - feature, bug fix, refactoring, docs, etc.
- **Key Details** - important technical context

### 4. Construct Branch Name, PR Title, and Commit Message

Based on the pr-research agent's analysis, **you** (the main agent) should construct:

**Branch Name:**
- Format: `<type>/<description-in-kebab-case>`
- Type: Use conventional commit type (feat, fix, refactor, docs, test, chore, perf, style)
- Description: Short, descriptive name based on the PURPOSE (max 50 chars)
- Examples:
  - `feat/jwt-authentication`
  - `fix/memory-leak-in-parser`
  - `refactor/context-api-migration`

**PR Title:**
- Format: `<type>: <description>`
- Follow conventional commit format
- Type must be lowercase
- NO capitalization after the colon
- Explain WHY, not just WHAT (max 72 chars)
- Examples:
  - `feat: add JWT authentication for API security`
  - `fix: resolve memory leak in parser module`
  - `refactor: migrate from Redux to Context API`

**Commit Message:**
- Format:
  ```
  <type>: <short description>

  <detailed explanation from pr-research analysis>
  <explain what and why based on the agent's findings>
  ```
- First line: max 72 characters, conventional commit format
- Blank line between subject and body
- Body: Use the pr-research agent's analysis to explain the change
- Do NOT include Claude Code references

Now create the branch and commit:

```bash
# Create and checkout new branch
git checkout -b <branch_name>

# Create commit with conventional format
git commit -m "<commit_message>"
```

### 5. Push and Create PR

Based on the pr-research agent's analysis, construct a PR description that explains the changes clearly.

**PR Description Structure:**
```
## Summary
<Use the "Why (Inferred Intent)" from pr-research analysis>

## Changes
<Use the "What Changed" from pr-research analysis as bullet points>

## Key Details
<Include any important technical context from the analysis>

## Test Plan
<If applicable, mention how to test these changes>
```

Push the branch and create the PR:

```bash
# Push with upstream tracking
git push -u origin <branch_name>

# Create PR with gh CLI using the PR title you constructed
gh pr create --title "<pr_title>" --body "$(cat <<'EOF'
<your constructed PR description based on pr-research analysis>
EOF
)"
```

**Guidelines:**
- Use the pr-research agent's analysis to inform the description
- Focus on why these changes matter, not just what changed
- Keep it concise but informative
- Do NOT include Claude Code references

### 6. Return Results

After successful PR creation:

1. Provide the PR URL for easy access
2. Confirm successful completion with summary:
   ```
   ✅ Pull request created successfully!

   Branch: <branch_name>
   PR: <pr_url>
   Title: <pr_title>

   Summary: <brief description>
   ```

## Error Handling

Handle common errors gracefully:

- **Linting fails**: Show errors and ask if user wants to fix or skip
- **No remote repository**: Warn user and ask if they want to set up remote
- **Branch already exists**: Ask if user wants to use different name or checkout existing
- **PR creation fails**: Show gh CLI error and suggest fixes
- **No changes staged**: Warn user that there are no changes to commit
- **pr-research agent fails**: Show the error and fall back to asking user for branch name and PR title

## Best Practices

1. **Always use the pr-research agent** - Don't skip the analysis step
2. **Wait for quality checks** - Don't proceed if lint/format fails
3. **Respect user decisions** - Don't auto-proceed on branch safety checks
4. **Use conventional commits** - Strictly follow the format
5. **Focus on intent** - Branch names and PR titles should explain purpose, not just list files
6. **Keep it concise** - Branch names under 50 chars, PR titles under 72 chars
7. **Test plan matters** - Always consider how changes should be tested

## Examples

### Example 1: Feature Addition

**Changes**: Added JWT authentication endpoints and middleware

**pr-research agent analysis**:
```
## What Changed
Added JWT authentication system with four new/modified files:
- Created JWT token generation and validation utilities
- Created authentication middleware for protecting routes
- Added new /login and /logout endpoints
- Integrated auth middleware into existing API routes

## Why (Inferred Intent)
The changes implement a complete JWT-based authentication system to secure the API. This addresses a security need - the API currently has no authentication, allowing unrestricted access. The implementation follows standard JWT patterns with token-based sessions.

## Change Type
feature

## Key Details
- Uses JWT (JSON Web Tokens) for stateless authentication
- Middleware pattern allows selective route protection
- Login endpoint generates tokens, logout invalidates them
- Existing API functionality preserved, just adds auth layer
```

**You construct**:
- Branch name: `feat/jwt-authentication`
- PR title: `feat: add JWT authentication for API security`
- Commit message:
  ```
  feat: add JWT authentication for API security

  Implement JWT token generation and validation to secure the API.
  Add login/logout endpoints and session middleware.
  Update API routes to require authentication where needed.
  ```
- PR description:
  ```markdown
  ## Summary
  Implements a complete JWT-based authentication system to secure the API. This addresses the current security gap where the API has no authentication and allows unrestricted access.

  ## Changes
  - Created JWT token generation and validation utilities
  - Created authentication middleware for protecting routes
  - Added new /login and /logout endpoints
  - Integrated auth middleware into existing API routes

  ## Key Details
  - Uses JWT (JSON Web Tokens) for stateless authentication
  - Middleware pattern allows selective route protection
  - Login endpoint generates tokens, logout invalidates them
  - Existing API functionality preserved, just adds auth layer
  ```

**Result**: Branch created, committed, pushed, and PR opened with title and description above.

### Example 2: Bug Fix

**Changes**: Fixed memory leak in parser by clearing event listeners

**pr-research agent analysis**:
```
## What Changed
Modified parser module to properly clean up event listeners:
- Added cleanup logic in parser destructor
- Implemented event listener removal in dispose method
- Both files work together to prevent listener accumulation

## Why (Inferred Intent)
Fixes a memory leak where event listeners were never removed after parser instances were disposed. In long-running processes, each parser instance would leave listeners attached, causing memory to grow unbounded. The fix ensures proper cleanup.

## Change Type
bug fix

## Key Details
- Memory leak particularly problematic in server environments
- Fix follows standard dispose pattern for event-driven code
- No functional changes to parser behavior, only cleanup
```

**You construct**:
- Branch name: `fix/parser-memory-leak`
- PR title: `fix: resolve memory leak in parser module`
- Commit message:
  ```
  fix: resolve memory leak in parser module

  Remove event listeners in cleanup phase to prevent memory accumulation.
  Add proper disposal of parser instances when no longer needed.
  ```
- PR description:
  ```markdown
  ## Summary
  Fixes a memory leak where event listeners were never removed after parser instances were disposed, causing memory to grow unbounded in long-running processes.

  ## Changes
  - Added cleanup logic in parser destructor
  - Implemented event listener removal in dispose method
  - Both files work together to prevent listener accumulation

  ## Key Details
  - Memory leak particularly problematic in server environments
  - Fix follows standard dispose pattern for event-driven code
  - No functional changes to parser behavior, only cleanup
  ```

**Result**: Branch created, committed, pushed, and PR opened with title and description above.

### Example 3: Refactoring

**Changes**: Replaced Redux with React Context API for simpler state management

**pr-research agent analysis**:
```
## What Changed
Complete state management migration from Redux to React Context API:
- Removed all Redux store, actions, reducers (~500 lines)
- Created new Context providers and hooks (~200 lines)
- Updated all components to use new Context hooks
- No changes to component behavior or UI

## Why (Inferred Intent)
Simplifies state management by replacing Redux with React's built-in Context API. For this application's use case, Redux was over-engineered - the state is simple enough that Context API provides all needed functionality with significantly less boilerplate.

## Change Type
refactoring

## Key Details
- ~60% reduction in state management code
- No functional changes - application behavior identical
- Migration done atomically to avoid broken intermediate states
```

**You construct**:
- Branch name: `refactor/context-api-migration`
- PR title: `refactor: migrate from Redux to Context API`
- Commit message:
  ```
  refactor: migrate from Redux to Context API

  Simplify state management by replacing Redux with React Context API.
  Reduces boilerplate and improves maintainability for the current use case.
  No functional changes to application behavior.
  ```
- PR description:
  ```markdown
  ## Summary
  Simplifies state management by replacing Redux with React's built-in Context API. For this application's use case, Redux was over-engineered - the state is simple enough that Context API provides all needed functionality with significantly less boilerplate.

  ## Changes
  - Removed all Redux store, actions, reducers (~500 lines)
  - Created new Context providers and hooks (~200 lines)
  - Updated all components to use new Context hooks
  - No changes to component behavior or UI

  ## Key Details
  - ~60% reduction in state management code
  - No functional changes - application behavior identical
  - Migration done atomically to avoid broken intermediate states
  - Context API sufficient for current complexity level
  ```

**Result**: Branch created, committed, pushed, and PR opened with title and description above.

## Conventional Commit Types

Reference for constructing branch names, PR titles, and commit messages:

- **feat**: New feature for the user
- **fix**: Bug fix for the user
- **refactor**: Code change that neither fixes a bug nor adds a feature
- **docs**: Documentation only changes
- **test**: Adding or updating tests
- **chore**: Changes to build process, auxiliary tools, or dependencies
- **perf**: Performance improvements
- **style**: Code style changes (formatting, missing semi-colons, etc.)

## Notes

- This skill requires `gh` CLI to be installed and authenticated
- Quality checks are **project-specific** - look for lint/format commands in the project's package.json or configuration
- Prefer quality check commands that run only on changed files (e.g., `lint:changed`, `lint:staged`) for better performance
- The pr-research agent is critical for understanding intent - don't skip it
- Always use conventional commit format - it's a strict requirement
- Focus on explaining **why** changes were made, not just **what** changed
