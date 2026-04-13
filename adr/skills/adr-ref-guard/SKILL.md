---
name: adr-ref-guard
description: >-
  This skill should be used when the user asks to "check ADR references in this file",
  "verify ADR references are current", "scan this doc for stale ADR links",
  "audit ADR links in docs", "check for superseded ADRs in my markdown",
  or wants a quick scan of specific markdown files for outdated ADR references.
  Lightweight advisory check — not a full consistency audit (use the adr skill for that).
  Does not apply when no ADR directory exists in the project.
---

# ADR Reference Guard

Check markdown files for references to superseded or deprecated ADRs. Advisory only — never auto-replace.

## When to Use

This is a **manual check skill** — invoke it when you want to audit ADR references:
- Before a PR review, to catch stale ADR references
- After an ADR supersession, to find docs that reference the old ADR
- When the user asks to verify ADR references are current

This skill does NOT auto-activate on Write/Edit operations.

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
