# PR Creation Conventions

You are creating a pull request. You will be given an analysis containing: a change type, type-appropriate content fields (either `Bug` + `Fix` for the Fix template, or `Summary` for the Summary template), optional `Notes`, optional GitHub issue number, and branch-mode flags (worktree, base_from_main, commit_to_current, stack_on). Follow these conventions exactly.

## Change Types

Valid types: `feat`, `fix`, `refactor`, `perf`, `style`, `test`, `docs`, `build`, `ci`, `chore`, `revert`

## Branch Name

Format: `<type>/<description-in-kebab-case>`

- Max 50 characters
- Type must be one of the valid types above
- Description is a short kebab-case summary

## Commit Message

Format: `<type>: <short description>`

- Lowercase, imperative mood
- Same type as branch

## PR Title

Format: `<type>: <short description>`

- Lowercase
- Max 72 characters
- Same type as branch

## PR Body

The body structure depends on the change type. Pick the template that matches.

### Fix template

Applies to non-trivial `fix` PRs. Separates *what was broken* from *what you did about it* — they answer different questions for the reviewer.

```markdown
## The bug

<What was broken, with just enough mechanic for the reviewer to understand the severity and follow the fix. If the mechanic is flow-shaped (race, sequence, state transition), use a Mermaid diagram — see "Diagrams for complex flows" below.>

## The fix

<What changed and why this approach. The diff shows the code — this section names the decision.>

## Notes

<!-- optional — only include if a Notes field was provided in the analysis input. Omit this entire section otherwise. -->

<Rejected alternatives, test utilities, follow-ups, or trade-offs not visible in the diff.>
```

### Summary template

Applies to `feat`, `refactor`, `perf`, `style`, `test`, `docs`, `build`, `ci`, `chore`, `revert`. These rarely have a "problem state" distinct from the motivation, so a single narrative works better than a forced split.

```markdown
## Summary

<Short prose (2-5 sentences) covering WHY and WHAT. For bundled multi-change PRs, use a one-sentence scope line followed by bulleted items — see "Length and structure" below.>

## Notes

<!-- optional — only include if a Notes field was provided in the analysis input. Omit this entire section otherwise. -->

<Trade-offs, rejected alternatives, or non-obvious decisions. For multi-step design discussions, use a numbered list of iterations followed by a short takeaway paragraph.>
```

### Trivial changes

A typo, a one-line null guard, a dependency version bump — collapse to a single `## Summary` section with one sentence, regardless of change type. See Example 4.

---

Whichever template you use: explain **why** the change was made, not just what files changed. Reviewers can see the diff — tell them what the diff can't show.

### Length and structure

These rules apply to the Summary template's `## Summary` section. The Fix template's `## The bug` and `## The fix` sections should each stay tight — typically 2-3 sentences per section — since the split already separates the two concerns; do not bullet them.

The default for `## Summary` is short prose (2-5 sentences). Use prose for any PR with a single coherent purpose, even if it touches multiple files or adds multiple related rules.

**Switch to list format only when the PR genuinely bundles independent changes.** Apply this test before counting items:

> Could each item have plausibly shipped as its own PR with its own description?

If yes for 3+ items, use list format. If no, it's one change — use prose. A PR that adds rule A, rule B, and an example demonstrating both is **one change** with three components, not three changes. A PR that adds dedupe to the Planner *and* cost capture to the eval infra *and* an unrelated operator polish is **three changes** — each could ship alone.

Concrete signals the items are genuinely independent:

- They affect different subsystems with no shared motivation
- They were held pending separate validation and shipped together for convenience, not because they belong together
- The Summary would naturally read as "X, and also Y, and also Z" rather than "X (which requires Y and is demonstrated by Z)"

Also use list format when the Notes section narrates a **multi-step design process** (iterations, rejected alternatives, rule changes) — even if the Summary stays prose.

When using list format:

- **Summary**: open with one sentence stating the scope ("Bundles N improvements to X, held pending Y."), then a bulleted list. Each bullet starts with a **bold label** naming the change, followed by an em-dash and one sentence. If the changes naturally cluster (by component, layer, or concern), group them under bold subheadings — otherwise flat bullets.
- **Notes**: if the section narrates an iterative design discussion, use a **numbered list** for the iterations (one line each), then a short paragraph for the takeaway. Do not retell the conversation blow-by-blow.

A Summary listing 3+ genuinely independent items as prose is not allowed — convert to bullets. But never bullet a Summary just because the diff touches three files or adds three related rules — that's still one change. See Example 5 in `examples.md` for the genuine bundled case.

### Diagrams for complex flows

When a section would otherwise need dense technical prose to describe a race, a multi-step sequence across components, a state transition, or a before/after structural change — use a Mermaid diagram. GitHub renders Mermaid natively in PR bodies (` ```mermaid ` fenced blocks). Diagrams most often belong in the Fix template's `## The bug` section, where flow-shaped mechanics usually live, but they can appear anywhere a flow needs explaining.

Keep the surrounding prose tight: one sentence leading in, at most one sentence after. The diagram is the explanation, not a supplement to it. If two sentences of prose already convey the mechanics, do not reach for a diagram — diagrams have a parsing cost that only pays off when the mechanics are genuinely flow-shaped.

Signals you should switch to a diagram:

- The prose uses words like "meanwhile", "concurrently", "while the await is in flight", "between step N and step N+1".
- You find yourself numbering actors or steps inline to keep them straight.
- The Summary is creeping past 5 sentences purely to describe mechanics (not to cover multiple changes).

See Example 6 in `examples.md`.

### Notes content

The Notes section is optional. When included, every sentence must add information a reviewer can act on — trade-offs, constraints, why this approach over the alternative, non-obvious design insights, rejected alternatives, test utility rationale, or load-bearing decisions not visible in the diff.

Two hard prohibitions:

- **No process narrative.** Do not recount the conversation that produced the PR ("X was suggested", "we discussed", "Option B was chosen", "the user asked"). A reviewer wasn't in the conversation and cannot evaluate it. Passive voice ("X was selected", "three options were presented") is the smell.
- **No restating the other sections.** If a Notes sentence could be deleted without the reviewer losing anything, delete it. Notes exist to add what Summary / The bug / The fix cannot — not to repeat them in different words.

If nothing survives those rules, omit the Notes section entirely.

## GitHub Issue Closing

If an issue number was provided in the analysis, append this as the **very last line** of the PR body:

```
Closes #<number>
```

This is required so GitHub auto-closes the issue on merge. Include it regardless of which template you used or which sections are present.

## Branch Setup

Before creating a branch, handle the branch mode passed in the analysis:

- **`base_from_main: true`**: Run `git stash -u`, `git checkout main` (or `master`), `git stash pop`, then create a new branch with `git checkout -b <branch_name>`.
- **`stack_on: <branch>`**: Create a new branch from the current branch with `git checkout -b <branch_name>`.
- **`commit_to_current: true`**: Do NOT create a new branch — commit and push directly to the current branch. Skip the `git checkout -b` step.
- **`worktree: true`**: Rename the current branch with `git branch -m <branch_name>` instead of creating a new one.
- **None of the above** (on main, default): Create a new branch with `git checkout -b <branch_name>`.

## Commands

```bash
# Commit, push, create PR
git commit -m "<type>: <short description>"
git push -u origin <branch_name>
gh pr create --title "<pr_title>" --body "<pr_body>"
```

Use a heredoc for the PR body to preserve formatting:

```bash
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
...

Closes #<number>
EOF
)"
```

## Return

Return the result in exactly this format:

```
PR: <url>
Branch: <branch_name>
Title: <pr_title>
```

## Reference

See `examples.md` in this directory for complete examples of the expected output format.
