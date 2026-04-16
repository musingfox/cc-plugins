# Obsidian Workspace

Personal Obsidian vault productivity for Claude Code — quick capture, long-form notes, and project management, all backed by the Obsidian CLI. Every entry lives in your vault as plain markdown with structured properties.

Plugin identifier: `obw` (commands are invoked as `/obw:<name>`).

## Commands

| Command | Purpose |
|---------|---------|
| `/obw:init` | Interactively create `.obsidian.yaml` (vault picker + journal/note/pm sections) |
| `/obw:cap <text>` | Quick capture to today's journal — timestamped bullet, `#tag` extraction |
| `/obw:note <title>` | Create a long-form note; `--folder <path>` override, `--tag <tag>` frontmatter |
| `/obw:pm [action]` | Task / document / ADR lifecycle (replaces the legacy `/obm`) |

Each command has a matching skill (`cap`, `note`, `pm`) so natural-language phrasing also works.

## Features

- **Quick capture**: append thoughts / work-logs to today's daily note under a configurable section heading
- **Tag-aware capture**: `/obw:cap #idea <text>` strips tags from the body and merges them into frontmatter
- **Flexible notes**: default folder + override via `--folder`, with `title` / `slug` / `timestamp-title` filename strategies
- **Project management**: task/doc/ADR lifecycle with Dataview dashboards and wikilink cross-references
- **Unified config**: one `.obsidian.yaml` drives all three capabilities

## Prerequisites

- [Obsidian](https://obsidian.md) app running (or headless CLI mode)
- Obsidian CLI installed and enabled (via the `obsidian-cli` plugin)
- [Dataview](https://github.com/blacksmithgu/obsidian-dataview) community plugin — required only for `/obw:pm` dashboards

## Installation

```bash
/plugin install obsidian-workspace
```

## Configuration

Run `/obw:init` once in a project root, or create `.obsidian.yaml` by hand:

```yaml
vault: MyVault

journal:
  folder: Journal
  filename: "{{date}}"         # {{date}} → YYYY-MM-DD
  section: "## Log"
  timestamp: true
  tag_frontmatter: true

note:
  default_folder: Inbox
  filename_strategy: title     # title | slug | timestamp-title

pm:
  project: my-project          # Omit this whole section to disable /obw:pm
```

Only the top-level `vault` field is mandatory; each section is required by its respective command.

## Usage Examples

### Capture

```
/obw:cap 發現 rebase 一直失敗是因為舊的 bookmark 還在 main
/obw:cap #idea 做一個 skill 自動記錄每天的 commits
/obw:cap #worklog 完成 API 重構 PR，等 review
```

Each capture appends to `Journal/<today>.md`:

```markdown
## Log

- 14:32 — 完成 API 重構 PR，等 review #worklog
```

### Notes

```
/obw:note API Redesign Proposal
/obw:note Weekend reading list --folder References
/obw:note Retro 2026-Q1 --folder Retros --tag retro --tag quarterly
```

### Project Management

```
/obw:pm                       # Active tasks summary
/obw:pm list                  # List tasks
/obw:pm create task implement-auth
/obw:pm create adr use-postgres
/obw:pm done implement-auth   # Archive
/obw:pm dashboard             # Refresh Dataview dashboard
```

## PM Vault Structure

```
pm/
├── dashboard.md               # Cross-project dashboard (Dataview)
├── {project}/
│   ├── dashboard.md           # Project dashboard (Dataview)
│   ├── tasks/                 # Active tasks
│   ├── archive/               # Completed/archived tasks
│   └── docs/                  # Design docs, specs, ADRs
└── templates/
    ├── task.md
    ├── doc.md
    └── adr.md
```

Templates use Obsidian's core Templates plugin. Set **Settings → Templates → Template folder location** to `pm/templates/`.

## Property Schemas (PM)

### Task Properties

| Property | Type | Values |
|----------|------|--------|
| `status` | text | `todo`, `in-progress`, `blocked`, `done` |
| `priority` | text | `high`, `medium`, `low` |
| `project` | text | From `pm.project` |
| `type` | text | `task` |
| `due` | date | `YYYY-MM-DD` |
| `created` | date | Auto-filled by template |
| `completed` | date | Set when archiving |
| `tags` | list | Free-form tags |

### Document Properties

| Property | Type | Values |
|----------|------|--------|
| `type` | text | `doc` |
| `project` | text | From `pm.project` |
| `created` | date | Auto-filled by template |
| `updated` | date | Update when content changes |

### ADR Properties

| Property | Type | Values |
|----------|------|--------|
| `type` | text | `adr` |
| `project` | text | From `pm.project` |
| `status` | text | `proposed`, `accepted`, `deprecated`, `superseded` |
| `created` | date | Auto-filled by template |
| `deciders` | text | Who made the decision |

## Migration From `obsidian-pm`

Previous plugin `obsidian-pm` is now `obsidian-workspace`. If you had `.obsidian-pm.yaml`:

1. Rename `.obsidian-pm.yaml` → `.obsidian.yaml`
2. Move `project` under a new `pm:` section:
   ```yaml
   # before
   vault: MyVault
   project: my-project
   
   # after
   vault: MyVault
   pm:
     project: my-project
   ```
3. Replace `/obm` invocations with `/obw:pm`.

Or just run `/obw:init` to regenerate the config from scratch.
