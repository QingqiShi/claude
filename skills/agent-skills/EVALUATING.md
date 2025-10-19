# Evaluating Agent Skills

This guide covers testing and evaluation strategies for Agent Skills.

**Key principle**: Build evaluations BEFORE writing extensive documentation. Create 3 test scenarios, establish baseline performance, then write minimal instructions to pass them. This ensures your skill solves real problems rather than imagined ones.

For comprehensive evaluation methodology and evaluation-driven development, see [references/best-practices.md](references/best-practices.md#evaluation-and-iteration).

## Contents

- [Initial Testing](#initial-testing)
  - [Test with matching requests](#test-with-matching-requests)
  - [Test with edge cases](#test-with-edge-cases)
  - [Monitor context usage](#monitor-context-usage)
- [Evaluation Checklist](#evaluation-checklist)
- [Testing Methodology](#testing-methodology)
  - [Baseline testing](#1-baseline-testing)
  - [Variation testing](#2-variation-testing)
  - [Negative testing](#3-negative-testing)
  - [Integration testing](#4-integration-testing)
- [Common Issues to Check](#common-issues-to-check)
- [Evaluation Metrics](#evaluation-metrics)
- [Evaluation Structure Example](#evaluation-structure-example)
- [Iterative Improvement](#iterative-improvement)

## Initial Testing

### Test with matching requests

Ask questions that include trigger keywords from the description:

- Verify the skill activates automatically
- Check that instructions are followed correctly
- Confirm the skill loads appropriate content

**Example:** If description mentions "PDF files", test with:

```
Can you help me extract text from this PDF?
```

### Test with edge cases

Try requests that should NOT trigger the skill:

- Verify skill doesn't activate on irrelevant requests
- Test with ambiguous requests
- Verify skill works with various phrasings

**Example:** If you have a PDF skill, test with:

```
Can you help me with this Word document?  (should NOT trigger)
Can you process this document? (ambiguous - monitor behavior)
```

### Monitor context usage

Check progressive disclosure is working:

- Skill loads only SKILL.md initially
- Additional files load only when referenced
- Scripts execute without loading code into context
- Context window stays efficient

## Evaluation Checklist

Run through this checklist for each skill:

- [ ] **Description triggers correctly**

  - Activates on relevant requests
  - Doesn't activate on irrelevant requests
  - Works with various phrasings

- [ ] **Instructions work well**

  - Clear and actionable
  - No ambiguity or confusion
  - Complete (no missing steps)

- [ ] **Examples are helpful**

  - Concrete and realistic
  - Cover common use cases
  - Show expected patterns

- [ ] **Progressive disclosure works**

  - Supporting files load only when needed
  - Context usage is efficient
  - No unnecessary content loaded

- [ ] **Scripts execute correctly**

  - Run without errors
  - Provide expected output
  - Handle edge cases

- [ ] **File structure is correct**
  - All paths use Unix-style forward slashes
  - Referenced files exist
  - YAML syntax is valid

## Testing Methodology

### 1. Baseline testing

Test the skill performs its core function:

```bash
# Ask a direct request that matches the description
"[Task that exactly matches skill description]"

# Verify:
# - Skill activates
# - Instructions are followed
# - Output is correct
```

### 2. Variation testing

Test with different phrasings:

```bash
# Same task, different wording
"[Alternative phrasing 1]"
"[Alternative phrasing 2]"
"[Casual phrasing]"
"[Formal phrasing]"

# Verify skill activates consistently
```

### 3. Negative testing

Verify skill doesn't activate incorrectly:

```bash
# Similar but different task
"[Related but different task]"

# Should NOT trigger the skill
# If it does, description is too broad
```

### 4. Integration testing

Test with other skills active:

```bash
# Request that could match multiple skills
"[Ambiguous request]"

# Verify:
# - Correct skill is chosen
# - No conflicts between skills
# - Clear skill selection
```

## Common Issues to Check

### Skill doesn't activate

**Causes:**

- Description too vague or generic
- Missing key trigger words
- YAML syntax errors
- File in wrong location

**Fixes:**

- Make description more specific (see [DEBUGGING.md](DEBUGGING.md))
- Add trigger keywords users would mention
- Validate YAML frontmatter
- Check file path

### Skill activates incorrectly

**Causes:**

- Description too broad
- Overlapping with other skills
- Ambiguous trigger keywords

**Fixes:**

- Narrow description scope
- Use distinct keywords for each skill
- Add negative examples in description (what NOT to use for)

### Skill has errors during execution

**Causes:**

- Invalid YAML frontmatter
- Incorrect file paths in references
- Missing dependencies
- Scripts lack execute permissions

**Fixes:**

- Validate YAML syntax
- Check all file paths
- List required packages in description
- Run `chmod +x scripts/*.py`

### Skill loads too much context

**Causes:**

- SKILL.md too large
- All content in single file
- No progressive disclosure

**Fixes:**

- Split content into separate files (see [DEBUGGING.md](DEBUGGING.md))
- Reference files only when needed
- Convert instructions to scripts where appropriate

## Evaluation Metrics

Track these metrics over time:

### Activation accuracy

- **True positives:** Activates when it should
- **True negatives:** Doesn't activate when it shouldn't
- **False positives:** Activates incorrectly
- **False negatives:** Fails to activate when it should

### Performance

- **Context usage:** Tokens consumed per activation
- **Response time:** Time to complete tasks
- **Success rate:** Tasks completed correctly

### User experience

- **Clarity:** Instructions are easy to follow
- **Completeness:** All needed information is present
- **Efficiency:** Minimal back-and-forth needed

## Evaluation Structure Example

When creating formal evaluations, use a structured format:

```json
{
  "skills": ["pdf-processing"],
  "query": "Extract all text from this PDF file and save it to output.txt",
  "files": ["test-files/document.pdf"],
  "expected_behavior": [
    "Successfully reads the PDF file using an appropriate PDF processing library",
    "Extracts text content from all pages without missing any pages",
    "Saves the extracted text to a file named output.txt in a clear, readable format"
  ]
}
```

This provides a clear rubric for testing whether the skill performs as expected.

## Iterative Improvement

1. **Track issues** - Note every time skill doesn't work as expected
2. **Analyze patterns** - Look for common failure modes
3. **Make targeted fixes** - Address specific issues
4. **Retest** - Verify fixes work without breaking other cases
5. **Document changes** - Add version notes in SKILL.md

See [DEBUGGING.md](DEBUGGING.md) for detailed debugging and improvement strategies.
