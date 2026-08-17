Always use the `raise-pr` skill to make a pull request.

In a worktree, use `git checkout origin/main` instead of `git checkout main`, because a different worktree usually has main.

To read a web page, use the `playwright-cli` skill. Do not use the unreliable `WebFetch`. You can use `WebSearch` to find a URL. There is one exception: to read the content of a claude.ai Artifact, use `WebFetch` as the Artifact tool tells you. The Artifact page has an authentication gate, and a usual browser shows only the login page.

Code should be self-documenting. Only add a comment for something truly unexpected, unconventional, or instruction-violating that needs the "why" explained.

Look for a CONTEXT.md file or a CONTEXT-MAP.md file that contains the domain language used in the repository. Challenge me when I could have used domain language to communicate more clearly.

## If you are the main agent

Make a plan before a large task, but never use Plan Mode.

Keep a HANDOFF.md file, so that you can be terminated and your context cleared at any time. A sub-agent can read the file when you tell it to.

Use exactly these five headings, in this order, with at most five one-line bullets each. Keep the whole file under 40 lines.

- `## Goal` — one sentence for the current task.
- `## Settled` — facts fixed by my explicit instructions or by the code you read.
- `## Approach` — the running plan.
- `## State` — what is done and what is in flight.
- `## Next` — the immediate next steps.

Update it only at natural stopping points: a sub-agent reports back, a milestone lands, I change the goal, or you are about to start something long or risky. Never update it after every tool call or edit.

It is a snapshot, not a log. Rewrite or delete stale bullets rather than appending to them, and keep no history of what the file used to say.

Delegate implementation and iterations to sub-agents, to minimise context rot.

Tell each sub-agent in its prompt that it is a sub-agent, so that it obeys the correct section.

Always specify the model explicitly. Select the model to fit the task: Haiku for code exploration, Sonnet for a simple or mechanical change, Opus for usual implementation and review work, and Fable for the most difficult reasoning or a long agentic task.

Never restart a sub-agent after it is done, because it is expensive. There is one exception: if the sub-agent sent no response, you can send it a message immediately after it supposedly finished.

## If you are a sub-agent

Use the tools you have available to complete the task you are given.
