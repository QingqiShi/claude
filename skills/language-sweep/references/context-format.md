# CONTEXT.md — the glossary format

CONTEXT.md is the durable artifact of the language-sweep loop. It has three readers, and each dictates part of the format:

- **Humans** skim it to learn the domain — so definitions must be short and say what a thing *is*.
- **Future AI sessions** load it as standing context — so it must stay small and high-signal; every weak entry dilutes the strong ones.
- **The convergence sweep** enforces it mechanically — so every entry must be checkable: a winning term plus greppable losers.

The structure is shared with the wider CONTEXT.md convention (after Matt Pocock's domain-modeling format), so other tools can read our glossaries and we can read theirs.

## Structure

```md
# {Context Name}

{One or two sentences: what this context is and why it exists.}

## Language

**Order**:
A customer's confirmed request for goods, from placement until delivery.
_Avoid_: Purchase, transaction

**Booking**:
A confirmed reservation of a vehicle for a date range. Shown to users as "trip".
_Avoid_: Reservation, rental
```

Group terms under subheadings when natural clusters emerge; a flat list is fine while the context stays cohesive.

## The rules, and why each exists

**Every entry decides something.** This file is arbitration, not documentation. An entry earns its place one of two ways: it settles a fight between synonyms (the `_Avoid_` list is the record of who lost), or it defines a proprietary term a newcomer couldn't infer. A word that is both obvious and uncontested decides nothing — leave it out.

**`_Avoid_` entries are enforcement commitments.** The convergence sweep will hunt every avoid-word down — identifiers, comments, docs, product copy. Don't list a loser you don't actually want renamed; an avoid-list nobody enforces teaches readers the whole file is advisory.

**Definitions say what a thing IS, not what the code does with it.** One or two sentences that draw the concept's boundary. The test: a reader should be able to predict whether a borderline case is or isn't this thing. Needing a third sentence usually means you're describing behavior or implementation — cut it.

**The inclusion test is project-specific meaning, not domain-vs-technical.** Words the industry already defines (handler, retry, cache, timeout) don't belong, however often the repo uses them — nothing was decided here. But a general word this project has loaded with meaning of its own — a "Snapshot" that means one specific artifact, a "Sync" that is one particular pipeline — is glossary material even though it sounds technical. Ask: does this word mean something here that general knowledge wouldn't give you?

**One entry covers every casing and surface.** Name the concept in prose case; the entry applies to all its projections — `order_id`, `OrderCard`, "your order", the docs. Convergence maps the term through each surface's casing convention; never add separate entries per casing.

**Deliberate UI divergence is recorded inline.** The default is that the internal term and the word users read are identical — that is the point of the exercise. When the product intentionally shows a different word, record it in the definition ("Shown to users as 'trip'"). A divergence the glossary records is a decision; one it doesn't is drift for the sweep to fix.

## Single context vs many

Most repos are one context: one `CONTEXT.md` at the root.

Sometimes the same word legitimately means different things in different parts of the system — "Customer" in ordering is a person browsing; "Customer" in billing is a legal entity with a tax ID. That is not sloppiness to converge away; it is a boundary you've discovered. When a term genuinely can't be unified, split into per-context files with a root `CONTEXT-MAP.md`:

```md
# Context Map

## Contexts

- [Ordering](./src/ordering/CONTEXT.md) — receives and tracks customer orders
- [Billing](./src/billing/CONTEXT.md) — generates invoices and processes payments

## Relationships

- **Ordering → Billing**: Ordering emits `OrderPlaced`; Billing consumes it to invoice
- **Ordering ↔ Billing**: shared types for `CustomerId` and `Money`
```

Relationships matter because boundaries are where words translate — Ordering's "Customer" may arrive in Billing as "Payer", legitimately. Record the seams so the sweep converges language *within* a context and never flattens meaning *across* one.

## How the sweep reads it

- `CONTEXT-MAP.md` at root → multi-context. Read it to locate the glossaries; infer which context the code at hand belongs to, and ask only if genuinely unclear.
- Only a root `CONTEXT.md` → single context.
- Neither → no glossary exists yet; that is the learning phase's job. Create the root file when the first term is decided, not before.
