---
name: pm
description: Obsidian Workspace PM — tasks, documents, and ADRs in your Obsidian vault. Triggers on task/doc/ADR lifecycle requests ("add a task", "create an ADR", "archive X", "list in-progress tasks", "refresh dashboard") and via `/obw:pm`. Requires `.obsidian.yaml` with a `pm.project` section.
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
│   ├── tasks/       # active tasks
│   ├── archive/     # completed tasks
│   └── docs/        # docs + ADRs
└── dashboard.base   # cross-project dashboard (optional)
```

Folders are created on demand — `create` / `move` auto-create missing parent folders. No `mkdir` needed.

## Template Names

Fixed: `task`, `doc`, `adr`. Installed into the vault's Obsidian Templates folder by `/obw:init`. Use via CLI `create template=<name>`.

If `obsidian vault=<v> templates` doesn't list one of these, `/obw:init` hasn't run (or the user removed them). Tell the user to re-run init rather than inlining template content here.

## Operations

Use **one call** per known-name read — never chain `search → read`. The pm-specific bits:

- **Create task** → `create` at `pm/{project}/tasks/{name}.md` with `template=task`, then set properties `project` / `priority` / `due` / `tags`.
- **Create doc** → `create` at `pm/{project}/docs/{name}.md` with `template=doc`, then set `project`.
- **Create ADR** → `create` at `pm/{project}/docs/adr-{NNNN}-{title}.md` with `template=adr`, then set `project` / `status`. See ADR numbering below.
- **List tasks** → `search` with `query="[type:task] [project:{project}] [status:<s>]" format=json`.
- **Archive** → set `status=done` and `completed`, then `move` to `pm/{project}/archive`.
- **Delete** → confirm first; fall back to `move` if the build lacks `delete`.

### ADR numbering

Before creating an ADR, `search` with `query="[type:adr] [project:{project}]" format=json` and take max(number)+1, zero-padded to 4 digits.

## Property Schema

**Task**: `type: task`, `status` (todo/in-progress/blocked/done), `priority` (high/medium/low), `project`, `due` (date), `tags` (list), `created`, `completed`.
**Doc**: `type: doc`, `project`, `created`, `updated`.
**ADR**: `type: adr`, `project`, `status` (proposed/accepted/deprecated/superseded), `created`, `deciders`.

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

Conversation-mode status (user asks in chat, not Obsidian): run the equivalent `search` and format a summary table in the reply. Don't write a `.base` file unless asked to.

## Important Rules

1. Read `.obsidian.yaml` before any operation.
2. Never `search` to locate a note whose name is known — go straight to `read`.
3. Never bypass the CLI with filesystem Read/Write against the vault. Only exception: reading `.obsidian/templates.json` / `obsidian.json` during `/obw:init`. Dashboard creation uses the CLI via shell-piped content.
4. Confirm destructive intents (delete, archive-move, ADR supersede) before executing.
5. A claim of "created" / "updated" needs a receipt — the CLI's own success output counts; an error output never does. Report failures as failures.
6. Bulk scans (e.g. auditing all archived tasks) may be delegated to a read-only Explore agent to keep the listing out of context; single-entity operations never need one.
