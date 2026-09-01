---
name: raise-pr
description: Writes the pull request title, branch name, and description in my personal format by analysing git changes, then raises it. Normally invoked by prepare-for-pr, which reviews the change and drives CI first.
---

# Raising Pull Requests

Current branch: !`git branch --show-current`
Working directory: !`pwd`

A sub-agent does the work: it reads the diff, validates your context against it, writes the description, and raises the PR. You supply the WHY (from conversation) and handle any gaps it reports back. The split only works if your half stays uncontaminated by the diff — **you never read the diff/log/commits; the sub-agent does.**

## 1. Branch mode

- main/master or detached HEAD → default (new branch)
- cwd under `.claude/worktrees/` or an orca worktree (path contains `orca/workspaces/`) → `worktree`
- another branch → `AskUserQuestion`: stash & branch from main (`base_from_main`) / stack on current (`stack_on`) / commit to current (`commit_to_current`)

## 2. Recall the WHY — conversation only

What did *this conversation* tell you about why this change was made? Quote or paraphrase it. If it told you nothing, say exactly that ("nothing from conversation"). Thin or empty context is normal — a cleared session, the tail of a long run — pass it as-is; the sub-agent surfaces the gaps for the user.

**Don't read the diff, log, or commits — that's the sub-agent's job.** Reading them yourself manufactures a WHY you can't source and launders it back as if it were known intent. Relay only what the conversation gave you.

## 3. Spawn the sub-agent

`Agent` with `model: sonnet`:

> Read `${CLAUDE_SKILL_DIR}/references/pr-creation.md` and follow it. Working dir: `<cwd>`.
> Branch mode: `<mode + flags>`. Issue: `<#n or none>`.
> Context (potentially partial — validate against the diff, assume it may be incomplete, never invent beyond it): `<the WHY from conversation, or "nothing from conversation">`
> Screenshots already captured this session: `<paths + what each shows, or "none">`

Screenshots are the one thing you can hand over beyond the WHY — if this session already shot the UI, pass the paths so the sub-agent reuses them instead of re-running the app. Listing files you saved is not reading the diff.

## 4. Finish

The sub-agent returns the PR (url, branch, title) and any WHY it couldn't resolve from diff + context.

- Quality checks failed → it raised nothing. Show the user, stop.
- Gaps → ask the user for those reasons, then `gh pr edit` to fill them. Update the description and title however you see fit — re-check the title's type prefix (Conventional Commits), since the new WHY can change what the change *is* — but keep the description to the same 5 rules the sub-agent wrote to:
  1. Optimize for reviewer comprehension; lead with WHY.
  2. No test plan.
  3. Write about the change that a user of the app can see. Do not write about the code. The rule is the same for sentences and for lists.
  4. Use a Mermaid diagram when it shows something the prose can't say as clearly — a non-trivial flow, state machine, or web of relationships.
  5. Show a before/after comparison for user-facing visual changes, high up. Keep any `<img>` tags the sub-agent added — re-uploading is wasteful and the old URLs stay live.

  Remove the parts that the reviewer does not need. Write about the change. Do not write about your work on the change. Do not write about a task that you did not do. Do not write about a method that you did not use. Do not write about the limits of the change. Write about one of these three items only if it changes what the reviewer must do.

  Write each paragraph of the description on one line. Do not break a paragraph into short lines.
- Report url / branch / title.
