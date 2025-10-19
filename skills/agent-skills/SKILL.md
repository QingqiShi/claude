---
name: Developing Agent Skills
description: Create, evaluate, and improve Agent Skills. Use when creating new skills, improving existing skills, debugging skills, or when the user asks about skill development, skill structure, or skill best practices.
---

# Developing Agent Skills

This skill teaches you how to create, evaluate, and improve Agent Skills that extend Claude's capabilities.

## Core Concepts

### What are Skills?

Skills are modular capabilities that extend Claude's functionality. Each skill is a directory containing:

- **SKILL.md** (required): Instructions with YAML frontmatter
- **Additional files** (optional): Scripts, progressive disclosure docs (ADVANCED.md, REFERENCE.md, etc.)

**Important**: Do NOT create README.md files - they are not part of the progressive disclosure pattern and will not be loaded. Only SKILL.md loads automatically when the skill activates.

Skills are **model-invoked** - Claude autonomously decides when to use them based on the description in the YAML frontmatter.

### Core Authoring Principles

When creating skills, follow these fundamental principles:

1. **Concise is key** - Assume Claude is already smart. Only add context Claude doesn't have. Challenge each piece of information: "Does Claude really need this explanation?"

2. **Set appropriate degrees of freedom** - Match specificity to task fragility:

   - **High freedom** (text instructions): Multiple approaches valid, context-dependent decisions
   - **Medium freedom** (pseudocode/templates): Preferred pattern exists, some variation acceptable
   - **Low freedom** (specific scripts): Operations are fragile, consistency critical

3. **Evaluation-driven development** - Create evaluations BEFORE writing extensive documentation. Build 3 test scenarios, establish baseline, then write minimal instructions to pass evaluations.

4. **Iterative development with Claude** - Use one Claude instance to design/refine the skill, another to test it in real usage. Observe and iterate based on actual behavior.

For comprehensive authoring guidance, see **[references/best-practices.md](references/best-practices.md)**.

### Progressive Disclosure (3 Levels)

Skills load content in stages to manage context efficiently:

**Level 1: Metadata** (always loaded, ~100 tokens per skill)

- `name` and `description` from YAML frontmatter
- Loaded at startup into system prompt
- Used for skill discovery

**Level 2: Instructions** (loaded when triggered, <5k tokens)

- Main body of SKILL.md
- Loaded when skill description matches user's request
- Contains workflows, best practices, guidance

**Level 3: Resources** (loaded as needed, effectively unlimited)

- Additional markdown files (documentation, examples)
- Scripts and code (executed via bash, not loaded into context)
- Templates and reference materials
- Loaded only when referenced

## Creating Skills

### Recommended Workflow

Follow this evaluation-driven approach:

```
Skill Development Checklist:
- [ ] Step 1: Identify gaps (observe Claude without a skill)
- [ ] Step 2: Create 3 test scenarios
- [ ] Step 3: Establish baseline performance
- [ ] Step 4: Create minimal SKILL.md to pass tests
- [ ] Step 5: Test and iterate based on real usage
```

### Step 1: Identify the Need

Before creating a skill, identify specific gaps by:

- Running tasks and observing where Claude struggles
- Noting what context Claude repeatedly needs
- Finding operations that would benefit from deterministic code

**Important**: Document specific failures or missing context. These become your test scenarios.

### Step 2: Choose Location

**Personal Skills** (`~/.claude/skills/`):

- Individual workflows and preferences
- Experimental skills in development
- Personal productivity tools

**Project Skills** (`.claude/skills/`):

- Team workflows and conventions
- Project-specific expertise
- Shared via git with team

### Step 3: Create Directory Structure

```bash
mkdir -p ~/.claude/skills/skill-name
# or
mkdir -p .claude/skills/skill-name
```

### Step 4: Write SKILL.md

Create SKILL.md with required YAML frontmatter:

```yaml
---
name: Skill Name
description: What this does and when to use it. Include specific triggers and keywords users would mention.
---

# Skill Name

## Instructions
[Clear, step-by-step guidance]

## Examples
[Concrete examples]
```

**Required fields:**

- `name`: 64 characters max
- `description`: 1024 characters max

**Optional field (Claude Code only):**

- `allowed-tools`: Restrict tools Claude can use when skill is active (e.g., `Read, Grep, Glob`)

### Step 5: Write Effective Descriptions

The description is CRITICAL for skill discovery. Include:

- What the skill does
- When Claude should use it
- Specific trigger keywords users would mention
- File types or contexts that trigger it

**Examples:**

Good:

```yaml
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.
```

Poor:

```yaml
description: Helps with documents
```

### Step 6: Add Supporting Files (Optional)

**Start with just SKILL.md.** Only add additional files when necessary.

For complex skills, organize content across files:

```
skill-name/
  ├── SKILL.md (main instructions - REQUIRED)
  ├── ADVANCED.md (advanced scenarios - optional, loaded when referenced)
  ├── REFERENCE.md (API documentation - optional, loaded when referenced)
  └── scripts/
      ├── helper.py (utility script - optional, executed not loaded)
      └── validate.sh (validation script - optional, executed not loaded)
```

**DO NOT create these files:**

- ❌ README.md - Not part of progressive disclosure, won't be loaded
- ❌ Documentation files for users - Skills are for Claude, not end users
- ❌ Any file not referenced from SKILL.md

**How to reference additional files from SKILL.md:**

````markdown
For advanced usage, see [ADVANCED.md](ADVANCED.md).

Run the helper script:

```bash
python scripts/helper.py input.txt
```
````

**When to split content:**

- SKILL.md becomes too large (>5k tokens)
- Content is mutually exclusive or rarely used together
- Need deterministic operations (use scripts instead of instructions)

**When NOT to split:**

- Just for organization (keep it in SKILL.md)
- For user documentation (skills are not user-facing)
- Creating a README (unnecessary and unused)

## Testing and Evaluation

Once you've created a skill, test it thoroughly to ensure it works correctly.

**Quick testing:**

- Ask questions that include trigger keywords from description
- Verify skill activates automatically
- Check that instructions are followed correctly

For detailed testing methodology, evaluation checklists, and metrics, see **[EVALUATING.md](EVALUATING.md)**.

## Debugging and Improvement

If your skill doesn't work as expected, debug and iteratively improve it.

**Common issues:**

- Skill doesn't activate → Check description specificity
- Skill activates incorrectly → Description too broad
- Loads too much context → Split into multiple files
- Inconsistent execution → Convert to scripts

For complete debugging guide and improvement strategies, see **[DEBUGGING.md](DEBUGGING.md)**.

## Skill Templates

Ready-to-use templates to get started quickly:

- **Simple single-file skill** - Basic focused capability
- **Skill with tool restrictions** - Read-only or limited operations
- **Multi-file skill** - Complex scenarios with progressive disclosure
- **Skill with scripts** - Deterministic operations
- **Domain-specific skill** - Organizational workflows

See **[TEMPLATES.md](TEMPLATES.md)** for complete templates with code examples.

## Quick Reference

### Create skill:

```bash
mkdir -p ~/.claude/skills/skill-name
# Create SKILL.md with frontmatter
```

### Test skill:

Ask questions with trigger keywords from description

### Debug skill:

```bash
# Check file exists
ls ~/.claude/skills/skill-name/SKILL.md

# Validate YAML
cat SKILL.md | head -n 10

# Run with debug
claude --debug
```

### Improve skill:

1. Observe usage patterns
2. Ask Claude to self-reflect
3. Refactor based on observations
4. Test improvements

See [DEBUGGING.md](DEBUGGING.md) for details.

### Share skill:

- **Personal:** Keep in `~/.claude/skills/`
- **Team:** Add to `.claude/skills/` and commit to git
- **Organization:** Create plugin with `skills/` directory

## Best Practices

### Essential Principles

1. **Keep skills focused** - One capability per skill
2. **Start simple** - Single SKILL.md file, add complexity only when needed
3. **Be concise** - Assume Claude is smart. Only add context Claude doesn't already have
4. **Write clear descriptions** - Include what, when, and trigger keywords (third person)
5. **Evaluation-driven** - Build evaluations FIRST, then write minimal instructions to pass them

### Development Process

6. **Iterative development** - Use one Claude instance to design the skill, another to test it. Observe actual behavior and iterate
7. **Test with all target models** - If using across Haiku/Sonnet/Opus, test with all of them
8. **Match specificity to fragility** - Fragile operations need specific scripts, flexible tasks need high-level guidance

### Organization

9. **Use progressive disclosure** - Split content when SKILL.md exceeds ~400 lines or has mutually exclusive content
10. **Keep references one level deep** - All additional files should be referenced directly from SKILL.md
11. **Leverage scripts** - Use code for deterministic operations (validation, sorting, parsing)
12. **Document changes** - Add version history in SKILL.md content

### Collaboration

13. **Share via git** - Project skills in `.claude/skills/` for teams
14. **Gather feedback** - Observe how teammates use skills and iterate

For comprehensive best practices including workflows, patterns, anti-patterns, and advanced techniques, see **[references/best-practices.md](references/best-practices.md)**.

## Additional Resources

This skill includes comprehensive guides:

- **[references/best-practices.md](references/best-practices.md)** - ⭐ **START HERE**: Comprehensive authoring guide with workflows, patterns, anti-patterns, and advanced techniques
- **[EVALUATING.md](EVALUATING.md)** - Testing methodology, evaluation checklists, metrics
- **[DEBUGGING.md](DEBUGGING.md)** - Debugging guide, improvement process, troubleshooting
- **[TEMPLATES.md](TEMPLATES.md)** - Ready-to-use skill templates with examples

Documentation files:

- **[agent-skills-doc.md](references/agent-skills-doc.md)** - Complete Skills overview
- **[claude-code-doc.md](references/claude-code-doc.md)** - Claude Code specifics
- **[engineering-blog.md](references/engineering-blog.md)** - Architecture deep dive

## Next Steps

1. **Learning skill authoring?** Read [references/best-practices.md](references/best-practices.md) for comprehensive guidance
2. **Creating a new skill?** Follow the evaluation-driven workflow above, use a template from [TEMPLATES.md](TEMPLATES.md)
3. **Testing a skill?** See [EVALUATING.md](EVALUATING.md) for methodology
4. **Debugging issues?** Check [DEBUGGING.md](DEBUGGING.md) for solutions
5. **Need examples?** Browse templates in [TEMPLATES.md](TEMPLATES.md)

Skills follow progressive disclosure - only relevant content loads when needed. This skill itself demonstrates this principle by splitting content across focused files.
