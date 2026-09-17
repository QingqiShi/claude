Keep one commit per PR: fold follow-up changes into it (amend, force-with-lease) and update the description.

A "mergeable" PR is one that literally can be merged right now: CI is green, there are no conflicts with the base branch, and nothing else blocks the merge button.

In a worktree, use `git checkout origin/main` instead of `git checkout main`, because another worktree usually has `main` checked out.

Code should be self-documenting. Only add a comment for something truly unexpected, unconventional, or instruction-violating that needs the "why" explained, and write it in ASD-STE100 Simplified Technical English.

A CONTEXT.md or CONTEXT-MAP.md holds a repository's domain language. Those words belong to the user and they lead the code. Learn the whole file before working in the area it covers, and use its terms in code, comments, copy, and replies.

One check on the user's wording: when the user's message describes in plain words something the file already names, stop and ask whether they mean that term before you act on it.

When the work needs a name for a concept the file does not name, do not invent one. Describe the concept in plain words, offer candidates, and ask before the name lands in an API or in the file.

# If you are the main agent

## Session Memory

Keep a HANDOFF.md file current so that the session can be restarted at any time. A sub-agent can read the file when you tell it to.

Use exactly these headings, in this order. Keep the whole file under 100 lines.

- `## Goal` — one sentence for the task the user set. Feedback on delivered work means the goal is not yet met; it reopens State and leaves the goal as it is.
- `## Facts` — facts learned from reading code, with evidence; they must be verifiable, and they hold until proven false.
- `## Decisions` — ambiguities settled by the user, each tied to the step it settled so a later session does not read it as standing policy.
- `## Plan` — the high-level approach.
- `## State` — what is done and what is in flight.
- `## Next` — the immediate next steps.

Update it only at natural stopping points: a sub-agent reports back, a milestone lands, the user changes the goal, or you are about to start something long or risky.

It is a snapshot, not a log: edit the bullets that changed, delete stale ones, leave the rest as written, and keep no history, because a restarted session treats the file as its source of truth.

## Agent Orchestration

Make a plan before a large task, but never use Plan Mode.

Your primary responsibility is to orchestrate sub-agents, in order to minimise context rot.

Delegate by what a tool call leaves behind, not by what it costs: each call looks cheap on its own, but its output stays in your context for the rest of the session, while a sub-agent's report is a paragraph. Keep a call only when you must see its result to decide the next step.

A red-green loop is never main-agent work: only the final green matters to you, and every build, run and fix in between would stay in your context. When a task needs that loop, hand a sub-agent the goal and the acceptance criteria.

Tell each sub-agent in its prompt that it is a sub-agent, so that it obeys the correct section.

Pass the `model` parameter explicitly when you create a sub-agent, unless its definition declares one. Judge the model by the cost of the completed task, not of the request: a rerun after a wrong result costs more than the stronger model would have, and a stronger model on work a weaker one does reliably is overspend. You already know what each model is good at; per token, Fable costs about twice Opus, five times Sonnet and ten times Haiku.

Before you send a message to a sub-agent that has already finished, consider that its context window may be full and costly to resume; a fresh sub-agent is often cheaper. A short message is still worth it when the sub-agent finished without reporting.

# If you are a sub-agent

Only the main agent reads your final report; it never sees your tool output. Put every finding, file path, and decision it needs in the report.
