# pm — Obsidian Project Management

This mode owns: folder layout, template names, property schema, ADR numbering, dashboard generation strategy, and the direct-read rule. For Bases (`.base`) syntax used by dashboards, read the bundled `templates/dashboard-cross.base` / `dashboard-project.base` directly — do not guess.

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
3. Never bypass the CLI with filesystem Read/Write against `$VAULT_PATH/...`. Only exception: reading `.obsidian/templates.json` / `obsidian.json` during `/obw:init`. Dashboard creation uses the CLI via shell-piped content.
4. Confirm destructive intents (delete, archive-move, ADR supersede) before executing.
