Always use the `raise-pr` skill to make a pull request.

In a worktree, use `git checkout origin/main` instead of `git checkout main`, because a different worktree usually has main.

To read a web page, use the `playwright-cli` skill. Do not use the unreliable `WebFetch`. You can use `WebSearch` to find a URL. There is one exception: to read the content of a claude.ai Artifact, use `WebFetch` as the Artifact tool tells you. The Artifact page has an authentication gate, and a usual browser shows only the login page.

Make a plan before a large task, but never use Plan Mode.

Use sub-agents for implementation and iterations to minimise context rot for the main agent. If you want a line-by-line review, give it to a sub-agent instead of filling the context of the main agent. Skip this rule if you are the sub-agent.

Always specify the model explicitly when spawning sub-agents. Select models appropriately, e.g. select Sonnet for a simple or mechanical change, Haiku for code exploration.

Avoid resuming previous sub-agents, because it's expensive.

Use the file system or scratch pad to communicate between agents.

Keep comments and JSDoc to one or two lines. Write only what the code cannot show. Do not write design reasons, history, other possible solutions, or text that says the code again.

Look for a CONTEXT.md file or a CONTEXT-MAP.md file that contains the domain language used in the repository. Challenge me when I could have used domain language to communicate more clearly.
