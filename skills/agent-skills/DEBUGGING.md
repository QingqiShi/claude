# Debugging and Improving Agent Skills

This guide covers debugging common issues and iteratively improving Agent Skills.

**Key approach**: Use iterative development with Claude. Have one Claude instance (Claude A) help design and refine the skill, while another instance (Claude B) tests it in real usage. Observe Claude B's behavior and return to Claude A with improvements.

For comprehensive debugging strategies and improvement patterns, see [references/best-practices.md](references/best-practices.md).

## Contents

- [Debugging Guide](#debugging-guide)
  - [Skill doesn't trigger](#issue-skill-doesnt-trigger)
  - [Skill activates incorrectly](#issue-skill-activates-incorrectly)
  - [Skill loads too much context](#issue-skill-loads-too-much-context)
  - [Skill execution is inconsistent](#issue-skill-execution-is-inconsistent)
  - [Scripts don't execute](#issue-scripts-dont-execute)
- [Improvement Process](#improvement-process)
  - [Claude A/B Pattern](#iterative-development-with-claude-claude-ab-pattern)
  - [Observe usage](#1-observe-claude-using-the-skill)
  - [Self-reflection](#2-ask-claude-to-self-reflect)
  - [Refactor patterns](#3-refactor-based-on-usage-patterns)
  - [Test improvements](#4-test-improvements)
- [Best Practices for Maintenance](#best-practices-for-maintenance)
- [Quick Debugging Reference](#quick-debugging-reference)
- [When to Refactor](#when-to-refactor)

## Debugging Guide

### Issue: Skill doesn't trigger

**Symptom:** You ask a relevant question but the skill doesn't activate.

#### Check 1: Description specificity

Vague descriptions make discovery difficult.

**Too vague:**

```yaml
description: Helps with data
```

**Specific:**

```yaml
description: Analyze Excel spreadsheets, create pivot tables, generate charts. Use when working with Excel files, spreadsheets, or .xlsx files.
```

**Fix:** Include both what the skill does AND when to use it, with specific trigger keywords.

#### Check 2: File location

**Personal Skills:** `~/.claude/skills/skill-name/SKILL.md`
**Project Skills:** `.claude/skills/skill-name/SKILL.md`

```bash
# Verify file exists
ls ~/.claude/skills/skill-name/SKILL.md
ls .claude/skills/skill-name/SKILL.md
```

**Fix:** Move skill to correct location.

#### Check 3: YAML syntax

Invalid YAML prevents skill from loading.

```bash
# View frontmatter
cat SKILL.md | head -n 10

# Check for:
# - Opening --- on line 1
# - Closing --- before Markdown content
# - No tabs (use spaces)
# - Quoted strings with special characters
```

**Fix:** Validate and correct YAML syntax.

#### Check 4: Debug mode

```bash
# Run with debug output
claude --debug
```

This shows skill loading errors and helps identify issues.

---

### Issue: Skill activates incorrectly

**Symptom:** Skill triggers on unrelated requests or conflicts with other skills.

#### Check 1: Description too broad

**Too broad:**

```yaml
description: For data analysis
```

**Focused:**

```yaml
description: Analyze sales data in Excel files and CRM exports. Use for sales reports, pipeline analysis, revenue tracking.
```

**Fix:** Narrow scope, add specific contexts and file types.

#### Check 2: Multiple skills conflict

Make descriptions distinct:

**Bad (overlapping):**

```yaml
# Skill 1
description: For data analysis

# Skill 2
description: For analyzing data
```

**Good (distinct):**

```yaml
# Skill 1
description: Analyze sales data in Excel files and CRM exports. Use for sales reports, pipeline analysis, revenue tracking.

# Skill 2
description: Analyze log files and system metrics. Use for performance monitoring, debugging, system diagnostics.
```

**Fix:** Use distinct trigger terms and specific contexts for each skill.

---

### Issue: Skill loads too much context

**Symptom:** Context window fills quickly, skill feels slow, unnecessary content loaded.

#### Solution: Split content into focused files

Keep frequently-used content in SKILL.md:

```yaml
---
name: PDF Processor
description: Extract text, fill forms, merge PDFs.
---

# PDF Processor

## Quick Start

Extract text:
[Common usage here]

## Advanced Operations

- Form filling: See [FORMS.md](FORMS.md)
- API reference: See [REFERENCE.md](REFERENCE.md)
```

Move specialized content to separate files:

- **FORMS.md** - Only loaded for form-filling tasks
- **REFERENCE.md** - Only loaded when API details needed
- **ADVANCED.md** - Only loaded for complex scenarios

**Fix:** Reference additional files only when needed. Claude will load them on-demand.

---

### Issue: Skill execution is inconsistent

**Symptom:** Same request produces different results, skill behavior unpredictable.

#### Solution: Convert operations to code

**Before (instructions):**

```markdown
Sort the items alphabetically, handling special characters correctly.
```

**After (script):**

````markdown
Run the sorting script:

```bash
python scripts/sort_items.py input.txt
```
````

````

**Benefits of scripts:**
- Deterministic behavior
- Code doesn't consume context (only output does)
- Better for sorting, validation, parsing, formatting
- Consistent results every time

**Fix:** Move deterministic operations to executable scripts.

---

### Issue: Scripts don't execute

**Symptom:** Skill tries to run scripts but they fail.

#### Check 1: Execute permissions

```bash
# Check current permissions
ls -la .claude/skills/skill-name/scripts/

# Add execute permissions
chmod +x .claude/skills/skill-name/scripts/*.py
chmod +x .claude/skills/skill-name/scripts/*.sh
````

#### Check 2: File paths

Use forward slashes (Unix style) in all paths:

**Correct:**

```markdown
Run: `python scripts/helper.py input.txt`
```

**Wrong:**

```markdown
Run: `python scripts\helper.py input.txt`
```

#### Check 3: Dependencies

List required packages in description:

```yaml
---
name: PDF Processor
description: Extract text from PDFs. Requires pdfplumber and pypdf packages.
---
```

Claude will request installation when needed.

---

## Improvement Process

### Iterative Development with Claude (Claude A/B Pattern)

The most effective approach uses two Claude instances:

**Claude A** (skill designer):

- Helps you create and refine the skill
- Suggests improvements based on observations
- Designs better structure and organization

**Claude B** (skill user):

- Tests the skill in real usage scenarios
- Demonstrates actual behavior patterns
- Reveals gaps and issues in practice

**Workflow**:

1. Work with Claude A to create initial skill based on a task you completed together
2. Test with Claude B on similar tasks, observing its behavior
3. Return to Claude A with observations: "When Claude B used this skill, it forgot to filter test accounts"
4. Claude A suggests improvements (make rules more prominent, restructure workflow, etc.)
5. Apply changes and repeat

### 1. Observe Claude using the skill

Watch for:

- **Unexpected trajectories:** Claude goes down wrong path
- **Unnecessary file loads:** Loads files it doesn't need
- **Missing context:** Lacks information to complete task
- **Repeated questions:** Asks for same information multiple times

### 2. Ask Claude to self-reflect

When skill goes off track:

```
What went wrong? How could the skill instructions be improved?
```

When skill succeeds:

```
What aspects of the skill worked well? Capture that in the instructions.
```

Claude can help identify:

- Unclear instructions
- Missing examples
- Ambiguous guidance
- Better ways to structure content

### 3. Refactor based on usage patterns

**Pattern:** Same content needed on every use
**Fix:** Keep it in main SKILL.md

**Pattern:** Content only needed for specific scenarios
**Fix:** Move to separate file, reference when needed

**Pattern:** Same operation repeated with small variations
**Fix:** Create a script with parameters

**Pattern:** Instructions produce inconsistent results
**Fix:** Convert to deterministic script

### 4. Test improvements

After making changes:

1. Run same tasks that previously failed
2. Verify issues are resolved
3. Check for new issues introduced
4. Test edge cases
5. Verify context usage is still efficient

## Best Practices for Maintenance

### 1. Keep skills focused

One capability per skill:

**Focused:**

- "PDF form filling"
- "Excel data analysis"
- "Git commit messages"

**Too broad:**

- "Document processing" → Split into PDF, Word, Excel skills
- "Data tools" → Split by data type or operation

### 2. Start simple, add complexity as needed

**Phase 1:** Single SKILL.md file with basic instructions

**Phase 2:** Add examples and best practices to SKILL.md

**Phase 3:** Split into SKILL.md + additional reference files

**Phase 4:** Add scripts for deterministic operations

Don't over-engineer from the start.

### 3. Think from Claude's perspective

Monitor how Claude:

- **Discovers** the skill (from description)
- **Loads** content (what files are accessed)
- **Uses** instructions (which sections are helpful)
- **Handles** edge cases (where it gets confused)

Adjust based on observed behavior.

### 4. Iterate with Claude

```
# During development
"Claude, help me improve this skill based on how you just used it"

# After errors
"What went wrong when you tried to use this skill?"

# For refinement
"What context would have helped you complete that task better?"
```

Claude can suggest:

- Better ways to phrase instructions
- Missing information
- Clearer examples
- Better file organization

### 5. Document changes

Add version history to SKILL.md:

```markdown
# My Skill

## Version History

- v2.0.0 (2025-10-18): Split content into separate files for better progressive disclosure
- v1.1.0 (2025-09-15): Added form-filling capabilities
- v1.0.0 (2025-09-01): Initial release
```

Helps track what changed and why.

### 6. Test thoroughly

Before sharing with team:

- Test with representative tasks
- Test edge cases
- Test negative cases (shouldn't trigger)
- Test with other skills active
- Get feedback from teammates

### 7. Use progressive disclosure

**Level 1: Metadata**

- Keep description focused and trigger-rich

**Level 2: Instructions**

- SKILL.md under 5k tokens
- Frequently-needed content only

**Level 3+: Resources**

- Split specialized content to separate files
- Add scripts for deterministic operations
- Include reference materials as needed

### 8. Leverage code for reliability

When to use scripts instead of instructions:

✅ **Use scripts for:**

- Sorting and ordering
- Validation and verification
- Parsing structured data
- Mathematical calculations
- File format conversions
- Deterministic transformations

❌ **Use instructions for:**

- Flexible analysis
- Natural language tasks
- Creative writing
- Judgment calls
- Context-dependent decisions

### 9. Version your skills

Track versions in content (not frontmatter):

```markdown
# API Integration Skill

**Version:** 2.1.0

## Changelog

### 2.1.0 (2025-10-18)

- Added retry logic for failed requests
- Updated authentication flow

### 2.0.0 (2025-09-01)

- Breaking: Changed API endpoint structure
- Added OAuth support
```

### 10. Share via git

**For teams:**

```bash
# Add to project
mkdir -p .claude/skills/team-skill
# Create SKILL.md

# Commit and share
git add .claude/skills/
git commit -m "Add team skill for API integration"
git push
```

Team members get the skill automatically on `git pull`.

## Quick Debugging Reference

```bash
# Check file location
ls ~/.claude/skills/*/SKILL.md
ls .claude/skills/*/SKILL.md

# Validate YAML
cat ~/.claude/skills/skill-name/SKILL.md | head -n 10

# Check script permissions
ls -la ~/.claude/skills/skill-name/scripts/

# Fix script permissions
chmod +x ~/.claude/skills/skill-name/scripts/*.py

# Run with debug
claude --debug
```

## When to Refactor

Refactor when you notice:

- [ ] SKILL.md exceeds ~400 lines or 5k tokens
- [ ] Content only needed for specific scenarios
- [ ] Same instructions repeated in different contexts
- [ ] Context window fills too quickly
- [ ] Inconsistent execution results
- [ ] Multiple unrelated capabilities in one skill
- [ ] Team members confused by skill behavior

Don't refactor prematurely - let usage patterns guide structure.
