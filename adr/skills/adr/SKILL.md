---
name: adr
description: >-
  This skill should be used when the user asks to "create an ADR",
  "new decision record", "record a decision", "add an ADR",
  "supersede ADR", "replace ADR", "deprecate ADR",
  "list ADRs", "show decision records", "what ADRs do we have",
  "ADR status", "check ADR references", "validate ADRs",
  "audit ADR consistency", "find stale ADR references",
  or mentions Architecture Decision Records lifecycle management.
  Handles MADR 4.0 format with YAML frontmatter, auto-numbering,
  auto-directory detection, and cross-reference consistency enforcement
  during supersession and deprecation.
---

# ADR Lifecycle Management

Manage Architecture Decision Records using MADR 4.0 format with full cross-reference consistency enforcement.

Do NOT use when:
- User is just discussing architecture without wanting formal ADR management
- User is directly editing an ADR file without asking for lifecycle help

## Directory Detection

Auto-detect the ADR directory by scanning (in order):
1. `docs/decisions/`
2. `docs/adr/`
3. `adr/`
4. `decisions/`

Use Glob: `{docs/decisions,docs/adr,adr,decisions}/[0-9][0-9][0-9][0-9]-*.md`

If no directory found and user wants to create an ADR, ask which location to use.

## MADR 4.0 Format

### Frontmatter

```yaml
---
status: proposed
date: YYYY-MM-DD
decision-makers: ""
---
```

Status values: `proposed` | `accepted` | `deprecated` | `superseded by [ADR-NNNN](file)`

### File Naming

- Pattern: `NNNN-kebab-case-title.md`
- 4-digit zero-padded number
- Scan existing files to determine next number

### Template

Read `${CLAUDE_PLUGIN_ROOT}/skills/adr/references/madr-template.md` for the full MADR 4.0 template.

---

## Operations

### 1. Create New ADR

1. Detect ADR directory (or ask user to choose if none exists)
2. If this is the first ADR in the directory, create the bootstrap ADR first (see below)
3. Scan existing `[0-9][0-9][0-9][0-9]-*.md` files, determine next number
4. Generate kebab-case filename from the title
5. Read the template from `${CLAUDE_PLUGIN_ROOT}/skills/adr/references/madr-template.md` and apply with today's date
6. Search existing ADR titles for keyword overlap and suggest related ADRs
7. Present the created file path

### Bootstrap ADR (First Use)

When no ADRs exist yet, read `${CLAUDE_PLUGIN_ROOT}/skills/adr/references/bootstrap-adr.md` and create `0000-use-madr.md` from its content, replacing `{today}` with the current date.

---

### 2. List ADRs

1. Glob for `[0-9][0-9][0-9][0-9]-*.md` in the ADR directory
2. Read each file's YAML frontmatter (`status`, `date`) and first `# ` heading
3. Display as table:

```
| #    | Title                  | Status                     | Date       |
|------|------------------------|----------------------------|------------|
| 0000 | Use MADR 4.0 for ADRs | [accepted]                 | 2025-03-16 |
| 0001 | Use PostgreSQL         | [superseded -> ADR-0003]   | 2025-01-10 |
| 0002 | REST API Design        | [accepted]                 | 2025-02-01 |
| 0003 | Use SQLite             | [accepted]                 | 2025-03-15 |
```

4. If supersession chains exist, show them: `0001 -> 0003`
5. Summary: `Total: 4 | accepted: 2 | proposed: 0 | superseded: 1 | deprecated: 0`

---

### 3. Supersede ADR (Core Feature)

This is the most critical operation. Execute ALL steps in order.

#### Step 1 — Validate

- Locate the old ADR by number (e.g., "ADR-3" resolves to `0003-*.md`)
- Read its frontmatter, verify current status
- If already superseded, warn about supersession chain and ask whether to proceed
- Extract its title for references

#### Step 2 — Create new ADR

- Follow the "Create New ADR" flow
- In the "More Information" section, add: `Supersedes [ADR-NNNN](old-adr-file.md)`

#### Step 3 — Update old ADR

Edit the old ADR file:

1. Change frontmatter `status` to: `superseded by [ADR-{new}]({new-adr-file.md})`
2. Insert callout immediately after the frontmatter closing `---`, before the first heading:

```markdown

> **SUPERSEDED**: This ADR has been superseded by [ADR-NNNN: New Title](new-adr-file.md). The decision described here is no longer in effect.

```

#### Step 4 — Full repo cross-reference scan

Search the ENTIRE repository for references to the old ADR using a 4-layer pattern:

**Layer 1 — Filename**: Grep for the old ADR filename
```
pattern: 0003-use-postgresql\.md
```

**Layer 2 — ADR-N marker**: Grep for ADR number in various formats
```
pattern: ADR[-\s]?0*3\b
(matches: ADR-3, ADR-0003, ADR 3, ADR-03)
```

**Layer 3 — Markdown link**: Grep for links containing the ADR number
```
pattern: \[.*?\]\(.*?0003-.*?\)
```

**Layer 4 — Title substring**: Grep `.md` files only for the old ADR's title
```
pattern: "Use PostgreSQL" (exact title, .md files only to reduce noise)
```

**Exclude** from all searches:
- The old and new ADR files themselves
- Directories: `node_modules/`, `.git/`, `target/`, `dist/`, `build/`, `vendor/`, `.agents/`

#### Step 5 — Categorize results

Group matches into categories and present as table:

| Category | Files Found | Default Action |
|----------|-------------|----------------|
| Other ADR files | `0005-api-versioning.md` | Auto-update |
| Documentation (non-ADR `.md`) | `docs/setup.md` | Auto-update |
| Source code comments | `src/db.ts` | Add `(superseded)` marker |
| Config files | `config.yaml` | Skip — manual review |

Use AskUserQuestion per category for the user to choose:
- **Auto-update**: Replace old ADR references with new ADR
- **Add notice**: Append `(superseded — see ADR-NNNN)` after reference
- **Skip**: Leave unchanged, flag for manual review

#### Step 6 — Execute updates

For **auto-update** targets:
- In ADR files: update `superseded by` references, update markdown links
- In docs: replace ADR number references, update links, add "(formerly ADR-{old})" if helpful

For **add notice** targets:
- Append `(superseded — see [ADR-NNNN](path/to/new-adr.md))` after each reference

#### Step 7 — Report

```
Supersession Complete:
  Created:    ADR-0007: Use SQLite (0007-use-sqlite.md)
  Superseded: ADR-0003: Use PostgreSQL (0003-use-postgresql.md)

Cross-Reference Updates:
  Auto-updated:  3 files
  Notice added:  1 file
  Skipped:       1 file (manual review needed)
    - config/database.yaml (line 12)
```

---

### 4. Deprecate ADR

Simpler than supersession — no replacement ADR is created.

#### Step 1 — Validate

- Locate the ADR by number
- Read its frontmatter, verify it is not already deprecated or superseded
- Extract its title

#### Step 2 — Update ADR

1. Change frontmatter `status` to: `deprecated`
2. Insert callout immediately after the frontmatter closing `---`:

```markdown

> **DEPRECATED**: This ADR is deprecated. The decision described here is no longer relevant.

```

#### Step 3 — Cross-reference scan

Run the same 4-layer search as supersede Step 4, but use **add notice** as the default action for all categories:
- Append `(deprecated)` after each reference found

Present findings and ask user per category whether to add notice or skip.

#### Step 4 — Report

```
Deprecation Complete:
  Deprecated: ADR-0005: Legacy Auth (0005-legacy-auth.md)

Cross-Reference Updates:
  Notice added:  2 files
  Skipped:       1 file (manual review needed)
```

---

### 5. Check ADR Consistency

Run these validation checks and report grouped by severity:

#### ERRORS (must fix)

- **Broken links**: Markdown links to non-existent ADR files. Scan all `.md` files for links matching `NNNN-*.md`, verify target exists.
- **Circular supersession**: A -> B -> A. Follow supersession chains, detect cycles.

#### WARNINGS (should fix)

- **Stale references**: Files referencing superseded ADRs without a supersession notice. Use the 4-layer search pattern (same as supersede Step 4) for each superseded ADR.
- **Missing frontmatter**: ADR files without `status` or `date` fields in YAML frontmatter.
- **Orphaned supersession**: Status says "superseded by X" but X doesn't contain "Supersedes" back-reference in its More Information section.

#### INFO

- **Supersession chains**: A -> B -> C (3+ links). Suggest simplification.
- **Numbering gaps**: Missing numbers in the sequence. Informational only.

Output format:
```
ADR Consistency Check:

ERRORS (2):
  [broken-link] docs/setup.md:15 links to 0009-missing.md — file does not exist
  [circular] ADR-0003 -> ADR-0007 -> ADR-0003

WARNINGS (1):
  [stale-ref] README.md:42 references ADR-0003 (superseded by ADR-0007)

INFO (1):
  [gap] Missing numbers: 0004, 0006

Summary: 2 errors, 1 warning, 1 info
```

If errors or warnings found, suggest running supersede or manual fixes.
