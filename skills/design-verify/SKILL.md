---
name: design-verify
description: Verifies visual correctness of design and UI changes using browser automation. This skill should be used after any design changes, visual updates, CSS modifications, theme changes, or component styling work to verify no overflow issues exist, light and dark modes render correctly, all design tokens propagate properly, contrast meets WCAG standards, and interactive states are intact. Trigger phrases include "verify the design", "check the UI", "verify visual changes", "check dark mode", "check for overflow".
allowed-tools: Bash(agent-browser:*), Task(design-verify:*)
---

# Design Verification

Automated visual verification across a 4-condition matrix: light/desktop, dark/desktop, light/mobile, dark/mobile.

## Prerequisites

- A running local dev server or deployed URL to verify against
- The `agent-browser` CLI tool available on PATH

## Script

All automated checks are in `scripts/audit.js`. It returns JSON with keys: `overflow`, `contrast`, `interactiveStates`, `tokens`, `hardcodedColors`.

## Workflow

If a URL is not provided, ask for one before proceeding.

### Step 1: Determine Verification Context

Before launching sub-agents, examine the conversation history to determine what the user was working on. Extract:

- **`focus_elements`**: CSS selectors or component names to apply extra scrutiny to. If the user changed a specific modal, card, or section — capture it. Empty means full-page review only.
- **`interactions`**: States to test beyond the default page load. For example: "hover on .submit-btn", "open the modal by clicking .trigger", "fill the form and check validation". Empty means static review only.
- **`description`**: One sentence describing what changed (e.g., "Restyled the pricing card component").

If the context is ambiguous (e.g., the user says "verify the design" with no prior conversation about what changed), ask the user:
- What page/component did you change?
- Are there specific elements or interactions to focus on?

Format the context as a block to embed in sub-agent prompts:

```
VERIFICATION CONTEXT:
- Description: <description>
- Focus elements: <comma-separated selectors, or "none">
- Interactions: <comma-separated actions, or "none">
```

### Step 2: Launch Sub-Agents

Launch **2 parallel sub-agents** via the Task tool (`subagent_type: "design-verify"`) in a **single message** so they run concurrently. Each agent handles both light and dark mode at its viewport size.

**Dark mode note**: The `set media dark` command emulates `prefers-color-scheme: dark`. If the application uses class-based dark mode (e.g., a `.dark` class on `<html>`, `data-theme="dark"` attribute, or a toggle button), `set media` will have no effect. In that case, the sub-agent should toggle dark mode via the application's own mechanism (e.g., `agent-browser click ".theme-toggle"`). If the verification context mentions how dark mode is toggled, include that in the sub-agent prompts instead of `set media dark`.

**Desktop agent prompt:**

```
PARAMETERS:
- URL: <url>
- Session: dv-desktop
- Viewport: 1920 1080
- Condition prefix: desktop

VERIFICATION CONTEXT:
<context>
```

**Mobile agent prompt:**

```
PARAMETERS:
- URL: <url>
- Session: dv-mobile
- Viewport: 375 812
- Condition prefix: mobile

VERIFICATION CONTEXT:
<context>
```

When building each prompt, replace `<url>` with the actual URL and `<context>` with the verification context block from Step 1.

### Step 2a: Session Cleanup

After both sub-agents return (whether they succeeded or failed), close any leftover browser sessions to avoid resource leaks:

```bash
agent-browser --session dv-desktop close
agent-browser --session dv-mobile close
```

These commands are safe to run even if the sub-agents already closed their sessions — closing an already-closed session is a no-op.

### Step 3: Report

Collect results from both sub-agents. Compile into a single report.

**Parsing sub-agent output**: Each agent returns AUDIT RESULTS (JSON), VISUAL REVIEW (issue list), and optionally TARGETED FINDINGS. Extract and merge these.

**Report format**:

```
## Design Verification Report

### Overflow Issues
- [PASS/FAIL] Desktop: N issues | Mobile: N issues
  - Desktop light: <details>
  - Desktop dark: <details>
  - Mobile light: <details>
  - Mobile dark: <details>

### Contrast (WCAG AA)
- [PASS/FAIL] N total failures across 4 conditions
  - Light desktop: N failures
  - Dark desktop: N failures (N dark-specific)
  - Light mobile: N failures
  - Dark mobile: N failures (N dark-specific)
  - <list critical failures with element, ratio, required>

### Interactive States
- [PASS/FAIL] N of M interactive elements have issues
  - <element>: <missing hover/focus/cursor/disabled styling>

### Design Token Propagation
- [PASS/FAIL] N tokens in use, N broken references, N hardcoded colors (N inline)
  - Broken: <token names>
  - Hardcoded: <selectors or elements with hardcoded values>

### Visual Review
- [PASS/FAIL] N issues found across 4 conditions
  - Critical:
    - <description> (<condition>)
  - Moderate:
    - <description> (<condition>)
  - Minor:
    - <description> (<condition>)

### Targeted Findings (omit if no focus elements were provided)
- <element/selector>:
  - <issue description> (<condition>)

### Summary
- Total checks: 5
- Passed: N
- Failed: N
- Action items:
  1. <numbered list of specific fixes needed>
```

Any issue in any category means FAIL. Every issue found must appear in the action items list.

## Multiple Pages

If multiple pages or routes require verification, repeat Steps 1-2 for each URL before compiling a single combined report in Step 3.

## Script Reference

| Script | Purpose |
|--------|---------|
| [scripts/audit.js](scripts/audit.js) | Full audit: overflow detection, WCAG contrast, interactive states, token propagation, hardcoded colors |
