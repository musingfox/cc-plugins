# ADR — Architecture Decision Records Plugin

Lifecycle management for Architecture Decision Records using [MADR 4.0](https://adr.github.io/madr/) format, with full cross-reference consistency enforcement.

## Problem

When an ADR is superseded, existing tools (adr-tools, log4brains, dotnet-adr) only update the old-new ADR pair. Every other file in the repo that references the old ADR remains stale — leading to confusion, outdated guidance, and silent drift.

## Solution

A Claude Code plugin that handles ADR lifecycle with a focus on **supersession cross-reference consistency** — leveraging Claude's ability to do semantic repo-wide search and batch edits.

## Features

### ADR Lifecycle (`adr` skill)

Triggered by natural language — "create an ADR", "supersede ADR-3", "list ADRs", "check ADR references":

- **Create**: Auto-detect ADR directory, auto-number (4-digit zero-padded), apply MADR 4.0 template, suggest related ADRs. On first use, bootstraps with `0000-use-madr.md`.
- **List**: Parse all ADRs, display status table with supersession chains and summary counts.
- **Supersede** (core differentiator): Create new ADR, update old ADR status, then scan the **entire repo** using a 4-layer search pattern (filename, ADR-N marker, markdown link, title substring). Categorize results (ADR files, docs, source code, config) and update with user confirmation per category.
- **Check**: Validate cross-reference consistency — broken links, stale references, missing frontmatter, supersession chains/cycles, orphaned back-references.

### Reference Guard (`adr-ref-guard` skill)

Advisory skill — auto-warns when editing `.md` files that reference superseded or deprecated ADRs. Never auto-replaces — inform only.

## Installation

```bash
/plugin install adr
```

## Usage

All operations are triggered by natural language:

```
"Create an ADR for choosing a message queue"
"Supersede ADR-3 with a new decision to use SQLite"
"List all ADRs"
"Check ADR reference consistency"
```

## ADR Format (MADR 4.0)

```yaml
---
status: proposed          # proposed | accepted | deprecated | superseded by [ADR-NNNN](file)
date: 2025-03-16
decision-makers: ""
---
```

File naming: `NNNN-kebab-case-title.md`

## Directory Detection

The plugin auto-detects ADR directories by scanning: `docs/decisions/`, `docs/adr/`, `adr/`, `decisions/`.

## Design Decisions

1. **Skills over commands** — Natural language triggering removes the need to remember slash commands.
2. **MADR 4.0** — YAML frontmatter enables reliable status parsing without regex.
3. **4-layer search** — Reduces false positives while ensuring no reference is missed.
4. **Per-category update strategy** — ADR files auto-update (core pain point), source code gets conservative markers, config files skipped.
5. **Advisory ref-guard** — Warns but doesn't prevent writes. Use check operation for enforcement.
6. **No external dependencies** — Plugin is pure markdown instruction files.
