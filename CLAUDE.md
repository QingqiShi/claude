Keep one commit per PR: fold follow-up changes into it (amend, force-with-lease) and update the description.

A "mergeable" PR is one that literally can be merged right now: CI is green, there are no conflicts with the base branch, and nothing else blocks the merge button.

In a worktree, use `git checkout origin/main` instead of `git checkout main`, because another worktree usually has `main` checked out.

Code should be self-documenting. Only add a comment for something truly unexpected, unconventional, or instruction-violating that needs the "why" explained, and write it in ASD-STE100 Simplified Technical English.

A CONTEXT.md or CONTEXT-MAP.md holds a repository's domain language, so that you and the user mean the same thing by the same word. Use its terms in code, comments, copy, and replies.

# Session Memory (main agent only)

Keep a HANDOFF.md file current so that a new session after `/clear` can continue where this one stopped. It holds what that session cannot read from the code: where the work is heading, how far it has come, and what is in flight. A sub-agent can read the file when you tell it to.

Use exactly these headings, in this order. A new session reads the whole file before it starts, so keep it short: when it grows, shorten `## Done` first, because `## Now` is what that session works from.

- `## North Star` — what the user is trying to achieve, in a sentence or two, close to their own words. It is the purpose behind the tasks, not a task, so that the user's next prompt still fits under it: "make checkout faster", not "add an index to the orders table". A new task, the next phase, or feedback on delivered work changes `## Now` and leaves the north star as it is. It changes only when the user changes what they want, or when a prompt shows that it was written too narrow.
- `## Done` — what we did to move closer to the north star, from the approach down to the implementation, still fairly high level. Include an approach that was tried and dropped, and why, because the code does not show it. Detail fades with age: the longer ago something happened, the shorter its entry, until old iterations share one line.
- `## Now` — the work in flight, with every detail a new session needs to continue it. Say what finishes each piece of work; when that happens, its details go and it becomes a sentence in `## Done`.

Update it only at natural stopping points: a sub-agent reports back, a milestone lands, the user changes the goal, or you are about to start something long or risky.

A restarted session treats the file as its source of truth, so edit what changed, delete what is stale, and leave the rest as written.

# Agent Orchestration (main agent only)

Make a plan before a large task, but never use Plan Mode.

Your primary responsibility is to orchestrate sub-agents, in order to minimise context rot.

Delegate by what a tool call leaves behind, not by what it costs: each call looks cheap on its own, but its output stays in your context for the rest of the session, while a sub-agent's report is a paragraph. Keep a call only when you must see its result to decide the next step.

A red-green loop is never main-agent work: only the final green matters to you, and every build, run and fix in between would stay in your context. When a task needs that loop, hand a sub-agent the goal and the acceptance criteria.

Tell each sub-agent in its prompt that it is a sub-agent, so that it knows which sections apply to it.

Pass the `model` parameter explicitly when you create a sub-agent, unless its definition declares one. Judge the model by the cost of the completed task, not of the request: a rerun after a wrong result costs more than the stronger model would have, and a stronger model on work a weaker one does reliably is overspend. You already know what each model is good at; per token, Fable costs about twice Opus, five times Sonnet and ten times Haiku.

Before you send a message to a sub-agent that has already finished, consider that its context window may be full and costly to resume; a fresh sub-agent is often cheaper. A short message is still worth it when the sub-agent finished without reporting.
