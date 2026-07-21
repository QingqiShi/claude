---
name: language-sweep
argument-hint: "[learn|converge] [diff|<path>] [focus…]"
description: Sweep a repo for inconsistent technical and domain language — competing synonyms across code identifiers, comments, docs, and user-facing product copy — and converge on one term per concept. Learning phase distills the glossary into CONTEXT.md; convergence phase finds and fixes drift against it. Use when the user asks for a language sweep, wants a domain glossary or CONTEXT.md, mentions ubiquitous language, or complains that the same concept goes by different names in the code or the product.
---

# Language Sweep

One concept, one name — in the schema, the types, the comments, the docs, and the words users read. Every stray synonym taxes human readers and every future AI session, which must re-derive whether `client`, `customer`, and `account` are one thing or three. This skill is a loop: CONTEXT.md is the durable artifact each run sharpens, the repo converges toward it, and future sessions inherit the language for free. Each invocation is one turn of the loop; a healthy loop finds less each time.

## Phase selection

- No `CONTEXT.md` or `CONTEXT-MAP.md` at repo root → **learning**. The `learn` arg forces it even when a glossary exists (re-survey and merge — for a stale glossary or a newly built area).
- Glossary exists → **convergence**. The `converge` arg with no glossary to converge on is an error — say so and stop; learning must run first.
- Trailing free-form focus text narrows either phase to the named terms or areas.

Never enforce a term in the same run that introduces it. The glossary PR is this loop's human gate: renaming a codebase against an unreviewed glossary is work you may be undoing next week.

Read `references/context-format.md` at the start of either phase — it defines the format, the inclusion test, and multi-context repos.

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

- **Standard-meaning terms** (handler, retry, cache) — no project-specific meaning, nothing to decide; drop. A general word this repo has loaded with its own meaning stays — apply the format spec's inclusion test.
- **Clear domain terms** — one concept, competing synonyms, an evident best name. Be opinionated: pick the best term, not merely the most frequent — the word a domain expert would say aloud; precision beats brevity; the schema and CLAUDE.md are strong votes, not vetoes. Don't queue these for questions — the user vetoes cheaply at glossary-PR review.
- **Proprietary or ambiguous terms** — invented domain words, or terms whose usages genuinely contradict each other. These go to alignment.

### 3. Alignment — understand, don't collect definitions

The goal is to hold the concept yourself, not to transcribe the user's words. Never ask "what does X mean?" Instead:

1. Gather every usage and draft 2–3 candidate interpretations the evidence supports.
2. Find the discriminating question — the boundary case, lifecycle moment, or relationship where the interpretations disagree ("when an Allocation is cancelled, does stock return to the Pool, or was the Pool only ever a view?").
3. Ask via AskUserQuestion with the interpretations as concrete options, each citing its evidence.
4. Follow what the answer opens — edge cases, near-synonyms, what the term is _not_ — until you can predict how the term would be used in a sentence you haven't seen.
5. Restate the definition plus one boundary-case prediction; once confirmed, write it.

Only truly proprietary or contradictory terms earn a question — a handful per sweep, batched up to four per round.

### 4. Write and ship

- Write `CONTEXT.md` at repo root (or per-context files plus `CONTEXT-MAP.md` when clearly separate bounded contexts exist — see the format spec).
- Wire the loop: if the project's CLAUDE.md doesn't yet point at the glossary, add one line naming the actual layout ("Domain language is defined in CONTEXT.md — use those terms in code, comments, and copy"; in a multi-context repo, name CONTEXT-MAP.md instead). Without this pointer future sessions never read the glossary and drift resumes at the source.
- Raise a PR via the raise-pr skill containing the glossary (and the CLAUDE.md pointer) only — no renames, and no prepare-for-pr gate: a prose-only glossary has no code to adversarially review; this PR's human review *is* the gate. List observed-but-unfixed drift in the PR description: the reviewer should see what accepting each pick will later rename.

## Convergence phase

### 1. Scope

- Default: the whole repo — this is the periodic drift sweep. Check `git status --porcelain` first: any output → stop and tell the user (only `diff` scope runs on a dirty tree). Fixes ship as their own PR.
- `diff`: only the working tree and branch diff vs the default branch — reviewing in-flight work. Fixes are applied in place as part of that work; no separate PR.
- A path arg limits the sweep to that subtree.

### 2. Find drift

Read the glossary (the format spec's inference rules cover multi-context repos). Then hunt:

- CLAUDE.md files first: an avoid-term in session context seeds drift into every future session's output, so it outranks any fix in code
- usages of `_Avoid_` terms in identifiers, comments, docs, and strings
- product copy that contradicts the glossary or is internally inconsistent — except divergences the glossary deliberately records
- new terms with competing synonyms that have appeared since the last sweep → run learning steps 2–3 on just those and add them to CONTEXT.md, marked as new in the PR description — but do **not** enforce them this run; a term added today hasn't passed the human gate yet, so its renames wait for the next sweep. In `diff` scope there is no sweep PR to carry glossary edits — list the candidates in the report instead of editing CONTEXT.md.

### 3. Fix

Behavior-preserving renames only — identifiers, comments, docs, copy. Never silently rename load-bearing external contracts:

- DB tables and columns, API routes and payload fields, published package exports, analytics event names, i18n keys, env vars, webhook payloads

Those get _flagged_ in the report — with a migration sketch when cheap — not renamed. Everything else: rename thoroughly. A half-rename is worse than none; it turns a repo-level synonym into a live inconsistency inside one file.

### 4. Verify and ship

Run the project's typecheck and tests if this session or the project's CLAUDE.md establishes how — a rename that doesn't compile wasn't behavior-preserving. Full sweeps then hand off to the prepare-for-pr skill, which reviews the rename diff and raises the PR — a repo-wide rename is exactly the substantive, unreviewed change that gate exists for. Report: drift fixed, contracts flagged, terms added.

## Loop health

Watch two signals across runs and say so when you see them:

- **The same term keeps getting violated in _new_ code.** The glossary picked the wrong winner — humans keep reaching for the losing word. Flip the pick (a glossary change, so it rides the PR for review) instead of re-fixing forever.
- **Sweeps aren't shrinking.** Language is being introduced faster than it converges — check the CLAUDE.md → CONTEXT.md pointer exists and is being honored, and suggest tightening it if not.
