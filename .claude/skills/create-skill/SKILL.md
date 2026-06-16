---
name: create-skill
description: >-
  Guides users through creating effective Agent Skills for Cursor. Use when you
  want to create, write, or author a new skill, or asks about skill structure,
  best practices, or SKILL.md format.
---
# Creating Skills in Cursor

This skill guides you through creating effective Agent Skills for Cursor. Skills are markdown files that teach the agent how to perform specific tasks: reviewing PRs using team standards, generating commit messages in a preferred format, querying database schemas, or any specialized workflow.

## Default: no global skills (project only)

**Do not** create or symlink `~/.claude/skills`, `~/.cursor/skills`, or `~/.agents/skills` unless the user **explicitly** asks for global/personal skills. Skills live **in the repository you are working in**, not in home.

| Layer | Policy |
| --- | --- |
| `~/.claude/skills`, `~/.cursor/skills`, `~/.agents/skills` | **Absent** by default — no shared global tree |
| `~/.codex/skills/` | Codex bundled `.system/` only; **do not** symlink project skills into `~/.codex/skills` unless the user asks |
| **Per repo** | **Write here:** `<repo>/.claude/skills/skill-name/` |

When the user opens a repo in Cursor/Claude, tools load **that repo’s** `.claude/skills` (and paths that symlink to it). Another repo’s skills are invisible until you work in that repo.

**Sharing a skill across repos:** copy or sync the `skill-name/` directory into each repo’s `.claude/skills/`, or add it only to the repo where it applies. Do not use `~/` as a shortcut.

## Default: project skills (repo canonical `.claude/skills`)

When **creating** a new **project** skill (checked into a repository), write the
skill under **`<repo>/.claude/skills/skill-name/`**.

**Local Motion:** `.agents/skills` and `.cursor/skills` symlink to `.claude/skills`. Add new project skills only under `.claude/skills/skill-name/`; do not recreate a parallel tree under `.cursor/skills`. Confirm with `ls -la .agents/skills .cursor/skills`.

**Other repos:** use that repo's local convention. Prefer one source of truth:
`.claude/skills/` with `.cursor/skills` and `.agents/skills` symlinked to it.
If a repo has real directories instead of symlinks, mirror the same files only
inside that repo. Never install under `~/` unless the user explicitly opts into
global skills.

## Before You Begin: Gather Requirements

Before creating a skill, gather essential information from the user about:

1. **Purpose and scope**: What specific task or workflow should this skill help with?
2. **Target location**: **Project only** → [no global skills](#default-no-global-skills-project-only) + [project canonical `.claude/skills`](#default-project-skills-repo-canonical-claudeskills). Do **not** install under `~/` unless the user explicitly asks for global skills. Confirm any **single-tool** exception before skipping a repo path.
3. **Trigger scenarios**: When should the agent automatically apply this skill?
4. **Key domain knowledge**: What specialized information does the agent need that it wouldn't already know?
5. **Output format preferences**: Are there specific templates, formats, or styles required?
6. **Existing patterns**: Are there existing examples or conventions to follow?

### Inferring from Context

If you have previous conversation context, infer the skill from what was discussed. You can create skills based on workflows, patterns, or domain knowledge that emerged in the conversation.

### Gathering Additional Information

If you need clarification, use the AskQuestion tool when available:

```
Example AskQuestion usage:
- "Where should this skill be stored?" with options like ["This repo only—`.claude/skills/` (default)", "Global `~/` skills (explicit opt-in)", "Single-tool exception (explicit)"]
- "Should this skill include executable scripts?" with options like ["Yes", "No"]
```

If the AskQuestion tool is not available, ask these questions conversationally.

---

## Skill File Structure

### Directory Layout

Skills are stored as directories containing a `SKILL.md` file:

```
skill-name/
├── SKILL.md              # Required - main instructions
├── reference.md          # Optional - detailed documentation
├── examples.md           # Optional - usage examples
└── scripts/              # Optional - utility scripts
    ├── validate.py
    └── helper.sh
```

### Storage Locations

| Type | Path | Scope |
|------|------|-------|
| Project (default) | `<repo>/.claude/skills/skill-name/` | That repository only; team shares via git |
| Global (opt-in only) | `~/.claude/skills/skill-name/` etc. | Only when the user explicitly requests global skills |

**Project default:** When adding a new checked-in skill, create it under **`<repo>/.claude/skills/`** only (see [Default: project skills](#default-project-skills-repo-canonical-claudeskills)).

**IMPORTANT**: Never create **your** skills in `~/.cursor/skills-cursor/`. That directory is for Cursor-shipped defaults. Maintain project skills under **`<repo>/.claude/skills/`**.

### Same skill in Cursor, Claude Code, Codex, or Agents

Other assistants may read repo-local skill paths with the same
`skill-name/SKILL.md` layout:

| Tool | Project skills path | Notes |
|------|---------------------|--------|
| Cursor | `<repo>/.cursor/skills/` → symlink to `.claude/skills` when configured | Open the repo as the workspace |
| Claude Code | `<repo>/.claude/skills/skill-name/` | Canonical write path |
| Agents / Codex (repo) | `<repo>/.agents/skills/` → symlink to `.claude/skills` when configured | Same files as `.claude/skills` when symlinked |
| Codex (global) | `~/.codex/skills/.system/` only | Bundled; do not edit `.system` |

Do **not** add skills under `~/` unless the user opted in to global skills.

### SKILL.md Structure

Every skill requires a `SKILL.md` file with YAML frontmatter and markdown body:

```markdown
---
name: your-skill-name
description: Brief description of what this skill does and when to use it
---

# Your Skill Name

## Instructions
Clear, step-by-step guidance for the agent.

## Examples
Concrete examples of using this skill.
```

### Required Metadata Fields

| Field | Requirements | Purpose |
|-------|--------------|---------|
| `name` | Max 64 chars, lowercase letters/numbers/hyphens only | Unique identifier for the skill |
| `description` | Max 1024 chars, non-empty | Helps agent decide when to apply the skill |

---

## Writing Effective Descriptions

The description is **critical** for skill discovery. The agent uses it to decide when to apply your skill.

### Description Best Practices

1. **Write in third person** (the description is injected into the system prompt):
   - ✅ Good: "Processes Excel files and generates reports"
   - ❌ Avoid: "I can help you process Excel files"
   - ❌ Avoid: "You can use this to process Excel files"

2. **Be specific and include trigger terms**:
   - ✅ Good: "Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction."
   - ❌ Vague: "Helps with documents"

3. **Include both WHAT and WHEN**:
   - WHAT: What the skill does (specific capabilities)
   - WHEN: When the agent should use it (trigger scenarios)

### Description Examples

```yaml
# PDF Processing
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.

# Excel Analysis
description: Analyze Excel spreadsheets, create pivot tables, generate charts. Use when analyzing Excel files, spreadsheets, tabular data, or .xlsx files.

# Git Commit Helper
description: Generate descriptive commit messages by analyzing git diffs. Use when the user asks for help writing commit messages or reviewing staged changes.

# Code Review
description: Review code for quality, security, and best practices following team standards. Use when reviewing pull requests, code changes, or when the user asks for a code review.
```

---

## Core Authoring Principles

### 1. Concise is Key

The context window is shared with conversation history, other skills, and requests. Every token competes for space.

**Default assumption**: The agent is already very smart. Only add context it doesn't already have.

Challenge each piece of information:
- "Does the agent really need this explanation?"
- "Can I assume the agent knows this?"
- "Does this paragraph justify its token cost?"

**Good (concise)**:
```markdown
## Extract PDF text

Use pdfplumber for text extraction:

\`\`\`python
import pdfplumber

with pdfplumber.open("file.pdf") as pdf:
    text = pdf.pages[0].extract_text()
\`\`\`
```

**Bad (verbose)**:
```markdown
## Extract PDF text

PDF (Portable Document Format) files are a common file format that contains
text, images, and other content. To extract text from a PDF, you'll need to
use a library. There are many libraries available for PDF processing, but we
recommend pdfplumber because it's easy to use and handles most cases well...
```

### 2. Keep SKILL.md Under 500 Lines

For optimal performance, the main SKILL.md file should be concise. Use progressive disclosure for detailed content.

### 3. Progressive Disclosure

Put essential information in SKILL.md; detailed reference material in separate files that the agent reads only when needed.

```markdown
# PDF Processing

## Quick start
[Essential instructions here]

## Additional resources
- For complete API details, see `reference.md`
- For usage examples, see `examples.md`
```

**Keep references one level deep** - link directly from SKILL.md to reference files. Deeply nested references may result in partial reads.

### 4. Set Appropriate Degrees of Freedom

Match specificity to the task's fragility:

| Freedom Level | When to Use | Example |
|---------------|-------------|---------|
| **High** (text instructions) | Multiple valid approaches, context-dependent | Code review guidelines |
| **Medium** (pseudocode/templates) | Preferred pattern with acceptable variation | Report generation |
| **Low** (specific scripts) | Fragile operations, consistency critical | Database migrations |

## Utility Scripts

Pre-made scripts offer advantages over generated code:
- More reliable than generated code
- Save tokens (no code in context)
- Save time (no code generation)
- Ensure consistency across uses

```markdown
## Utility scripts

**analyze_form.py**: Extract all form fields from PDF
\`\`\`bash
python scripts/analyze_form.py input.pdf > fields.json
\`\`\`

**validate.py**: Check for errors
\`\`\`bash
python scripts/validate.py fields.json
# Returns: "OK" or lists conflicts
\`\`\`
```

Make clear whether the agent should **execute** the script (most common) or **read** it as reference.

---

## Anti-Patterns to Avoid

### 1. Windows-Style Paths
- ✅ Use: `scripts/helper.py`
- ❌ Avoid: `scripts\helper.py`

### 2. Too Many Options
```markdown
# Bad - confusing
"You can use pypdf, or pdfplumber, or PyMuPDF, or..."

# Good - provide a default with escape hatch
"Use pdfplumber for text extraction.
For scanned PDFs requiring OCR, use pdf2image with pytesseract instead."
```

### 3. Time-Sensitive Information
```markdown
# Bad - will become outdated
"If you're doing this before August 2025, use the old API."

# Good - use an "old patterns" section
## Current method
Use the v2 API endpoint.

## Old patterns (deprecated)
<details>
<summary>Legacy v1 API</summary>
...
</details>
```

### 4. Inconsistent Terminology
Choose one term and use it throughout:
- ✅ Always "API endpoint" (not mixing "URL", "route", "path")
- ✅ Always "field" (not mixing "box", "element", "control")

### 5. Vague Skill Names
- ✅ Good: `processing-pdfs`, `analyzing-spreadsheets`
- ❌ Avoid: `helper`, `utils`, `tools`

---

## Skill Creation Workflow

When helping a user create a skill, follow this process:

### Phase 1: Discovery

Gather information about:
1. The skill's purpose and primary use case
2. Storage location (**project-only** default; **no** `~/` unless the user explicitly asked for global skills)
3. Trigger scenarios
4. Any specific requirements or constraints
5. Existing examples or patterns to follow

If you have access to the AskQuestion tool, use it for efficient structured gathering. Otherwise, ask conversationally.

### Phase 2: Design

1. Draft the skill name (lowercase, hyphens, max 64 chars)
2. Write a specific, third-person description
3. Outline the main sections needed
4. Identify if supporting files or scripts are needed

### Phase 3: Implementation

1. Create the directory structure
2. Write the SKILL.md file with frontmatter
3. Create any supporting reference files
4. Create any utility scripts if needed
5. **Project skills:** add **`skill-name/`** under **`<repo>/.claude/skills/`**. If **`.cursor/skills`** and **`.agents/skills`** symlink to **`.claude/skills`** (Local Motion default), stop there. Otherwise mirror the same `SKILL.md` (and siblings) to those paths, or add symlinks once at the repo root.
6. **Do not** create **`~/.claude/skills`**, **`~/.cursor/skills`**, or **`~/.agents/skills`** unless the user explicitly requested global skills.

### Phase 4: Verification

1. Verify the SKILL.md is under 500 lines
2. Check that the description is specific and includes trigger terms
3. Ensure consistent terminology throughout
4. Verify all file references are one level deep
5. **No global skills:** `~/.claude/skills`, `~/.cursor/skills`, and `~/.agents/skills` should **not** exist (unless the user opted in)
6. **Project skills:** `SKILL.md` exists under **`<repo>/.claude/skills/`**; **`readlink .cursor/skills`** and **`readlink .agents/skills`** point at **`.claude/skills`** when the repo uses symlinks (Local Motion default)
7. Test that the skill can be discovered and applied

## Summary Checklist

Before finalizing a skill, verify:

### Core Quality
- [ ] Description is specific and includes key terms
- [ ] Description includes both WHAT and WHEN
- [ ] Written in third person
- [ ] SKILL.md body is under 500 lines
- [ ] Consistent terminology throughout
- [ ] Examples are concrete, not abstract

### Structure
- [ ] File references are one level deep
- [ ] Progressive disclosure used appropriately
- [ ] Workflows have clear steps
- [ ] No time-sensitive information

### Global skills (opt-in only)
- [ ] User explicitly requested global skills before creating anything under `~/`

### Project (repo) skills — default
- [ ] `SKILL.md` under `.claude/skills/` is the canonical file; `.cursor/skills` and `.agents/skills` either symlink to `.claude/skills` (Local Motion) or hold identical copies

### If Including Scripts
- [ ] Scripts solve problems rather than punt
- [ ] Required packages are documented
- [ ] Error handling is explicit and helpful
- [ ] No Windows-style paths
