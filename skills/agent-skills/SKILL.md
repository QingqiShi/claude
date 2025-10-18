---
name: Agent Skills Creator
description: Create, evaluate, and improve Agent Skills. Use when creating new skills, improving existing skills, debugging skills, or when the user asks about skill development, skill structure, or skill best practices.
---

# Agent Skills Creator

This skill teaches you how to create, evaluate, and improve Agent Skills that extend Claude's capabilities.

## Core Concepts

### What are Skills?

Skills are modular capabilities that extend Claude's functionality. Each skill is a directory containing:
- **SKILL.md** (required): Instructions with YAML frontmatter
- **Additional files** (optional): Scripts, progressive disclosure docs (ADVANCED.md, REFERENCE.md, etc.)

**Important**: Do NOT create README.md files - they are not part of the progressive disclosure pattern and will not be loaded. Only SKILL.md loads automatically when the skill activates.

Skills are **model-invoked** - Claude autonomously decides when to use them based on the description in the YAML frontmatter.

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

### Step 1: Identify the Need

Before creating a skill, identify specific gaps by:
- Running tasks and observing where Claude struggles
- Noting what context Claude repeatedly needs
- Finding operations that would benefit from deterministic code

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

1. **Keep skills focused** - One capability per skill
2. **Start simple** - Single SKILL.md file, add complexity as needed
3. **Write clear descriptions** - Include what, when, and trigger keywords
4. **Test thoroughly** - Representative tasks, edge cases, negative cases
5. **Use progressive disclosure** - Split content when SKILL.md grows large
6. **Leverage scripts** - Use code for deterministic operations
7. **Iterate with Claude** - Ask Claude to help improve based on usage
8. **Document changes** - Add version history in SKILL.md content
9. **Share via git** - Project skills in `.claude/skills/` for teams

## Additional Resources

This skill includes comprehensive guides:

- **[EVALUATING.md](EVALUATING.md)** - Testing methodology, evaluation checklists, metrics
- **[DEBUGGING.md](DEBUGGING.md)** - Debugging guide, improvement process, best practices
- **[TEMPLATES.md](TEMPLATES.md)** - Ready-to-use skill templates with examples

Documentation files:
- **[agent-skills-doc.md](references/agent-skills-doc.md)** - Complete Skills overview
- **[claude-code-doc.md](references/claude-code-doc.md)** - Claude Code specifics
- **[engineering-blog.md](references/engineering-blog.md)** - Architecture deep dive

## Next Steps

1. **Creating a new skill?** Follow the steps above, use a template from [TEMPLATES.md](TEMPLATES.md)
2. **Testing a skill?** See [EVALUATING.md](EVALUATING.md) for methodology
3. **Debugging issues?** Check [DEBUGGING.md](DEBUGGING.md) for solutions
4. **Need examples?** Browse templates in [TEMPLATES.md](TEMPLATES.md)

Skills follow progressive disclosure - only relevant content loads when needed. This skill itself demonstrates this principle by splitting content across focused files.
