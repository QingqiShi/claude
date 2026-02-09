---
name: design-verify
description: Verifies visual correctness of design and UI changes using browser automation. This skill should be used after any design changes, visual updates, CSS modifications, theme changes, or component styling work.
---

# Design Verification

Automated visual verification across a 4-condition matrix: light/desktop, dark/desktop, light/mobile, dark/mobile.

## Prerequisites

- A running local dev server or deployed URL to verify against
- The `agent-browser` CLI tool available on PATH

## Workflow

If a URL is not provided, ask for one before proceeding.

### Step 1: Determine Verification Context

Before launching sub-agents, examine the conversation history to determine what the user was working on. Extract:

- **Interactions**: States to test beyond the default page load. For example: "hover on .submit-btn", "open the modal by clicking .trigger", "fill the form and check validation". Empty means static review only.
- **Description**: One sentence describing what changed (e.g., "Restyled the pricing card component").

If the context is ambiguous (e.g., the user says "verify the design" with no prior conversation about what changed), ask the user:

- What page/component did you change?
- Are there specific elements or interactions to focus on?

These values will be embedded directly in each sub-agent prompt (see Step 2).

### Step 2: Launch Sub-Agents

Launch **4 parallel sub-agents** via the Task tool (`subagent_type: "design-verify"`) in a **single message** so they run concurrently. Each agent handles one of the combinations:

1. Light desktop
2. Dark desktop
3. Light mobile
4. Dark mobile

**Agent prompt:**

```
- URL: <url>
- Device: <desktop/mobile>
- Theme: <light/dark>
- Interactions: <comma-separated actions, or "none">

Description: <description>
```

### Step 3: Report

Collect results from all sub-agents and report findings to the user. If any issues were found, fix them.

## Multiple Pages

If multiple pages or routes require verification, repeat Steps 1-2 for each URL before compiling a single combined report in Step 3.
