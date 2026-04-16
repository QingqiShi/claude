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

> **You are analyzing staged changes in a git repository to produce a structured factual description of the diff. Do not create branches, commits, or PRs. Do not speculate about why the change was made — only describe what it does.**
>
> Read the file at `${CLAUDE_SKILL_DIR}/references/analysis.md` and follow its instructions. The working directory is `<working_directory>`.

Do **not** pass conversation context to the sub-agent. The sub-agent's job is to report what the diff does, factually — the WHY comes from you (step 3). Giving it conversation context tempts it to launder your hypotheses back to you as if it had verified them.

The sub-agent will stage files, run quality checks, read the diff, and return a structured analysis with WHAT, CHANGE_TYPE, and QUALITY fields.


### 3. Determine the WHY

The analysis sub-agent reports **what** the diff does. **You** are responsible for the **why** — the motivation, which only the conversation can supply. Reviewers can read the diff to see what changed; the PR description exists to tell them what the diff cannot show.

**If quality checks failed**: Show the failures to the user and stop.

#### Where the WHY must come from

Exactly two valid sources:

1. **The user stated it** in this conversation (or an earlier one you have context for). Direct quotes or clear paraphrases of their stated reason.
2. **It is genuinely self-evident from the diff itself** — a literal typo fix, a null guard for an obvious crash, a dependency version bump. "Self-evident" means a reasonable engineer reading only the diff would arrive at the same single reason. If multiple plausible reasons exist, it is NOT self-evident — even if one of them feels likely.

That's it. There is no third source. You do not get to invent a WHY because one sounds plausible, because the change "obviously" cleans something up, or because the sub-agent's WHAT description suggests a motivation. If you find yourself reaching for phrases like "keeps the codebase clean", "improves maintainability", "removes ad-hoc/legacy code", "follows best practices", or "no place in source control" — stop. Those are template rationalizations that fill the gap when you don't actually know. The right move is to ask.

#### Decision

- **WHY came from the user OR is genuinely self-evident** → proceed to step 4.
- **Otherwise** → use `AskUserQuestion` to ask the user for the reason. State the WHAT (from the sub-agent) so they know what you're describing, and ask why they made the change. Once they respond, use their answer as the WHY and proceed to step 4.

The default when in doubt is to ask. A 10-second clarifying question is far cheaper than a PR description that misrepresents the user's intent.

#### Bare directives ALWAYS require asking

If the user's request was a bare directive with no stated reason, you must ask. Examples:

- "remove X" / "delete Y" / "drop Z" — could be cleanup, perf, conflict resolution, tooling friction, etc.
- "rename X to Y" — could be clarity, convention, conflict, refactor.
- "move X into Y" — could be organization, dependency direction, reuse.
- "switch from X to Y" — could be perf, cost, deprecation, ergonomics.
- "add X" without context — could be a feature ask, a workaround, a debugging aid.

The fact that the change executed cleanly does not tell you the WHY. Ask.

### 4. Spawn PR Creation Sub-Agent

Use the `Agent` tool with `model: sonnet` to spawn a sub-agent. Prompt it:

> **You are creating a pull request from already-analyzed changes. Do not re-analyze the changes or modify any source files.**
>
> Read the files at `${CLAUDE_SKILL_DIR}/references/pr-creation.md` and `${CLAUDE_SKILL_DIR}/references/examples.md`, then follow the instructions in pr-creation.md to create a pull request.
>
> Analysis:
> - Summary: <compose by combining the WHY (from step 3 — user-stated reason or self-evident motivation) with the WHAT (from the sub-agent's analysis). Lead with the WHY. Do not paste the sub-agent's WHAT verbatim if it lacks the WHY — you must add it.>
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
