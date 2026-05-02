---
name: pm
description: |
  Project management via Obsidian vault — tasks, documents, ADRs, and dashboards
  scoped to a `.obsidian.yaml`-bound project. Owns folder layout and property schema;
  delegates all vault I/O to the Obsidian CLI.
when-to-use: |
  Triggered for project-scoped vault operations — "obsidian task", "vault task",
  "建立任務到 vault", "查 vault 裡的任務", "obsidian 看板", "obsidian ADR",
  "create task in vault", "list vault tasks", "vault status". Also triggers on `/obw:pm`.
  Requires `.obsidian.yaml` with a `pm.project` field.
  NOT triggered by generic "create a task" without Obsidian/vault context.
  For ad-hoc vault notes outside a project, use `obsidian:obsidian-cli` instead.
---

# pm — Obsidian Project Management

This skill owns: folder layout, template names, property schema, ADR numbering, dashboard generation strategy, and the direct-read rule. **For all CLI syntax, invoke the official `obsidian:obsidian-cli` skill first** — it is the authoritative reference. Only fall back to `obsidian help` if that skill's guidance is missing or contradicts observed behavior.

## Config (`.obsidian.yaml`)

```yaml
vault: <VAULT_NAME>
pm:
  project: <PROJECT_NAME>
```

Missing config or `pm.project` → tell the user to run `/obw:init` and stop.

## Vault Layout

```
pm/
├── {project}/
│   ├── tasks/       # active tasks
│   ├── archive/     # completed tasks
│   └── docs/        # docs + ADRs
└── dashboard.md     # cross-project dashboard (optional)
```

First-time project: create folders via `mkdir -p "$VAULT_PATH/pm/{project}/{tasks,archive,docs}"`. Resolve `$VAULT_PATH` from `~/Library/Application Support/obsidian/obsidian.json` (Linux: `~/.config/obsidian`; Windows: `%APPDATA%\obsidian`).

## Template Names

Fixed: `task`, `doc`, `adr`. Installed into the vault's Obsidian Templates folder by `/obw:init`. Use via CLI `create template=<name>`.

If `obsidian vault=<v> templates` doesn't list one of these, `/obw:init` hasn't run (or the user removed them). Tell the user to re-run init rather than inlining template content here.

## Operations

All vault I/O goes through the `obsidian` CLI — defer to `obsidian:obsidian-cli` skill for syntax. Use **one call** per known-name read — never chain `search → read`. The pm-specific bits:

- **Create task** → `create path="pm/{project}/tasks/{name}.md" template=task`, then `property:set` for `project` / `priority` / `due` / `tags`.
- **Create doc** → `create path="pm/{project}/docs/{name}.md" template=doc`, then `property:set name=project`.
- **Create ADR** → `create path="pm/{project}/docs/adr-{NNNN}-{title}.md" template=adr`, then `property:set` for `project` / `status`. See ADR numbering below.
- **List tasks** → `search query="[type:task] [project:{project}] [status:<s>]" format=json`.
- **Archive** → set `status=done` and `completed`, ensure `pm/{project}/archive` folder exists, then `move file="{name}" to="pm/{project}/archive"`.
- **Delete** → confirm first; fall back to `move` if the build lacks `delete`.

### ADR numbering

Before creating an ADR, search existing ADRs in the project and take max(number)+1, zero-padded to 4 digits:
```bash
obsidian vault={vault} search query="[type:adr] [project:{project}]" format=json
```

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
2. `file=` uses wikilink resolution — just the base name, no path/extension.
3. Never `search` to locate a note whose name is known — go straight to `read`.
4. Never bypass the CLI with filesystem Read/Write against `$VAULT_PATH/...`. Exceptions: (a) `mkdir -p` for new folders, (b) reading `.obsidian/templates.json` / `obsidian.json` for setup. Dashboard creation uses the CLI via shell-piped content.
5. Confirm destructive intents (delete, archive-move, ADR supersede) before executing.
