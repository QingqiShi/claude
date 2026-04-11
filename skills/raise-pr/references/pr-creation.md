# PR Creation Conventions

You are creating a pull request. You will be given an analysis containing: what changed, why, change type, and optionally a GitHub issue number. Follow these conventions exactly.

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

Use this template:

```markdown
## Summary

<short prose (2-5 sentences) for typical PRs; single sentence for trivial changes. For bundled multi-change PRs, use a one-sentence scope line followed by bulleted items — see "Length and structure" below.>

## Context

<!-- optional — only include if a Context field was provided in the analysis input. Omit this entire section otherwise. -->

<Context from the analysis input. For multi-step design discussions, use a numbered list of iterations followed by a short takeaway paragraph.>
```

The Summary section must explain **why** the change was made, not just what files changed. Reviewers can see the diff — tell them what the diff can't show.

### Length and structure

The default is short prose (2-5 sentences). Use prose for any PR with a single coherent purpose, even if it touches multiple files or adds multiple related rules.

**Switch to list format only when the PR genuinely bundles independent changes.** Apply this test before counting items:

> Could each item have plausibly shipped as its own PR with its own description?

If yes for 3+ items, use list format. If no, it's one change — use prose. A PR that adds rule A, rule B, and an example demonstrating both is **one change** with three components, not three changes. A PR that adds dedupe to the Planner *and* cost capture to the eval infra *and* an unrelated operator polish is **three changes** — each could ship alone.

Concrete signals the items are genuinely independent:

- They affect different subsystems with no shared motivation
- They were held pending separate validation and shipped together for convenience, not because they belong together
- The Summary would naturally read as "X, and also Y, and also Z" rather than "X (which requires Y and is demonstrated by Z)"

Also use list format when the Context narrates a **multi-step design process** (iterations, rejected alternatives, rule changes) — even if the Summary stays prose.

When using list format:

- **Summary**: open with one sentence stating the scope ("Bundles N improvements to X, held pending Y."), then a bulleted list. Each bullet starts with a **bold label** naming the change, followed by an em-dash and one sentence. If the changes naturally cluster (by component, layer, or concern), group them under bold subheadings — otherwise flat bullets.
- **Context**: if the section narrates an iterative design discussion, use a **numbered list** for the iterations (one line each), then a short paragraph for the takeaway. Do not retell the conversation blow-by-blow.

A Summary listing 3+ genuinely independent items as prose is not allowed — convert to bullets. But never bullet a Summary just because the diff touches three files or adds three related rules — that's still one change. See Example 5 in `examples.md` for the genuine bundled case.

### Context content

The Context section is optional. When included, every sentence must add information a reviewer can act on — trade-offs, constraints, why this approach over the alternative, non-obvious design insights, or load-bearing decisions not visible in the diff.

Two hard prohibitions:

- **No process narrative.** Do not recount the conversation that produced the PR ("X was suggested", "we discussed", "Option B was chosen", "the user asked"). A reviewer wasn't in the conversation and cannot evaluate it. Passive voice ("X was selected", "three options were presented") is the smell.
- **No restating the Summary.** If a Context sentence could be deleted without the reviewer losing anything, delete it. Context exists to add what Summary cannot — not to repeat it in different words.

If neither applies, omit the Context section entirely.

## GitHub Issue Closing

If an issue number was provided in the analysis, append this as the **very last line** of the PR body:

```
Closes #<number>
```

This is required so GitHub auto-closes the issue on merge. Include it even if the Context section is omitted.

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
