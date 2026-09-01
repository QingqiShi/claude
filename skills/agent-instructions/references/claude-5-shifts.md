# Context engineering for Claude 5 generation models

Source: Thariq Shihipar, "The New Rules of Context Engineering for Claude 5 Generation Models", claude.com blog, 24 July 2026.
https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models

Context engineering covers everything that shapes an agent beyond the user's literal message: system prompts, skills, `CLAUDE.md`, memory, references. This file keeps the article's reasoning and examples so a writer can check a decision against the source.

## Why the rules changed

- Anthropic removed over 80% of Claude Code's system prompt for Opus 5 and Fable 5 with no measurable loss on its coding evaluations. Most of what went was constraint, not needed instruction.
- Reviewing transcripts showed guidance conflicting inside a single request because it arrived from different layers at once: "leave documentation as appropriate" from one source, "DO NOT add comments" from another. The model resolves such conflicts silently. The fix is to remove the conflict, not to add a tie-breaking rule.
- Older models needed explicit guardrails to avoid worst-case outcomes. Newer models use the surrounding context and judgment instead, and the old rules "proved inappropriate for certain scenarios".
- Claude Code now ships more tools than before, so `CLAUDE.md` no longer has to be the sole information repository.
- `/doctor` in a Claude Code session automates the simplification pass Anthropic ran on its own prompt.

## The six shifts

### Give Claude rules → let Claude use judgment

Replace strict rules with guidance that describes the norm to match. Rigid rules fit the situation the author imagined and misfire in the rest.

> Before: Default to writing no comments. Never write multi-paragraph docstrings or multi-line comment blocks—one short line max.
>
> After: Write code that reads like the surrounding code: match its comment density, naming, and idiom.

### Give Claude examples → design interfaces

Invest in the tool's interface so correct usage is implied by its structure rather than taught by worked examples. The Todo tool's status field, enumerated as pending, in_progress, completed, hints at appropriate usage on its own.

### Put it all upfront → use progressive disclosure

Do not embed every detailed procedure in the system prompt. Claude Code originally carried its code-review and verification instructions inline; it now keeps them in separate skills that Claude invokes when relevant. Tools follow the same pattern: the agent searches for a full tool definition with ToolSearch before using it, which allows a broad tool set without spending initial context on all of it.

### Repeat yourself → simple tool descriptions

Earlier models sometimes needed an instruction repeated, or responded better to guidance placed at the end of the context. Current models do not. Consolidate tool instructions into the tool descriptions rather than repeating them through the system prompt.

### Memory in CLAUDE.md files → auto-memory

Users used to save notes into `CLAUDE.md` by hand with the `#` hotkey. Claude now preserves relevant memories tied to the ongoing work automatically, so `CLAUDE.md` no longer has to double as a notebook.

### Simple specs → rich references

Plan mode used to work from basic markdown specifications. It now takes HTML artifacts, code samples from other codebases, detailed test suites, and rubrics that define quality for a domain. Concrete material gives the model more to plan against.

## Guidance by layer

### System prompt

Keep it tied to the product context: what the model operates within and its primary function. Claude Code users typically never modify Claude Code's own system prompt. Anyone building a custom harness owns theirs and should invest in it.

### CLAUDE.md

Keep it lightweight. Describe the repository's purpose and spend the tokens on project-specific gotchas, not on what Claude can derive from the file structure. Apply progressive disclosure here too: verification instructions go in a separate skill, not inline.

### Skills

Skills work best when they encode opinions, knowledge, and best practices specific to a team or product. Write them as lightweight guides that let Claude locate information when it needs it. Avoid over-constraining except in genuinely critical areas. Split a large skill across several files so only the relevant part loads.

### References

When pointing the model at reference material, prefer code-based specifications over descriptions or screenshots. HTML mockups of designs typically produce better results than textual descriptions.
