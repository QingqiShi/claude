# PR Creation Examples

Examples demonstrating the complete flow from staged diff analysis to final PR.

## Example 1: Feature Addition (with Context section)

**Analysis from staged diff:**

```
What Changed: Added JWT authentication system with token generation, validation middleware, /login and /logout endpoints

Why: Implement authentication to secure the API, which currently allows unrestricted access

Change Type: feat

Key Details: JWT for stateless auth, middleware for selective route protection
```

**Output** - Construct:

Branch: `feat/jwt-authentication`

PR Title / Commit: `feat: add JWT authentication`

PR Description:

```markdown
## Summary

Adds JWT-based authentication to secure the API. The API currently allows unrestricted access to all endpoints, which is a security gap we need to address before launch.

## Context

Uses stateless JWT tokens so we don't need session storage. The middleware pattern allows routes to opt-in to authentication, so public endpoints remain accessible.
```

## Example 2: Bug Fix (no Context section, linked to GitHub issue)

**Analysis from staged diff:**

```
What Changed: Modified parser to clean up event listeners in destructor and dispose method

Why: Fix memory leak where listeners were never removed after disposal, causing unbounded memory growth in long-running processes

Change Type: fix

Key Details: Particularly problematic in server environments, follows standard dispose pattern

GitHub Issue: #42
```

**Output** - Construct:

Branch: `fix/parser-memory-leak`

PR Title / Commit: `fix: resolve memory leak in parser module`

PR Description:

```markdown
## Summary

Fixes a memory leak in the parser module. Event listeners were never being removed after disposal, causing unbounded memory growth in long-running processes. This was particularly problematic in our server environments where the parser is instantiated frequently.

Closes #42
```

## Example 3: Refactoring (with Context section)

**Analysis from staged diff:**

```
What Changed: Migrated from Redux to React Context API - removed Redux (~500 lines), created Context providers and hooks (~200 lines), updated components

Why: Simplify state management as Redux is over-engineered for this application's simple state needs

Change Type: refactor

Key Details: ~60% code reduction, no functional changes, atomic migration
```

**Output** - Construct:

Branch: `refactor/context-api-migration`

PR Title / Commit: `refactor: migrate from Redux to Context API`

PR Description:

```markdown
## Summary

Replaces Redux with React Context API. Redux was over-engineered for this app's simple state needs — we only have a handful of global values and no complex async flows. This reduces state management code by ~60% and makes it easier to understand.

## Context

No functional changes to the application. The migration was done atomically to avoid any broken intermediate states.
```

## Example 4: Trivial fix (single-sentence summary, no Context)

**Analysis from staged diff:**

```
What Changed: Fixed typo in error message — "conncetion" → "connection"

Why: Correct a typo

Change Type: fix
```

**Output** - Construct:

Branch: `fix/error-message-typo`

PR Title / Commit: `fix: correct typo in connection error message`

PR Description:

```markdown
## Summary

Fixes a typo in the connection error message ("conncetion" → "connection").
```
