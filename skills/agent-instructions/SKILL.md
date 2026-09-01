---
name: agent-instructions
description: How to write and revise the text that steers Claude, calibrated to Claude 5 generation models (Opus 5, Fable 5.1). Covers CLAUDE.md files, SKILL.md skills, agent definitions, sub-agent prompts, and tool descriptions. Use it whenever the user wants to create, edit, review, simplify, shorten, or audit any of these, asks how to phrase an instruction so Claude follows it, asks why Claude ignores or over-applies a rule, or mentions /doctor findings, even when they never say "CLAUDE.md" or "skill". When building a whole new skill, skill-creator runs the draft-test-iterate loop and this skill governs what the text says.
user-invocable: true
---

# Agent Instructions

Argument (optional, a file to audit): $ARGUMENTS

Best practice for the text that steers an agent: `CLAUDE.md`, `SKILL.md`, agent definitions, sub-agent prompts, tool descriptions. Distilled from Anthropic's context-engineering guidance for Claude 5 generation models and from the Fable 5.1 prompting notes. The reusable text and the detail live in `references/`.

## The audience changed

An instruction is read by a model, and the model changed. Claude 5 generation models use the surrounding context and their own judgment where earlier models needed guardrails. Anthropic removed over 80% of Claude Code's system prompt for Opus 5 and Fable 5 with no measurable loss on its coding evals. What went was mostly prescriptive rules that had begun to conflict with each other and to hold the model back.

Two things follow:

- Every line costs context and narrows judgment, so it has to earn its place.
- Correctives expire. A rule written to hold back an earlier model's habit now pushes a model with the opposite default the wrong way.

## Principles

**Goal and why, not rule.** Say what good looks like and why it matters, then let the model apply it. A numeric limit or an ALWAYS/NEVER fits the case the author pictured and misfires everywhere else. A hard constraint still belongs where a miss is costly: destructive actions, security, confirmations the product requires, a format a script parses.

> Before: Default to writing no comments. Never write multi-paragraph docstrings or multi-line comment blocks—one short line max.
>
> After: Write code that reads like the surrounding code: match its comment density, naming, and idiom.

**Interfaces over examples.** For tool use, a well-designed interface teaches more than worked examples: a status field enumerated as pending, in_progress, completed implies its own usage. Keep an example for a judgment call that is easier to show than to describe, and attach a rationale so the model learns the reason rather than the surface.

**Progressive disclosure.** Keep what always loads small and move the rest to where it is read only when needed: verification and review steps into their own skills, long skill material into `references/`, tool detail into tool descriptions that load on demand. This works only for material the model knows to fetch. A behaviour that has to fire unprompted stays in the layer that always loads.

**Say it once, where it applies.** Tool instructions belong in the tool description, not repeated through the system prompt. Repetition and end-of-context placement were workarounds for earlier models. Today they add tokens and plant the contradictions a later audit has to hunt down.

**Rich references over prose specs.** Code, an HTML mockup, a test suite, or a quality rubric gives the model something concrete to plan against. A textual description or a screenshot gives it less.

**Calibrate to the current model, symptom first.** Fable 5.1 narrates less, formats less, and rewrites whole files more than its predecessor. It also over-delivers on scope and sometimes ends a turn by describing the next step instead of taking it. Each has a short instruction that fixes it (`references/fable-5-1-behaviours.md`). Add one only when you observe the behaviour, and delete the opposite corrective first. Write the symptom next to the corrective so a later audit can test whether it still applies.

## Where each instruction belongs

| Layer | Put here | Keep out |
| --- | --- | --- |
| `CLAUDE.md` | Repository purpose; project gotchas the file tree cannot reveal | Facts derivable from the structure; verification steps; session notes that auto-memory now keeps |
| `SKILL.md` | Team or product opinions, knowledge, and best practice; a lightweight guide that helps the model find what it needs; a pushy `description`, because the description alone decides triggering | Hard constraints outside genuinely critical areas; material that belongs in `references/` |
| Tool description | How and when to use the tool, once | Repeats elsewhere |
| Sub-agent prompt | The goal, the deliverable and where to save it, and what the parent conversation knows that it does not: constraints already settled, files already found, whether anyone reads its tool output | Methodology the model can work out; the parent's whole history |
| References | Code, mockups, test suites, rubrics | Long prose restating the above |

The sources also cover the harness system prompt, which Claude Code owns, not you. A Fable corrective the docs place there goes in `CLAUDE.md`, an agent definition, or a sub-agent prompt instead. The sub-agent row applies the same principles to a layer the sources do not discuss.

## Write a new instruction

1. Pick the layer from the table. If the text would load on every turn, ask whether it needs to.
2. Write the goal and the reason in the imperative. Read it back as the model would: does it still make sense in a situation the author did not picture?
3. Check it against everything else that loads in the same context: global and project `CLAUDE.md`, skill descriptions, agent definitions, the harness system prompt. Two instructions that disagree are worse than none, because the model resolves the conflict silently.
4. Keep it short. Prefer a sentence that explains to a paragraph that enumerates.

## Audit an existing file

The argument names the file when the skill was invoked with one; otherwise use the file the conversation is about. Suggest the user run `/doctor` in a session as well; it automates the simplification pass Anthropic ran on its own prompt.

Read the file and every other instruction source that loads alongside it, then classify each instruction. Classify by clause, not by line: one sentence can hold a judgment worth keeping and a numeric cap worth rewriting.

- **Keep**: goal plus why, still true, stated only here.
- **Rewrite**: a rule that a judgment statement would cover better. Numeric style limits, ALWAYS/NEVER in caps, blanket format bans, "hold all findings for the final response", and other correctives aimed at an earlier model; check them against the symptom index in `references/fable-5-1-behaviours.md`.
- **Move**: detail that loads every turn but is needed rarely; tool guidance living outside the tool description; verification steps inline in `CLAUDE.md`.
- **Delete**: derivable from the repository; repeated; contradicted elsewhere; a memory note auto-memory already holds.
- **Flag**: an overlap or soft ambiguity with another source, such as two skills whose descriptions claim the same request. The user settles it; it is not a change to this file.

Present the proposed changes with the reason for each. Do not silently drop a constraint that guards something irreversible; say it stays and why.

## References

- `references/claude-5-shifts.md`: the six then/now shifts with Anthropic's examples, and the per-layer guidance in full.
- `references/fable-5-1-behaviours.md`: Fable 5.1 behaviour deltas, each with the symptom, the cause, and the verbatim instruction that fixes it. Read it when a symptom in its index matches what you see, or what the file you are auditing tries to correct.
