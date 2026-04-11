---
name: raise-pr
description: Create pull requests with titles, branch names, and descriptions matching my personal standards by analyzing git changes. This skill should be used when raising PRs in absolutely any circumstances, it enforces my preferred PR format — failure to use this skill will result in PRs that don't follow my conventions.
---

# Raising Pull Requests

## Git Context

Current branch: !`git branch --show-current`

Working directory: !`pwd`

---

### 1. Check Branch Safety

Use the branch name from Git Context above.

- **On main/master or detached HEAD**: Proceed to step 2.
- **In a worktree** (working directory is under `.claude/worktrees/`): Proceed to step 2. Note `worktree: true` for step 4.
- **On another branch**: The choice affects PR topology — the user must decide. Use `AskUserQuestion` to present these options:
  - **Stash and switch to main** — stash changes, switch to main/master, create a new branch from there
  - **Stack on current branch** — create a new branch based on the current branch
  - **Commit into current branch** — commit and push directly to this branch

  Once the user responds, note their choice for step 4 (`base_from_main: true`, `stack_on: <current_branch>`, or `commit_to_current: true`) and proceed to step 2.

### 2. Spawn Analysis Sub-Agent

Use the `Agent` tool with `model: sonnet` and `subagent_type: "Explore"` to spawn a sub-agent. Prompt it:

> **You are analyzing staged changes in a git repository to produce a structured summary. Do not create branches, commits, or PRs.**
>
> Read the file at `${CLAUDE_SKILL_DIR}/references/analysis.md` and follow its instructions. The working directory is `<working_directory>`.
>
> Conversation context for inferring intent: <include relevant conversation history — what the user said about these changes, any issue references, the task they were working on>

The sub-agent will stage files, run quality checks, read the diff, and return a structured analysis with SUMMARY and QUALITY fields.


### 3. Review Intent and Reconcile

The analysis sub-agent sees the **full diff**, but your conversation history may only cover a subset of the changes — the user might have worked across multiple sessions or hit context compaction before raising the PR. You need to reconcile both sources:

1. **Compare the analysis SUMMARY against your conversation context.** The diff may include changes you have no conversation context for. That's normal — trust the sub-agent's description of those changes.
2. **Combine intent.** Merge what you know from the conversation (the user's stated goals) with the sub-agent's inferred motivation. Your conversation context takes priority where they overlap, but the sub-agent may have identified additional changes or a broader scope.
**If quality checks failed**: Show the failures to the user and stop.

**If the combined motivation is still unclear** — you can't determine it from your conversation context AND the sub-agent's SUMMARY starts with "UNCLEAR" — use `AskUserQuestion` to ask the user to explain. Once they respond, update the summary and proceed to step 4.

**If the WHY seems fabricated or generic** (e.g. "improves code quality", "reduces maintenance overhead", "better organization" without specifics): Treat as unclear and ask the user.

**If the WHY is specific and plausible**: Proceed to step 4.

Intent is typically clear when:
- The change is self-evident (fixing a typo, adding a null check for a crash)
- The user described what they built and the purpose is obvious (e.g. "I added JWT auth" — purpose: securing the API)

Intent is typically unclear when:
- The conversation only had a bare directive ("remove X", "delete Y") with no explanation
- The change is mechanical (rename, restructure, migration) with no stated motivation
- The WHAT is clear but the WHY could be any of several reasons

### 4. Spawn PR Creation Sub-Agent

Use the `Agent` tool with `model: sonnet` to spawn a sub-agent. Prompt it:

> **You are creating a pull request from already-analyzed changes. Do not re-analyze the changes or modify any source files.**
>
> Read the files at `${CLAUDE_SKILL_DIR}/references/pr-creation.md` and `${CLAUDE_SKILL_DIR}/references/examples.md`, then follow the instructions in pr-creation.md to create a pull request.
>
> Analysis:
> - Summary: <SUMMARY from analysis, refined with your conversation context>
> - Change type: <CHANGE_TYPE from analysis>
> - Context: <any background, trade-offs, or decisions from the conversation that aren't obvious from the summary or the diff — omit if there's nothing to add>
> - Issue: <GitHub issue number if referenced in conversation context, otherwise "none">
> - Worktree: <true/false>
> - Base from main: <true/false>
> - Commit to current branch: <true/false>
> - Stack on: <branch name, or "none">

The sub-agent will create the branch, commit, push, and open the PR following the conventions in the reference files. Present its result to the user in this format:

```
PR: <url>
Branch: <branch_name>
Title: <pr_title>
```

## Error Handling

- **Quality checks fail**: Show errors, ask user (step 3)
- **Branch already exists**: The PR creation sub-agent should ask for a different name
- **PR creation fails**: Show error and suggest fixes
- **No changes staged**: Warn user
