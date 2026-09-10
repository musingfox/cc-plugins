---
name: pm
description: Obsidian Workspace PM — tasks, documents, and ADRs in your Obsidian vault. Triggers on task/doc/ADR lifecycle requests ("add a task", "create an ADR", "archive X", "list in-progress tasks", "refresh dashboard", "split this spec into tickets") and via `/obw:pm`. Requires `.obsidian.yaml` with a `pm.project` section.
---

# pm — Obsidian Project Management

Run the `obsidian` CLI directly — no sub-agent. Before any CLI call, invoke the `obsidian:obsidian-cli` skill to load exact syntax — never run `obsidian help`/`--help` to discover it. This skill owns only the PM conventions: folder layout, template names, property schema, ADR numbering, and dashboard generation.

**CLI gotcha**: `file=` resolves like a wikilink — bare note name only, no path, no `.md`. Use `path=` for vault-root-relative paths. If a command returns `File not found` after a `create`, fix the parameter — never re-run `create` (it makes `name 1.md` duplicates).

**`property:set` gotcha**: one property per call, no batch form. Pass `type=list` for `tags`, `type=date` for `due`/`completed` — omit `type=` and it's stored as plain text.

## Config (`.obsidian.yaml`)

```yaml
vault: <VAULT_NAME>
pm:
  project: <PROJECT_NAME>
```

Missing config or `pm.project` → tell the user to run `/obw:init` and stop. Never guess the vault.

## Vault Layout

```
pm/
├── {project}/
│   ├── dashboard.base   # project dashboard
│   ├── tasks/           # active tasks
│   │   └── archive/     # completed tasks
│   └── docs/            # docs + ADRs
└── dashboard.base       # cross-project dashboard (optional)
```

Every project has all three: `tasks/`, `docs/`, `dashboard.base`. `/obw:init` bootstraps them. If a pm operation finds `pm/{project}/dashboard.base` missing, regenerate it (see Dashboards) before reporting done.

Beyond that, folders are created on demand — `create` / `move` auto-create missing parent folders. No `mkdir` needed.

## Filenames

Kebab-case, always: lowercase, whitespace and punctuation → `-`, collapse repeats, Unicode characters kept intact. Same rule as `/obw:jot` note mode.

The human-readable title is not derivable from the filename, so it lives in the `title` property. Obsidian's `{{title}}` resolves to the filename, so the H1 stays kebab — `title` is what dashboards display.

- `Implement Auth` → `pm/{project}/tasks/implement-auth.md`, `title: Implement Auth`
- ADR `Switch to SQLite` → `pm/{project}/docs/adr-0007-switch-to-sqlite.md`, `title: Switch to SQLite`

## Template Names

Fixed: `task`, `doc`, `adr`. Installed into the vault's Obsidian Templates folder by `/obw:init`. Use via CLI `create template=<name>`.

If `obsidian vault=<v> templates` doesn't list one of these, `/obw:init` hasn't run (or the user removed them). Tell the user to re-run init rather than inlining template content here.

## Operations

Use **one call** per known-name read — never chain `search → read`. The pm-specific bits:

- **Create task** → `create` at `pm/{project}/tasks/{kebab}.md` with `template=task`, then set properties `title` / `project` / `priority` / `due` / `tags`.
- **Create doc** → `create` at `pm/{project}/docs/{kebab}.md` with `template=doc`, then set `title` / `project`.
- **Create ADR** → `create` at `pm/{project}/docs/adr-{NNNN}-{kebab}.md` with `template=adr`, then set `title` / `project` / `status`. See ADR numbering below.
- **List tasks** → `search` with `query="[type:task] [project:{project}] [status:<s>]" format=json`.
- **To tickets** → split a spec, task, or conversation into tickets with blocking edges; see To Tickets.
- **Archive** → set `status=done` and `completed`, then `move` to `pm/{project}/tasks/archive`. Run the dependent check first (see Relations).
- **Delete** → confirm first; fall back to `move` if the build lacks `delete`.

### ADR numbering

Before creating an ADR, `search` with `query="[type:adr] [project:{project}]" format=json` and take max(number)+1, zero-padded to 4 digits.

## Relations

Three link properties on tasks, all holding wikilinks: `blocked_by` (list), `related` (list), `parent` (single).

Only the stated direction is stored. The inverse — who this task blocks, its subtasks — is read from Obsidian's backlinks pane or a Bases `file.hasLink()` filter. Never write a `blocks` or `subtasks` field: two fields for one edge drift apart.

- **Link** → `property:set` with `type=list` for `blocked_by` / `related`, plain for `parent`. Values are `[[kebab-name]]` — resolve the target with `search` first if the name is uncertain, and refuse a link to a note that does not exist.
- **`property:set` replaces, never appends** — there is no property-append verb. To add one blocker, `read` the task's current `blocked_by`, and set the full list back with the new entry included. Setting a bare new value silently drops the existing links.
- **`blocked_by` implies status** — after adding a blocker, set `status=blocked`. After removing the last blocker, ask whether to return the task to `todo` or `in-progress`.
- **Archiving cascades a prompt** — before archiving `X`, `search` `query="[type:task] [project:{project}] [blocked_by:X]" format=json`. If any task depends on `X`, list them and ask whether to drop `X` from their `blocked_by` (and un-block those left with none). Never edit dependents silently.
- **Cycles** — before adding `A` to `B.blocked_by`, walk `A`'s own `blocked_by` chain. If it reaches `B`, refuse and report the cycle.
- `parent` is for epic → subtask decomposition only; use `related` for anything else.

## To Tickets

Ticket splitting adapted from [mattpocock/skills](https://github.com/mattpocock/skills) `to-tickets` (MIT, Copyright (c) 2026 Matt Pocock), commit 3cca18b368ae95cdbdebbff572ccafa662551015. Upstream's wide refactor expand-contract sequencing is not imported: this skill keeps the three vertical-slice rules plus prefactor and maps blocking edges onto existing `blocked_by`.

Look for prefactor opportunities first: make the change easy, then make the easy change.

Every ticket is a vertical slice:

- A complete narrow path through schema, API, UI, and tests — not a horizontal layer.
- Demoable or verifiable on its own.
- Sized to one fresh context window.
- Prefactor done first.

Split a spec, task, or conversation already in context — or a vault reference the user names. A missing reference stops with the CLI error. Nothing to split → say so and write nothing.

Before any vault write, show a numbered list. Per ticket: **Title**, **Blocked by** (other titles or none), **What it delivers**. Then `AskUserQuestion` with at least: approve / too coarse / too fine / edges wrong. Repeat until the user approves. Only then publish.

Create tickets blockers first so no link targets a missing note. Per ticket, in that order: one **Create task** (kebab filename, `template=task`, `title` and `project`); fill `## Description` from what it delivers and `## Acceptance Criteria`. If it has blockers, set `blocked_by` once with its complete list of `[[kebab]]` wikilinks and `status=blocked`. If the source is a task note in the same project, set `parent` to `[[source]]`. Any later blocker on an already-existing task follows Relations. The source is never modified.

A `create` error mid-publish → stop, receipt of which tickets landed and which did not, never re-run `create`. End with a receipt of created filenames.

Startable tickets — the frontier — are one `search` with `query="[type:task] [project:{project}] -[status:done] -[blocked_by:\"[[\"]" format=json`. `blocked_by` values are always `[[kebab]]` wikilinks; an empty list `[]` is not excluded by presence, only by value. A linear chain yields one at a time.

## Property Schema

**Task**: `title`, `type: task`, `status` (todo/in-progress/blocked/done), `priority` (high/medium/low), `project`, `due` (date), `tags` (list), `parent` (link), `blocked_by` (list of links), `related` (list of links), `created`, `completed`.
**Doc**: `title`, `type: doc`, `project`, `created`, `updated`.
**ADR**: `title`, `type: adr`, `project`, `status` (proposed/accepted/deprecated/superseded), `created`, `deciders`.

Property names are lowercase. Do not invent fields — dashboards depend on this schema.

## Dashboards

Dashboards are **Obsidian Bases** (`.base` files — core in 1.9+). For Bases schema / filter / formula syntax, defer to the `obsidian:obsidian-bases` skill.

Generated from plugin templates via shell (template contents never enter context):

- **Cross-project** → `pm/dashboard.base`:
  ```bash
  obsidian vault={vault} create path="pm/dashboard.base" \
    content="$(cat "${CLAUDE_PLUGIN_ROOT}/templates/dashboard-cross.base")" overwrite
  ```
- **Per-project** → `pm/{project}/dashboard.base`:
  ```bash
  obsidian vault={vault} create path="pm/{project}/dashboard.base" \
    content="$(sed "s/__PROJECT__/{project}/g" "${CLAUDE_PLUGIN_ROOT}/templates/dashboard-project.base")" overwrite
  ```

Conversation-mode status (user asks in chat, not Obsidian): run the equivalent `search` and format a summary table in the reply. Don't rewrite an existing `.base` file unless asked to — the only unprompted write is recreating a project dashboard that has gone missing.

## Important Rules

1. Read `.obsidian.yaml` before any operation.
2. Never `search` to locate a note whose name is known — go straight to `read`.
3. Never bypass the CLI with filesystem Read/Write against the vault. Only exceptions, both inside `/obw:init`: reading `.obsidian/templates.json` / `obsidian.json`, and `mkdir` for the templates folder and the project skeleton (the CLI has no folder verb). Dashboard creation uses the CLI via shell-piped content.
4. Confirm destructive intents (delete, archive-move, ADR supersede) before executing.
5. A claim of "created" / "updated" needs a receipt — the CLI's own success output counts; an error output never does. Report failures as failures.
6. Bulk scans (e.g. auditing all archived tasks) may be delegated to a read-only Explore agent to keep the listing out of context; single-entity operations never need one.
