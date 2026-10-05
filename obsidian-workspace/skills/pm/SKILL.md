---
name: pm
description: Obsidian Workspace PM — tasks and documents in your Obsidian vault. Triggers on task/doc lifecycle requests ("add a task", "create a doc", "archive X", "list in-progress tasks", "refresh dashboard", "split this spec into tickets") and via `/obw:pm`. Requires `.obsidian.yaml` with a `pm.project` section. ADRs belong to the adr plugin.
---

# pm — Obsidian Project Management

Run the `obsidian` CLI directly — no sub-agent. Before any CLI call, invoke the `obsidian:obsidian-cli` skill to load exact syntax — never run `obsidian help`/`--help` to discover it. This skill owns only the PM conventions: folder layout, template names, property schema, and dashboard generation.

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
│   └── docs/            # docs
└── dashboard.base       # cross-project dashboard (optional)
```

Every project has all three: `tasks/`, `docs/`, `dashboard.base`. `/obw:init` bootstraps them. If a pm operation finds `pm/{project}/dashboard.base` missing, regenerate it (see Dashboards) before reporting done.

Beyond that, folders are created on demand — `create` / `move` auto-create missing parent folders. No `mkdir` needed.

## Filenames

Kebab-case, always: lowercase, whitespace and punctuation → `-`, collapse repeats, Unicode characters kept intact. Same rule as `/obw:jot` note mode.

The human-readable title is not derivable from the filename, so it lives in the `title` property. Obsidian's `{{title}}` resolves to the filename, so the H1 stays kebab — `title` is what dashboards display.

- `Implement Auth` → `pm/{project}/tasks/implement-auth.md`, `title: Implement Auth`

## Template Names

Fixed: `task`, `doc`. Installed into the vault's Obsidian Templates folder by `/obw:init`. Use via CLI `create template=<name>`.

If `obsidian vault=<v> templates` doesn't list one of these, `/obw:init` hasn't run (or the user removed them). Tell the user to re-run init rather than inlining template content here.

## Operations

Use **one call** per known-name read — never chain `search → read`. The pm-specific bits:

- **Create task** → `create` at `pm/{project}/tasks/{kebab}.md` with `template=task`, then set properties `title` / `project` / `priority` / `due` / `tags`.
- **Create doc** → `create` at `pm/{project}/docs/{kebab}.md` with `template=doc`, then set `title` / `project`.
- **List tasks** → `search` with `query="[type:task] [project:{project}] [status:<s>]" format=json`.
- **To tickets** → split a spec, task, or conversation into tickets with blocking edges; follow [references/to-tickets.md](references/to-tickets.md).
- **Archive** → set `status=done` and `completed`, then `move` to `pm/{project}/tasks/archive`. Run the dependent check first (see Relations).
- **Delete** → confirm first, then `delete`; it moves the note to the trash.

## Relations

Three link properties on tasks, all holding wikilinks: `blocked_by` (list), `related` (list), `parent` (single).

Only the stated direction is stored. The inverse — who this task blocks, its subtasks — is read from Obsidian's backlinks pane or a Bases `file.hasLink()` filter. Never write a `blocks` or `subtasks` field: two fields for one edge drift apart.

- **Link** → `property:set` with `type=list` for `blocked_by` / `related`, plain for `parent`. Values are `[[kebab-name]]` — resolve the target with `search` first if the name is uncertain, and refuse a link to a note that does not exist.
- **`property:set` replaces, never appends** — there is no property-append verb. To add one blocker, `read` the task's current `blocked_by`, and set the full list back with the new entry included. Setting a bare new value silently drops the existing links.
- **`blocked_by` implies status** — after adding a blocker, set `status=blocked`. After removing the last blocker, ask whether to return the task to `todo` or `in-progress`.
- **Archiving cascades a prompt** — before archiving `X`, `search` `query="[type:task] [project:{project}] [blocked_by:X]" format=json`. If any task depends on `X`, list them and ask whether to drop `X` from their `blocked_by` (and un-block those left with none). Never edit dependents silently.
- **Cycles** — before adding `A` to `B.blocked_by`, walk `A`'s own `blocked_by` chain. If it reaches `B`, refuse and report the cycle.
- `parent` is for epic → subtask decomposition only; use `related` for anything else.

## Property Schema

**Task**: `title`, `type: task`, `status` (todo/in-progress/blocked/done), `priority` (high/medium/low), `project`, `due` (date), `tags` (list), `parent` (link), `blocked_by` (list of links), `related` (list of links), `session` (the Claude session UUID bound to the task), `created`, `completed`. The `## Agent` section holds one line per event of that session, appended by the writeback hook — do not edit it by hand.
**Doc**: `title`, `type: doc`, `project`, `created`, `updated`.

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

A `refresh dashboard` request brings an existing project dashboard up to the template. Compare the two with the plugin's script. It parses both as YAML, because Obsidian reformats a `.base` it has opened and a text diff is noise, and it prints only the differences, so the template body stays out of context:

```bash
obsidian vault={vault} read path="pm/{project}/dashboard.base" \
  | uv run --no-project --with pyyaml "${CLAUDE_PLUGIN_ROOT}/scripts/dashboard-diff.py" project {project}
```

Act on the first line of its output:

- `verdict: missing` — the CLI answered `Error: File "…" not found.`, so the dashboard is missing. Recreate it with the per-project command above and stop.
- `verdict: current` — say the dashboard is up to date and stop.
- `verdict: stale <version>` — the dashboard is an earlier template with no hand edits, so overwriting loses nothing. Report the `changes` lines, then regenerate with the per-project command.
- `verdict: edited` — the dashboard matches no template version. Show its `hand edits` lines, measured against the closest version (`base`), and any `changes` lines. Warn that regenerating discards the hand edits, then regenerate only after the user agrees.

In those lines, `added` is only in the dashboard, `removed` is only in the template, and `changed` reads dashboard value `->` template value. Any other output is an error; report it as one.

The cross-project file follows the same steps with `path="pm/dashboard.base"`, `cross` in place of `project {project}`, and the cross-project command.

Conversation-mode status (user asks in chat, not Obsidian): run the equivalent `search` and format a summary table in the reply. Don't rewrite an existing `.base` file unless asked to (a `refresh dashboard` request is asking) — the only unprompted write is recreating a project dashboard that has gone missing.

## Important Rules

1. Read `.obsidian.yaml` before any operation.
2. Never `search` to locate a note whose name is known — go straight to `read`.
3. Never bypass the CLI with filesystem Read/Write against the vault. The only exceptions belong to `/obw:init`, which lists them under Filesystem Access. Dashboard creation uses the CLI via shell-piped content.
4. Confirm destructive intents (delete, archive-move) before executing.
5. A claim of "created" / "updated" needs a receipt — the CLI's own success output counts; an error output never does. Report failures as failures.
6. Bulk scans (e.g. auditing all archived tasks) may be delegated to a read-only Explore agent to keep the listing out of context; single-entity operations never need one.
