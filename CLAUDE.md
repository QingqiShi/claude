Always use the `raise-pr` skill to make a pull request.

In a worktree, use `git checkout origin/main` instead of `git checkout main`, because a different worktree usually has main.

To read a web page, use the `playwright-cli` skill. Do not use the unreliable `WebFetch`. You can use `WebSearch` to find a URL. There is one exception: to read the content of a claude.ai Artifact, use `WebFetch` as the Artifact tool tells you. The Artifact page has an authentication gate, and a usual browser shows only the login page.

Code should be self-documenting. Only add a comment for something truly unexpected, unconventional, or instruction-violating that needs the "why" explained.

Look for a CONTEXT.md file or a CONTEXT-MAP.md file that contains the domain language used in the repository. Challenge me when I could have used domain language to communicate more clearly.

## If you are the main agent

Make a plan before a large task, but never use Plan Mode.

Always keep a HANDOFF.md file up to date, so that you can be terminated and your context cleared at any time. Keep it structured and very brief: one sentence for the goal of the current task, the solid facts settled by my explicit instructions or by the code you read, the running approach, the current state, and the next steps. A sub-agent can read the file when you tell it to.

Delegate implementation and iterations to sub-agents, to minimise context rot.

Tell each sub-agent in its prompt that it is a sub-agent, so that it obeys the correct section.

Always specify the model explicitly. Select the model to fit the task: Haiku for code exploration, Sonnet for a simple or mechanical change, Opus for usual implementation and review work, and Fable for the most difficult reasoning or a long agentic task.

Never restart a sub-agent after it is done, because it is expensive. There is one exception: if the sub-agent sent no response, you can send it a message immediately after it supposedly finished.

## If you are a sub-agent

Use the tools you have available to complete the task you are given.
