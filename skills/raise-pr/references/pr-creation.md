# PR Creation Conventions

You are creating a pull request. You will be given an analysis containing: a change type, type-appropriate content fields (either `Bug` + `Fix` for the Fix template, or `Summary` for the Summary template), optional `Notes` and `Mapping`, optional GitHub issue number, and branch-mode flags (worktree, base_from_main, commit_to_current, stack_on). Follow these conventions exactly.

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

Every template below serves one goal: a description a reviewer can read and follow quickly. Optimize for their comprehension, not word count.

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

<Lead with a clear sentence covering WHY and WHAT. Then add whatever context the reviewer needs to follow the change — a second paragraph for motivation, bullets for distinct points. Don't cram everything into one dense sentence. For structural body content (mappings, bundled items, sequences), see "Readability and structure" below.>

## Notes

<!-- optional — only include if a Notes field was provided in the analysis input. Omit this entire section otherwise. -->

<Trade-offs, rejected alternatives, or non-obvious decisions. Pick the shape that matches the content: short paragraphs for connected reasoning, bullets for independent items, numbered list for iterations or sequences.>
```

### Trivial changes

A typo, a one-line null guard, a dependency version bump — collapse to a single `## Summary` section with one sentence, regardless of change type. When the change is genuinely self-explanatory, more words just get in the reviewer's way. See Example 4.

---

Whichever template you use: explain **why** the change was made, not just what files changed. Reviewers can see the diff — tell them what the diff can't show.

### Readability and structure

Two principles serve that goal:

1. **Write for the reader; cut what doesn't earn its place.** Include the context a reviewer needs to follow the change — the motivation, the constraint that shaped it, the trade-off they should weigh. But every sentence must pull its weight: filler, hedging, and restatement make a PR *harder* to consume, not easier. Concision is a tool in service of readability, not the goal itself.

   In practice: lead with a clear sentence, then give the change room to breathe — a second sentence or a few bullets, not one dense line. The Fix template's `## The bug` and `## The fix` sections each cover one concern; give each enough room to actually explain, a couple of sentences normally, more if the mechanic warrants it.

2. **Match the shape of the format to the shape of the content.** Structure is the main lever for readability — a wall of prose is hard to scan even when it's short. Pick whichever shape fits the content (none is the default), and reach for visible structure whenever the content has more than one part:
   - **Table** — for before→after mappings or other tabular reference data: renames, token migrations, API replacements, enum value shifts. Place under its own heading (e.g. `## Token mapping`) between Summary and Notes.
   - **Bullets** — for independent items where order doesn't carry meaning. Genuine bundled PRs (see the test below). Format: **bold label** + em-dash + one sentence per bullet; group under subheadings when items cluster by component or concern.
   - **Numbered list** — for sequences or iterations: design alternatives considered, ordered states, steps in a process.
   - **Short paragraphs** — for genuinely connected reasoning that loses meaning when split (a single argument, a cause-and-effect chain). One thought per paragraph; keep each paragraph to a few sentences.
   - **Diagram** — for flow-shaped mechanics (race, sequence, state transition); see "Diagrams for complex flows" below.

A long paragraph with many inline `` `code` `` references is almost always a smell — the content is structured (a mapping, a list, a comparison) and prose is hiding the shape. Convert it. Likewise, a single sentence weighed down by three or four clauses is a paragraph or a bullet list in disguise — break it apart so the reader can take it in one piece at a time.

#### When to bullet vs paragraph

A bulleted list signals "these items are independent." A paragraph signals "this is one connected thing." Don't bullet a Summary just because the diff touches three files or adds three related rules — that's one change, so use a paragraph; but do split that one change across two sentences if a single sentence would force the reader to hold too much at once.

Apply this test before listing:

> Could each item have plausibly shipped as its own PR with its own description?

If yes for 3+ items, bullet them. If no, it's one change — keep it as a paragraph, a sentence or two is normal.

Concrete signals the items are genuinely independent:

- They affect different subsystems with no shared motivation
- They were held pending separate validation and shipped together for convenience, not because they belong together
- The Summary would naturally read as "X, and also Y, and also Z" rather than "X (which requires Y and is demonstrated by Z)"

### Diagrams for complex flows

When a section would otherwise need dense technical prose to describe a race, a multi-step sequence across components, a state transition, or a before/after structural change — use a Mermaid diagram. GitHub renders Mermaid natively in PR bodies (` ```mermaid ` fenced blocks). Diagrams most often belong in the Fix template's `## The bug` section, where flow-shaped mechanics usually live, but they can appear anywhere a flow needs explaining.

Keep the surrounding prose tight: one sentence leading in, at most one sentence after. The diagram is the explanation, not a supplement to it. If two sentences of prose already convey the mechanics, do not reach for a diagram — diagrams have a parsing cost that only pays off when the mechanics are genuinely flow-shaped.

Signals you should switch to a diagram:

- The prose uses words like "meanwhile", "concurrently", "while the await is in flight", "between step N and step N+1".
- You find yourself numbering actors or steps inline to keep them straight.
- You're describing one flow (not multiple changes) and need several sentences just to keep the sequence straight — a diagram conveys it faster.

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
