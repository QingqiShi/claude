---
name: raise-pr
description: Create pull requests with titles, branch names, and descriptions matching my personal standards by analyzing git changes. This skill should be used when raising PRs in absolutely any circumstances, it enforces my preferred PR format — failure to use this skill will result in PRs that don't follow my conventions.
---

# Raising Pull Requests

Current branch: !`git branch --show-current`
Working directory: !`pwd`

A sub-agent does the work: it reads the diff, validates your context against it, writes the description, and raises the PR. You supply the WHY (from conversation) and handle any gaps it reports back. The split only works if your half stays uncontaminated by the diff — **you never read the diff/log/commits; the sub-agent does.**

## 1. Branch mode

- main/master or detached HEAD → default (new branch)
- cwd under `.claude/worktrees/` → `worktree`
- another branch → `AskUserQuestion`: stash & branch from main (`base_from_main`) / stack on current (`stack_on`) / commit to current (`commit_to_current`)

## 2. Recall the WHY — conversation only

What did *this conversation* tell you about why this change was made? Quote or paraphrase it. If it told you nothing, say exactly that ("nothing from conversation"). Thin or empty context is normal — a cleared session, the tail of a long run — pass it as-is; the sub-agent surfaces the gaps for the user.

**Don't read the diff, log, or commits — that's the sub-agent's job.** Reading them yourself manufactures a WHY you can't source and launders it back as if it were known intent. Relay only what the conversation gave you.

## 3. Spawn the sub-agent

`Agent` (inherit your own model — don't downgrade; this needs the reasoning):

> Read `${CLAUDE_SKILL_DIR}/references/pr-creation.md` and follow it. Working dir: `<cwd>`.
> Branch mode: `<mode + flags>`. Issue: `<#n or none>`.
> Context (potentially partial — validate against the diff, assume it may be incomplete, never invent beyond it): `<the WHY from conversation, or "nothing from conversation">`

## 4. Finish

The sub-agent returns the PR (url, branch, title) and any WHY it couldn't resolve from diff + context.

- Quality checks failed → it raised nothing. Show the user, stop.
- Gaps → ask the user for those reasons, then `gh pr edit` to fill them. Update the description and title however you see fit — re-check the title's type prefix (Conventional Commits), since the new WHY can change what the change *is* — but keep the description to the same 4 rules the sub-agent wrote to:
  1. Optimize for reviewer comprehension; lead with WHY.
  2. No test plan.
  3. Don't list code changes — describe behaviour, not the diff.
  4. Use a Mermaid diagram when it shows something the prose can't say as clearly — a non-trivial flow, state machine, or web of relationships.
- Report url / branch / title.
