# ADR Plugin Proposal

> **Note**: This is the original proposal. The final implementation evolved to a **skills-only architecture** (no slash commands) — all 4 operations (new, list, supersede, check) plus deprecation are handled by a single `adr` skill triggered via natural language, complemented by an `adr-ref-guard` advisory skill. See `skills/` for the actual implementation.

Architecture Decision Records lifecycle management for Claude Code, using MADR 4.0 format with full cross-reference consistency enforcement.

## Problem

When an ADR is superseded, existing tools (adr-tools, log4brains, dotnet-adr) only update the old ↔ new ADR pair. Every other file in the repo that references the old ADR remains stale — leading to confusion, outdated guidance, and silent drift.

No existing tool solves this.

## Solution

A Claude Code plugin that handles ADR lifecycle with a focus on **supersession cross-reference consistency** — leveraging Claude's ability to do semantic repo-wide search and batch edits.

## Plugin Structure

```
adr/
├── .claude-plugin/
│   └── plugin.json
├── commands/
│   ├── adr-new.md
│   ├── adr-supersede.md
│   ├── adr-check.md
│   └── adr-list.md
├── skills/
│   └── adr-ref-guard/
│       └── SKILL.md
└── README.md
```

## Commands

### `/adr-new [title]`

Create a new ADR with MADR 4.0 template.

- Auto-detect ADR directory (scan `docs/decisions/`, `docs/adr/`, `adr/`)
- Auto-number: scan existing `NNNN-*.md`, assign next number (4-digit zero-padded)
- Generate kebab-case filename from title
- Apply MADR 4.0 template with YAML frontmatter (`status`, `date`, `decision-makers`)
- On first use, create `0000-use-madr.md` bootstrap ADR
- Suggest related existing ADRs by keyword match

**Allowed tools**: Read, Write, Glob, Bash, AskUserQuestion

### `/adr-supersede <old-id> [new-title]`

Core differentiator. Supersede an ADR and update ALL cross-references across the repo.

**Step 1 — Validate**: Locate old ADR, verify status, extract title. Warn if already superseded (chain).

**Step 2 — Create new ADR**: Same flow as `/adr-new`, with `Supersedes [ADR-NNNN](file)` in "More Information".

**Step 3 — Update old ADR**:
- Change frontmatter `status` to `superseded by [ADR-NNNN](file)`
- Add `> [!CAUTION]` callout at top of body

**Step 4 — Full repo cross-reference scan** (the key feature):

4-layer search pattern:
1. Filename reference: `0003-use-postgresql.md`
2. ADR-N marker: `ADR-3`, `ADR-0003`, `ADR 3`
3. Markdown link: `[...](0003-...)`
4. Title substring (`.md` files only, to reduce noise)

Exclude: old/new ADR themselves, `node_modules/`, `.git/`, `target/`, `dist/`

**Step 5 — Categorized results**:

| Category | Default action |
|----------|---------------|
| Other ADR files | Auto-update (primary pain point) |
| Documentation (non-ADR `.md`) | Auto-update |
| Source code comments | Add `(superseded)` marker |
| Config files | Skip (manual) |

Present findings as table. Use AskUserQuestion per category for user to choose update strategy.

**Step 6 — Report**: Created/superseded ADRs, files updated, files skipped, manual action needed.

**Allowed tools**: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion

### `/adr-check`

Validate ADR cross-reference consistency.

Checks:
- **Stale references**: Files referencing superseded ADRs without notice
- **Broken links**: Markdown links to non-existent ADR files
- **Missing frontmatter**: ADRs without `status` or `date`
- **Supersession chains**: A → B → C (flag for simplification)
- **Circular supersession**: A → B → A (error)
- **Orphaned supersession**: Status says "superseded by X" but X doesn't reference back
- **Numbering gaps**: Informational only

Output grouped by severity: Errors → Warnings → Info.

**Allowed tools**: Read, Glob, Grep, Bash

### `/adr-list`

List all ADRs with status overview.

- Parse each ADR's frontmatter + title
- Display status table with indicators (`📋 proposed`, `✅ accepted`, `⬆️ superseded → N`, `❌ deprecated`)
- Show supersession chains as tree
- Summary line: total, accepted, proposed, superseded, deprecated

**Allowed tools**: Read, Glob, Bash

## Skill

### `adr-ref-guard`

Advisory skill — auto-warns when editing `.md` files that reference superseded ADRs.

**Trigger**: Content being written contains `ADR-NNNN`, link to `NNNN-*.md`, or phrases like "as decided in ADR", "per ADR".

**Behavior**: Read referenced ADR's status. If superseded, warn with replacement suggestion. If deprecated, warn about relevance. Never auto-replace — inform only.

**Does NOT trigger**: When editing ADR files themselves, when no ADR directory exists, on source code comments.

## ADR Format (MADR 4.0)

```yaml
---
status: proposed          # proposed | accepted | deprecated | superseded by [ADR-NNNN](file)
date: 2025-03-16
decision-makers: ""
---
```

Sections: Context and Problem Statement → Decision Drivers → Considered Options → Decision Outcome (Consequences, Confirmation) → Pros and Cons of the Options → More Information

File naming: `NNNN-kebab-case-title.md`

## Design Decisions

1. **No external dependencies** — plugin IS the markdown command/skill files. No CLI tool to install.
2. **MADR 4.0 over adr-tools format** — YAML frontmatter enables `yaml.parse()` instead of regex for status parsing.
3. **4-layer search over single regex** — reduces false positives while ensuring no reference is missed.
4. **Per-category update strategy** — ADR files auto-update (core pain point), source code gets conservative markers, config files skipped.
5. **Advisory skill, not blocking hook** — `adr-ref-guard` warns but doesn't prevent writes. Use `/adr-check` for enforcement.

## Implementation Order

1. `/adr-new` — foundation, establishes format and directory conventions
2. `/adr-list` — simple, validates parsing logic works
3. `/adr-supersede` — core feature, depends on 1
4. `/adr-check` — validation, reuses search patterns from 3
5. `adr-ref-guard` skill — last, builds on all above

## Release Checklist

- [ ] Implement all 4 commands + 1 skill
- [ ] Test in a project with existing ADRs
- [ ] Test first-use bootstrap (no existing ADRs)
- [ ] Test supersession with cross-references in ADRs, docs, and source code
- [ ] Add entry to `marketplace.json`
- [ ] Update root `README.md` and `CLAUDE.md`
