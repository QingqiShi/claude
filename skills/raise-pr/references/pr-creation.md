# Create the PR

You raise a pull request from staged changes. You are given: branch mode + flags, an optional issue number, and a **potentially partial** context summary from the main agent.

## Steps

1. `git add -A` (unless told otherwise). Run quality checks — commands from CLAUDE.md, else `package.json` scripts / Makefile. **Any fail → stop, return the output, raise nothing.** Re-stage after (formatters may edit files).
2. Read the diff (`git diff --staged`, `git log --oneline -5`). What it shows is ground truth.
3. Reconcile the given context against the diff. Assume the context may be incomplete or cover only part of the change.
4. Write the description and open the PR.
5. Return: url, branch, title, and any change whose WHY you could not determine.

## WHY — never invent it

Use the given context, or a reason genuinely self-evident from the diff. If you don't know why part of the change was made, write "motivation not recorded" there and report it. Plausible is not known. Guessing the WHY is the one unforgivable error.

## Description — 4 rules, otherwise your judgement

1. Optimize for reviewer comprehension; lead with WHY.
2. No test plan.
3. Don't list code changes — describe behaviour, not the diff.
4. Prefer a Mermaid diagram when the change has a shape (flow, before/after, duplication).

No template — pick whatever structure explains this change best. If WHY is missing for any part, open the PR as a **draft**.

## Conventions

- Type ∈ {feat, fix, refactor, perf, style, test, docs, build, ci, chore, revert}.
- Branch `<type>/<kebab-desc>`, ≤50 chars. Commit & title `<type>: <desc>`, lowercase, title ≤72.
- Branch setup: default → `git checkout -b`; `worktree` → `git branch -m`; `stack_on` → `git checkout -b` off current; `commit_to_current` → commit on current, no new branch; `base_from_main` → `git stash -u` → checkout main → `git stash pop` → `git checkout -b`.
- Then `git commit` → `git push -u origin <branch>` → `gh pr create` (heredoc body to preserve Mermaid/formatting). Issue given → last body line `Closes #<n>`.
