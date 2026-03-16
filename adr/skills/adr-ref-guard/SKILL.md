---
name: adr-ref-guard
description: >-
  This skill should be used when Claude is about to write or edit a markdown
  file and the content contains references to Architecture Decision Records
  (ADRs). Look for patterns like "ADR-0003", "ADR-3", "as decided in ADR",
  "per ADR", "see ADR", "according to ADR", links to NNNN-*.md files,
  or mentions of specific ADR titles. When detected, check whether the
  referenced ADRs are superseded or deprecated and present an advisory
  warning. Does not apply when editing ADR files themselves or when no
  ADR directory exists in the project.
---

# ADR Reference Guard

Warn when markdown content references a superseded or deprecated ADR. Advisory only — never auto-replace.

## Activation

Activate when ALL conditions are met:
1. Claude is writing or editing a `.md` file that is NOT an ADR file itself (not inside the ADR directory matching `NNNN-*.md`)
2. The content contains one or more ADR references (see Detection Patterns)
3. An ADR directory exists in the project

Do NOT activate when:
- Editing ADR files themselves (files matching `NNNN-*.md` inside the ADR directory)
- No ADR directory exists
- The file is source code — only guard `.md` files
- An ADR lifecycle operation (create, supersede, check, list) is already in progress

## Detection Patterns

Scan the content being written/edited for:
1. `ADR-NNNN` or `ADR NNNN` (any digit count)
2. Markdown links: `[...](path/to/NNNN-*.md)`
3. Phrases: "as decided in ADR", "per ADR", "see ADR", "according to ADR", "defined in ADR"

## Workflow

1. **Extract references**: Identify all ADR numbers referenced in the content
2. **Locate ADR directory**: Use Glob to find `{docs/decisions,docs/adr,adr,decisions}/[0-9][0-9][0-9][0-9]-*.md`
3. **Find ADR files**: For each referenced number, Glob for `NNNN-*.md` in the ADR directory
4. **Check status**: Read each referenced ADR file, parse YAML frontmatter `status` field
5. **Warn if needed**:
   - If `status` starts with `superseded by`: warn with the replacement ADR
   - If `status` is `deprecated`: warn about relevance
   - If `status` is `proposed` or `accepted`: no warning needed

## Warning Format

Present warnings after the write/edit operation completes. Include the file being edited:

```
ADR Reference Warning (in docs/setup.md):
- ADR-0003 (Use PostgreSQL) is superseded by ADR-0007 (Use SQLite).
  Consider updating the reference to ADR-0007.
- ADR-0005 (Legacy Auth) is deprecated.
  Verify this reference is still relevant.
```

## Constraints

- **Never auto-replace** references. Only inform the user.
- **Never block** the write/edit operation. Present the warning after completion.
- If multiple ADRs are referenced and some are current, only warn about the stale ones.
- If multiple stale references found, suggest running ADR consistency check for a full audit.
