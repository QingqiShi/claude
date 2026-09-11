---
name: language-sweep
argument-hint: "[learn|converge] [diff|<path>] [focus…]"
description: Sweep a repo for competing synonyms in code, docs, and product copy and converge on one term per concept. Learn the glossary into CONTEXT.md, then fix drift against it.
user-invocable: true
disable-model-invocation: true
---

# Language Sweep

One concept, one name — in the schema, the types, the comments, the docs, and the words users read. Every stray synonym taxes human readers and every future AI session, which must re-derive whether `client`, `customer`, and `account` are one thing or three. This skill is a loop: CONTEXT.md is the durable artifact each run sharpens, the repo converges toward it, and future sessions inherit the language for free. Each invocation is one turn of the loop; a healthy loop finds less each time.

## Phase selection

- No `CONTEXT.md` or `CONTEXT-MAP.md` at repo root → **learning**. The `learn` arg forces it even when a glossary exists (re-survey and merge — for a stale glossary or a newly built area).
- Glossary exists → **convergence**. The `converge` arg with no glossary to converge on is an error — say so and stop; learning must run first.
- Trailing free-form focus text narrows either phase to the named terms or areas.

Never enforce a term in the same run that introduces it. The glossary PR is this loop's human gate: renaming a codebase against an unreviewed glossary is work you may be undoing next week.

Read `references/context-format.md` at the start of either phase — it defines the format, which terms belong, and how several glossaries are laid out.

## Learning phase

### 1. Survey

Fan out Explore agents (medium breadth) over the places domain language lives, then reconcile their reports yourself:

- data model: schema, migrations, core types and entities
- API surface: routes, request/response shapes, event names
- product copy: user-facing strings, labels, empty states, emails, notifications
- prose: README, docs, ADRs, long comments
- session context: CLAUDE.md files, root and nested — the human's own vocabulary, written deliberately
- tests: describe/it names often state domain intent plainly

For each candidate term collect evidence, not impressions: the competing synonyms, where each appears (`file:line`), and whether the usages are one concept or genuinely different concepts sharing a word.

### 2. Triage

Three buckets:

- **Standard-meaning terms** (handler, retry, cache) — no project-specific meaning, nothing to decide; drop. A general word this repo has loaded with its own meaning stays — the format spec draws that line.
- **Clear domain terms** — one concept, competing synonyms, an evident best name. Be opinionated: recommend the best term, not merely the most frequent — the word a domain expert would say aloud; precision beats brevity; the schema and CLAUDE.md are strong votes, not vetoes. These need a confirmation of the pick, not an alignment conversation.
- **Proprietary or ambiguous terms** — invented domain words, or terms whose usages genuinely contradict each other. These go to alignment.

### 3. Alignment — understand, don't collect definitions

The goal is to hold the concept yourself, not to transcribe the user's words: a bare "what does X mean?" returns their words, not the concept. So:

1. Gather every usage and draft the candidate interpretations the evidence supports.
2. Find the discriminating question — the boundary case, lifecycle moment, or relationship where the interpretations disagree ("when an Allocation is cancelled, does stock return to the Pool, or was the Pool only ever a view?").
3. Ask via AskUserQuestion with the interpretations as concrete options, each citing its evidence.
4. Follow what the answer opens — edge cases, near-synonyms, what the term is _not_ — until you can predict how the term would be used in a sentence you haven't seen.
5. Restate the definition plus one boundary-case prediction; once confirmed, write it.

Only truly proprietary or contradictory terms earn this conversation — a handful per sweep. Clear picks need only a batched confirmation.

### 4. Write and ship

- Write `CONTEXT.md` at repo root (or several glossaries plus `CONTEXT-MAP.md` when the terms fall into natural groups — see the format spec).
- Raise a PR to pr-standards containing the glossary only, with no prepare-for-pr gate: a prose-only glossary has no code to adversarially review; this PR's human review *is* the gate. List observed-but-unfixed drift in the PR description: the reviewer should see what accepting each pick will later rename.

## Convergence phase

### 1. Scope

- Default: the whole repo — this is the periodic drift sweep. Its fixes ship as their own PR, so it needs a clean tree: check `git status --porcelain` first, and on any output stop and tell the user (only `diff` scope runs on a dirty tree).
- `diff`: only the working tree and branch diff vs the default branch — reviewing in-flight work. Fixes are applied in place as part of that work; no separate PR.
- A path arg limits the sweep to that subtree.

### 2. Find drift

Read the glossary (the format spec says which glossaries to load when there are several). Then hunt:

- CLAUDE.md files first: an avoid-term in session context seeds drift into every future session's output, so it outranks any fix in code
- usages of `_Avoid_` terms in identifiers, comments, docs, and strings
- product copy that contradicts the glossary or is internally inconsistent — except divergences the glossary deliberately records
- new terms with competing synonyms that have appeared since the last sweep → run learning steps 2–3 on just those and add them to CONTEXT.md, marked as new in the PR description; their renames wait for the next sweep. In `diff` scope there is no sweep PR to carry glossary edits — list the candidates in the report instead of editing CONTEXT.md.

### 3. Fix

Behavior-preserving renames only — identifiers, comments, docs, copy. Never silently rename load-bearing external contracts:

- DB tables and columns, API routes and payload fields, published package exports, analytics event names, i18n keys, env vars, webhook payloads

Those get _flagged_ in the report — with a migration sketch when cheap — not renamed. Everything else: rename thoroughly. A half-rename is worse than none; it turns a repo-level synonym into a live inconsistency inside one file.

### 4. Verify and ship

Run the project's typecheck and tests — a rename that doesn't compile wasn't behavior-preserving. Full sweeps then hand off to the prepare-for-pr skill, which reviews the rename diff and raises the PR — a repo-wide rename is exactly the substantive, unreviewed change that gate exists for. Report: drift fixed, contracts flagged, terms added.

## Loop health

Watch two signals across runs and say so when you see them:

- **The same term keeps getting violated in _new_ code.** The glossary picked the wrong winner — humans keep reaching for the losing word. Flip the pick — a glossary change — instead of re-fixing forever.
- **Sweeps aren't shrinking.** Language is being introduced faster than it converges — check that the glossary is where sessions look for it and scoped to the code they edit, and say what you find.
