---
name: auto-improve
description: Start an autonomous improvement loop that spawns agents every 20 minutes to find and fix issues in the current project. Each agent works in an isolated worktree, finds one high-value improvement, validates it, and raises a PR. Use this skill when the user wants to run continuous autonomous improvements, background PR generation, automated code quality sweeps, or hands-free codebase maintenance. Trigger on phrases like "auto improve", "background improvements", "keep finding things to fix", "autonomous PRs", or "improvement loop".
user-invocable: true
---

# Auto-Improve Loop

When invoked, start a recurring loop that autonomously improves the current project by spawning independent agents every 20 minutes. Each agent works in an isolated git worktree so there are no conflicts.

## Context

Project directory: !`pwd`

## Precondition

This skill must be invoked from the `main` or `master` branch. If the current branch is neither, stop and tell the user to switch branches first.

## Execution

1. **Pull latest** — run `git pull` to pick up recently merged PRs. If it fails, stop and tell the user — don't silently continue, since agents would be working on stale code.
2. **Spawn the first agent** using the Agent tool (see Agent Configuration below).
3. **Schedule recurring agents** using CronCreate with `cron: "*/20 * * * *"` and `recurring: true`.
4. **Tell the user** what you've set up: that the first agent is running and new ones will spawn every 20 minutes. Mention they can stop it with Ctrl+C or by asking you to cancel the cron job. Note the 7-day auto-expiry.

For the CronCreate prompt, use the following template. Before setting it up, resolve the two placeholders — use the project directory from the Context section above, and the absolute path to this skill's directory (same directory this SKILL.md lives in):

```
Run `git pull` to pick up recently merged PRs. If it fails, report the error to the user and do NOT spawn an agent. Otherwise, read the agent prompt from <skill-dir>/references/agent-prompt.md and spawn an auto-improve worktree agent. Use the Agent tool with isolation: "worktree", mode: "auto", run_in_background: true, description: "auto-improve". Use the file contents as the prompt, prefixed with "Working directory of the project to improve: <project-dir>".
```

## Agent Configuration

Each agent is spawned with:

- `isolation: "worktree"` — isolated copy of the repo, no conflicts with other agents
- `mode: "auto"` — full autonomy to make changes and create PRs without asking
- `run_in_background: true` — don't block the session waiting for it to finish
- `description: "auto-improve"` — identifies the agent in task listings

The agent's prompt should be the contents of [references/agent-prompt.md](references/agent-prompt.md), prefixed with "Working directory of the project to improve: " followed by the project directory from the Context section.

## When Agents Complete

When a background agent finishes, you'll receive a notification. Handle it based on the result:

- **Agent raised a PR**: Reset the consecutive "no improvements" counter to 0. Clean up the worktree.
- **Agent found no improvements** (look for "NO_IMPROVEMENTS_FOUND" in the result): Increment the consecutive "no improvements" counter. Clean up the worktree. If the counter reaches **3**, cancel the cron job with CronDelete and tell the user: "Three consecutive agents found no improvements — stopping the loop. The codebase looks clean."

## Worktree Cleanup

After each agent completes, clean up its worktree to prevent them accumulating on disk. The agent completion notification includes `worktreePath` and `worktreeBranch`. Run:

```bash
git worktree remove <worktreePath>
git branch -D <worktreeBranch>
```
