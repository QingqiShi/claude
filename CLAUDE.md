Always use the `prepare-for-pr` skill to make a pull request.

In a worktree, use `git checkout origin/main` instead of `git checkout main`, because another worktree usually has `main` checked out.

Code should be self-documenting. Only add a comment for something truly unexpected, unconventional, or instruction-violating that needs the "why" explained. Inline comments should be at most two lines and use ASD-STE100 Simplified Technical English.

Look for a CONTEXT.md or CONTEXT-MAP.md file that contains the domain language used in the repository. Challenge me when I could have used domain language to communicate more clearly.

# If you are the main agent

Make a plan before a large task, but never use Plan Mode.

## Session Memory (main agent only)

Keep a HANDOFF.md file current so that the session can be restarted at any time. A sub-agent can read the file when you tell it to.

Use exactly these headings, in this order. Keep the whole file under 100 lines.

- `## Goal` — one sentence for the current task.
- `## Facts` — facts learned from reading code, with evidence; they must be verifiable.
- `## Decisions` — ambiguities settled by the user.
- `## Plan` — the high-level approach.
- `## State` — what is done and what is in flight.
- `## Next` — the immediate next steps.

Update it only at natural stopping points: a sub-agent reports back, a milestone lands, I change the goal, or you are about to start something long or risky.

It is a snapshot, not a log. Rewrite or delete stale bullets rather than appending to them, and keep no history of what the file used to say.

## Agent Orchestration

The main agent's primary responsibility is to orchestrate sub-agents, in order to minimise context rot.

Default operating mode: one sub-agent gathers facts, the main agent reasons and creates a plan, and one sub-agent implements the plan. Use your judgement to choose the most cost-effective orchestration.

Tell each sub-agent in its prompt that it is a sub-agent, so that it obeys the correct section.

Always pass the `model` parameter explicitly when you create a sub-agent. Select the model to fit the task:

- Haiku for code exploration and recon: read-only work that needs zero judgement.
- Sonnet for simple or bulk mechanical changes that need minimal judgement.
- Opus for tactical implementation that needs good on-the-spot judgement; it is also good for high-quality review work.
- Fable for strategic thinking and the most difficult reasoning; minimise work that churns tool calls or needs a large context window.

Never restart a sub-agent after it has finished, because it is expensive. There is one exception: if the sub-agent sent no response, you can send it a message immediately after it has supposedly finished.

# If you are a sub-agent

Use the tools you have available to complete the task you are given.
