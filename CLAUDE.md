The user steers through Remote Control and cannot see this Mac. When a repository's recent commits came through PRs, take each change to an open PR with `prepare-for-pr`, without asking: that is their request to commit, push and open it. Otherwise, show the diff in your reply.

Keep one commit per PR: fold follow-up changes into it (amend, force-with-lease) and update the description.

A "mergeable" PR is one that literally can be merged right now: CI is green, there are no conflicts with the base branch, and nothing else blocks the merge button.

In a worktree, use `git checkout origin/main` instead of `git checkout main`, because another worktree usually has `main` checked out.

Under `vercel env run`, `node` runs the Vercel CLI, so `vercel env run -- node <file>` deploys that file to a new Vercel project without asking; use `pnpm exec tsx <file>` there instead.

Code should be self-documenting. Only add a comment for something truly unexpected, unconventional, or instruction-violating that needs the "why" explained, and write it in ASD-STE100 Simplified Technical English.

# Session Memory (main agent only)

Keep a handoff file current so that the session after `/clear` can continue where this one stopped. It holds what that session cannot read from the code: where the work is heading, how far it has come, and what is in flight. A sub-agent can read the file when you tell it to.

A SessionStart hook names the file's path. In the desktop app, each sidebar session has its own file, which stays the same across `/clear` and compaction, so other sessions in the same folder never touch it. In a terminal, the file is HANDOFF.md at the repository root.

Use exactly these headings, in this order. A new session reads the whole file before it starts, so keep it short: when it grows, shorten `## Done` first, because `## Now` is what that session works from.

- `## North Star` — what the user is trying to achieve, in a sentence or two, close to their own words. It is the purpose behind the tasks, not a task, so that the user's next prompt still fits under it: "make checkout faster", not "add an index to the orders table". A new task, the next phase, or feedback on delivered work changes `## Now` and leaves the north star as it is. It changes only when the user changes what they want, or when a prompt shows that it was written too narrow.
- `## Done` — what we did to move closer to the north star, from the approach down to the implementation, still fairly high level. Include an approach that was tried and dropped, and why, because the code does not show it. Detail fades with age: the longer ago something happened, the shorter its entry, until old iterations share one line.
- `## Now` — the work in flight, with every detail a new session needs to continue it. Say what finishes each piece of work; when that happens, its details go and it becomes a sentence in `## Done`.

Update it only at natural stopping points: a sub-agent reports back, a milestone lands, the user changes the goal, or you are about to start something long or risky.

A restarted session treats the file as its source of truth, so edit what changed, delete what is stale, and leave the rest as written.

# Agent Orchestration (main agent only)

Make a plan before a large task, but never use Plan Mode.

Keep code edits and judgment calls yourself. Give a sub-agent the verbose reading whose output you do not need to see in full: finding files, reading logs, running a suite and reporting the failures. Pass `model` on each one, built-in types such as Explore included, because without it the sub-agent runs on your model: `haiku` when a mistake is cheap to spot, `sonnet` when the reading needs some investigation.

Tell each sub-agent in its prompt that it is a sub-agent, so that it knows which sections apply to it.
