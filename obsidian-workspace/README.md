# Obsidian Workspace

Project-scoped Obsidian vault productivity for Claude Code — quick capture, long-form notes, and project management. The plugin is **skills-only**: it owns folder layout + file templates + PM conventions; all vault I/O runs the Obsidian CLI directly in the main context, deferring to the official `obsidian:obsidian-cli` skill for syntax. Each skill file is kept small so it doesn't burn your context budget.

Plugin identifier: `obw` (skills invoked as `/obw:<name>` or via natural language).

## Skills

| Skill | Purpose |
|-------|---------|
| `/obw:init` | Pick a vault, write `.obsidian.yaml`, install starter templates into your vault's Templates folder |
| `/obw:jot <text>` | Quick capture (timestamped bullet to today's daily note) or long-form note — triages by input shape |
| `/obw:pm [intent]` | Task / document / ADR lifecycle, project-scoped; free-form natural language |

## How It Works

- **Vault I/O** goes through the `obsidian` CLI, run directly in the main context (no sub-agent). This plugin does not duplicate CLI syntax; it defers to the official `obsidian:obsidian-cli` skill and `obsidian help`.
- **Daily notes** use Obsidian's **Daily Notes** core plugin (folder / filename / template). Quick capture calls `daily:append`.
- **Templates** (`task`, `doc`, `adr`) live in your vault's Obsidian Templates folder. On `/obw:init` the plugin copies starter files from `templates/` only if the same name doesn't already exist — it never overwrites your edits.
- **Dashboards** (optional) are **Obsidian Bases** (`.base` files — core in Obsidian 1.9+) generated from plugin-internal templates via shell substitution, so contents never enter Claude's context.

## Prerequisites

- Official `obsidian` plugin (from the `obsidian-skills` marketplace) — declared as a plugin dependency, so it auto-installs with this plugin as long as that marketplace is added (`claude plugin marketplace add`)
- [Obsidian](https://obsidian.md) app running (headless CLI also works)
- Obsidian community plugin **`obsidian-cli`** installed and enabled. The plugin's name is `obsidian-cli` but the executable it installs is `obsidian` (invoked as `obsidian vault=<name> ...`). This is **not** the unrelated standalone `obsidian-cli` binary by Yakitrak.
- **Templates** core plugin enabled (required for `/obw:pm` — `task` / `doc` / `adr` templates)
- **Daily Notes** core plugin enabled (required for `/obw:jot` quick capture)
- **Bases** core plugin enabled (required only for `/obw:pm` dashboards — bundled in Obsidian 1.9+)

## Installation

```bash
/plugin install obsidian-workspace
```

## Permissions (recommended)

Vault operations shell out to the `obsidian` CLI plus a few Unix helpers. To avoid repeated permission prompts, add these to user `settings.json` (`~/.claude/settings.json`) once:

```json
{
  "permissions": {
    "allow": [
      "Bash(obsidian:*)",
      "Bash(cat:*)",
      "Bash(jq:*)",
      "Bash(cp:*)",
      "Bash(sed:*)"
    ]
  }
}
```

Or run `/fewer-permission-prompts` after a stuck `/obw:init` and it will scan transcripts and propose the same list.

## Configuration

Run `/obw:init` in a project root. The generated `.obsidian.yaml`:

```yaml
vault: MyVault

note:
  default_folder: Inbox
  filename_strategy: title     # title | slug | timestamp-title

pm:
  project: my-project          # Omit this section to disable /obw:pm
```

Daily note folder / filename / template are **not** in `.obsidian.yaml` — they come from Obsidian's Daily Notes settings.

## Vault Layout (`/obw:pm`)

```
pm/
├── dashboard.base        # Cross-project dashboard (optional, Bases)
└── {project}/
    ├── dashboard.base    # Project dashboard (optional, Bases)
    ├── tasks/            # Active tasks
    ├── archive/          # Completed tasks
    └── docs/             # Docs + ADRs
```

## Property Schema

Dashboards and searches depend on these frontmatter fields. If you edit the installed templates, keep the field names.

- **Task** — `type: task`, `status` (`todo` / `in-progress` / `blocked` / `done`), `priority` (`high` / `medium` / `low`), `project`, `due` (date), `tags` (list), `created`, `completed`
- **Doc** — `type: doc`, `project`, `created`, `updated`
- **ADR** — `type: adr`, `project`, `status` (`proposed` / `accepted` / `deprecated` / `superseded`), `created`, `deciders`

## Examples

```
/obw:jot #worklog 完成 API 重構 PR，等 review
/obw:jot API Redesign Proposal --folder Architecture --tag design
/obw:pm add task implement-auth, high priority, due 2026-05-01
/obw:pm create adr about switching to SQLite
/obw:pm implement-auth is done, archive it
/obw:pm refresh dashboard
```
