# Agent Skill Templates

Ready-to-use templates for creating Agent Skills.

For comprehensive authoring guidance including workflows, patterns, and anti-patterns, see [references/best-practices.md](references/best-practices.md).

## Contents

- [File Structure Guidelines](#important-file-structure-guidelines)
- [Simple Single-File Skill](#simple-single-file-skill)
- [Skill with Tool Restrictions](#skill-with-tool-restrictions)
- [Multi-File Skill with Progressive Disclosure](#multi-file-skill-with-progressive-disclosure)
- [Skill with Executable Scripts](#skill-with-executable-scripts)
- [Minimal Skill Template](#minimal-skill-template)
- [Domain-Specific Skill Template](#domain-specific-skill-template)
- [Testing and Development Skill Template](#testing-and-development-skill-template)
- [Quick Template Selection Guide](#quick-template-selection-guide)
- [Customization Tips](#customization-tips)

## Important: File Structure Guidelines

**All skills require only SKILL.md** - that's the only file you need to create initially.

**Key principle**: Be concise. Assume Claude is already smart - only add context Claude doesn't have.

**DO NOT create:**

- ❌ README.md - Not part of progressive disclosure, won't be loaded
- ❌ Documentation files for users - Skills are for Claude, not end users

**Only add additional files when:**

- SKILL.md exceeds ~400-500 lines
- Need executable scripts (helper.py, validate.sh, etc.)
- Have mutually exclusive content that shouldn't all load at once

All templates below show the minimal required structure. Start simple, add complexity only when needed.

---

## Simple Single-File Skill

Perfect for straightforward tasks with focused functionality.

```yaml
---
name: Commit Message Generator
description: Generate clear commit messages from git diffs. Use when writing commits or reviewing staged changes.
---

# Commit Message Generator

## Instructions

1. Run `git diff --staged` to see changes
2. Analyze the diff and generate a commit message with:
   - Summary under 50 characters
   - Detailed description of changes
   - Affected components

## Best Practices

- Use present tense ("Add feature" not "Added feature")
- Explain what and why, not how
- Reference issue numbers when applicable

## Example

For a change adding user authentication:
```

Add user authentication with JWT

- Implement JWT token generation and validation
- Add login/logout endpoints
- Create user session middleware
- Update API to require authentication

Fixes #123

```

```

**When to use:** Single capability, no external scripts, all instructions fit comfortably in one file.

---

## Skill with Tool Restrictions

Use `allowed-tools` to restrict which tools Claude can use when the skill is active.

```yaml
---
name: Read-Only Code Reviewer
description: Review code for best practices without making changes. Use when reviewing PRs or analyzing code quality.
allowed-tools: Read, Grep, Glob
---

# Read-Only Code Reviewer

This skill provides code review feedback without making any modifications.

## Review Checklist

1. **Code organization and structure**
   - Is code logically organized?
   - Are functions/classes appropriately sized?
   - Is there clear separation of concerns?

2. **Error handling patterns**
   - Are errors caught and handled appropriately?
   - Are error messages informative?
   - Is there proper validation?

3. **Performance considerations**
   - Are there obvious inefficiencies?
   - Is caching used appropriately?
   - Are database queries optimized?

4. **Security concerns**
   - Are inputs validated?
   - Are credentials handled securely?
   - Are there injection vulnerabilities?

5. **Test coverage**
   - Are critical paths tested?
   - Are edge cases covered?
   - Are tests maintainable?

## Instructions

1. Use Read tool to examine target files
2. Use Grep to find patterns across codebase
3. Use Glob to discover related files
4. Provide detailed, constructive feedback
5. Do NOT make any edits (read-only review)

## Review Template

For each file reviewed, provide:

**Strengths:**
- [What's done well]

**Issues:**
- [Problems found with severity: High/Medium/Low]

**Suggestions:**
- [Improvement recommendations]
```

**When to use:** Skills that should be restricted to certain operations (read-only, analysis-only, etc.).

---

## Multi-File Skill with Progressive Disclosure

For complex skills with different scenarios requiring different context.

**Directory structure:**

```
pdf-processor/
  ├── SKILL.md (main instructions and common tasks)
  ├── FORMS.md (form-filling specific guidance)
  ├── REFERENCE.md (detailed API documentation)
  └── scripts/
      ├── validate_pdf.py (validation script)
      └── extract_fields.py (field extraction)
```

**SKILL.md:**

````yaml
---
name: Advanced PDF Processor
description: Extract text, fill forms, merge PDFs, validate documents. Use for PDF manipulation, form filling, or document processing. Requires pdfplumber and pypdf packages.
---

# Advanced PDF Processor

## Quick Start

Extract text from PDF:
```python
import pdfplumber
with pdfplumber.open("document.pdf") as pdf:
    text = pdf.pages[0].extract_text()
    print(text)
````

Extract text from all pages:

```python
import pdfplumber
with pdfplumber.open("document.pdf") as pdf:
    all_text = ""
    for page in pdf.pages:
        all_text += page.extract_text()
```

## Advanced Operations

- **Form filling:** See [FORMS.md](FORMS.md) for detailed form-filling guidance
- **API reference:** See [REFERENCE.md](REFERENCE.md) for complete API documentation
- **Validation:** Run `python scripts/validate_pdf.py <file>` to validate PDF structure
- **Field extraction:** Run `python scripts/extract_fields.py <file>` to list all form fields

## Requirements

This skill requires the following packages:

- `pdfplumber` - For text extraction
- `pypdf` - For PDF manipulation

Request installation if not available.

## Common Tasks

### Extract tables

```python
import pdfplumber
with pdfplumber.open("document.pdf") as pdf:
    table = pdf.pages[0].extract_table()
    for row in table:
        print(row)
```

### Merge PDFs

```python
from pypdf import PdfMerger
merger = PdfMerger()
merger.append("file1.pdf")
merger.append("file2.pdf")
merger.write("merged.pdf")
merger.close()
```

````

**FORMS.md:**
```markdown
# PDF Form Filling

Detailed guidance for filling PDF forms.

## Extracting Form Fields

Use the extract_fields script:
```bash
python scripts/extract_fields.py input.pdf
````

This lists all fields with their names and types.

## Filling Forms

[Detailed form-filling instructions here...]

````

**REFERENCE.md:**
```markdown
# PDF API Reference

Complete API documentation for pdfplumber and pypdf.

[Detailed API docs here...]
````

**When to use:** Complex skills with multiple scenarios, where different contexts need different information.

---

## Skill with Executable Scripts

Use scripts for deterministic operations.

**Directory structure:**

```
data-validator/
  ├── SKILL.md
  └── scripts/
      ├── validate_json.py
      ├── validate_csv.py
      └── validate_xml.py
```

**SKILL.md:**

````yaml
---
name: Data Validator
description: Validate JSON, CSV, and XML data files for structure and schema compliance. Use when validating data files or checking format correctness.
---

# Data Validator

## Validation Scripts

This skill includes deterministic validation scripts for common data formats.

### JSON Validation

```bash
python scripts/validate_json.py <file.json> [schema.json]
````

Validates:

- JSON syntax
- Schema compliance (if schema provided)
- Common structural issues

### CSV Validation

```bash
python scripts/validate_csv.py <file.csv> [--headers]
```

Validates:

- CSV format
- Column consistency
- Header presence (if --headers flag used)

### XML Validation

```bash
python scripts/validate_xml.py <file.xml> [schema.xsd]
```

Validates:

- XML syntax
- XSD schema compliance (if schema provided)
- Well-formedness

## Output Format

All scripts output:

- ✅ PASS: File is valid
- ❌ FAIL: Specific errors found

## Examples

Validate JSON with schema:

```bash
python scripts/validate_json.py data.json schema.json
```

Validate CSV with headers:

```bash
python scripts/validate_csv.py data.csv --headers
```

````

**scripts/validate_json.py:**
```python
#!/usr/bin/env python3
import json
import sys

def validate_json(filepath, schema_path=None):
    try:
        with open(filepath) as f:
            data = json.load(f)
        print(f"✅ PASS: {filepath} is valid JSON")
        return True
    except json.JSONDecodeError as e:
        print(f"❌ FAIL: {filepath} has JSON syntax error: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: validate_json.py <file.json> [schema.json]")
        sys.exit(1)

    valid = validate_json(sys.argv[1])
    sys.exit(0 if valid else 1)
````

**When to use:** Tasks requiring deterministic operations (validation, sorting, parsing, calculations).

---

## Minimal Skill Template

The absolute minimum for a functional skill - **just create SKILL.md with this content**:

```yaml
---
name: [Skill Name]
description: [What it does and when to use it, including trigger keywords]
---

# [Skill Name]

## Instructions

[Step-by-step guidance for Claude to follow]

## Examples

[Concrete examples showing how to use the skill]
```

**File structure:**

```
skill-name/
  └── SKILL.md (that's it!)
```

**When to use:** Starting point for any new skill. Add complexity only when needed - don't create additional files unless SKILL.md becomes too large.

---

## Domain-Specific Skill Template

Template for organization-specific workflows.

````yaml
---
name: API Integration Helper
description: Help integrate with our company REST API. Use when working with API endpoints, authentication, or API requests.
---

# API Integration Helper

## Authentication

All API requests require JWT token:
```bash
export API_TOKEN="your-token-here"
````

Include in requests:

```bash
curl -H "Authorization: Bearer $API_TOKEN" https://api.company.com/endpoint
```

## Common Endpoints

### List Users

```bash
GET /api/v1/users
```

### Create User

```bash
POST /api/v1/users
Content-Type: application/json

{
  "name": "string",
  "email": "string"
}
```

## Best Practices

1. Always include error handling
2. Use pagination for large result sets
3. Implement retry logic with exponential backoff
4. Cache responses when appropriate

## Examples

See [EXAMPLES.md](EXAMPLES.md) for complete integration examples.

## API Reference

Full API documentation: [REFERENCE.md](REFERENCE.md)

````

**When to use:** Capturing organizational knowledge, internal tools, company-specific workflows.

---

## Testing and Development Skill Template

For skills that assist with testing and development workflows.

```yaml
---
name: Test Generator
description: Generate unit tests for code. Use when creating tests, test coverage, or test-driven development.
---

# Test Generator

## Supported Frameworks

- Python: pytest, unittest
- JavaScript: Jest, Mocha
- Go: testing package
- Java: JUnit

## Instructions

1. Analyze the code to be tested
2. Identify:
   - Public functions/methods
   - Edge cases
   - Error conditions
   - Boundary conditions
3. Generate tests with:
   - Clear test names
   - Arrange-Act-Assert pattern
   - Edge case coverage
   - Mocking where needed

## Python Example (pytest)

For function:
```python
def add(a: int, b: int) -> int:
    return a + b
````

Generate:

```python
import pytest

def test_add_positive_numbers():
    assert add(2, 3) == 5

def test_add_negative_numbers():
    assert add(-2, -3) == -5

def test_add_zero():
    assert add(0, 5) == 5
    assert add(5, 0) == 5
```

## Best Practices

- One assertion per test (when possible)
- Test both success and failure cases
- Use descriptive test names
- Include edge cases
- Mock external dependencies

```

**When to use:** Development workflow automation, code generation, testing assistance.

---

## Quick Template Selection Guide

| Use Case | Template | When to Use |
|----------|----------|-------------|
| Simple task | Minimal Skill | Starting point, focused single capability |
| Read-only operations | Tool Restrictions | Analysis, review, research tasks |
| Complex with scenarios | Multi-File | Different contexts need different guidance |
| Deterministic ops | Executable Scripts | Validation, parsing, calculations |
| Company workflows | Domain-Specific | Internal tools, APIs, processes |
| Dev assistance | Testing/Development | Code generation, testing, automation |

## Customization Tips

1. **Start with just SKILL.md** - Use the Minimal Template, add complexity only when needed
2. **Don't create README.md** - It won't be loaded and serves no purpose
3. **Copy similar existing skills** - If one exists that's close, modify it
4. **Test early and often** - Create basic version, test, then enhance
5. **Only split when necessary** - If SKILL.md exceeds ~5k tokens or has mutually exclusive content
6. **Iterate based on usage** - Watch how Claude uses it, refine accordingly

For more guidance on creating and improving skills, see:
- [SKILL.md](SKILL.md) - Creation process
- [EVALUATING.md](EVALUATING.md) - Testing methodology
- [DEBUGGING.md](DEBUGGING.md) - Debugging and improvement
```
