# Obsidian Workspace

Project-scoped Obsidian vault productivity for Claude Code — quick capture, long-form notes, and project management. Skills own folder layout + file templates + PM conventions, while the `/issue` Claude Mod lists a view of the project's dashboard in a pane; vault I/O runs through the Obsidian CLI, deferring to the official `obsidian:obsidian-cli` skill for syntax. Each skill file is kept small so it doesn't burn your context budget.

Plugin identifier: `obw` (skills invoked as `/obw:<name>` or via natural language).

## Skills

| Skill | Purpose |
|-------|---------|
| `/obw:init` | Pick a vault, write `.obsidian.yaml`, install starter templates, bootstrap the project workspace, migrate an older layout |
| `/obw:jot <text>` | Quick capture (timestamped bullet to today's daily note) or long-form note — triages by input shape |
| `/obw:pm [intent]` | Task / document / ADR lifecycle, project-scoped; split a spec into blocking tickets |

## How It Works

- **Vault I/O** goes through the `obsidian` CLI, run directly in the main context (no sub-agent). This plugin does not duplicate CLI syntax; it defers to the official `obsidian:obsidian-cli` skill and `obsidian help`.
- **Daily notes** use Obsidian's **Daily Notes** core plugin (folder / filename / template). Quick capture calls `daily:append`.
- **Templates** (`task`, `doc`, `adr`) live in your vault's Obsidian Templates folder. On `/obw:init` the plugin copies starter files from `templates/` only if the same name doesn't already exist — it never overwrites your edits.
- **Dashboards** are **Obsidian Bases** (`.base` files — core in Obsidian 1.9+) generated from plugin-internal templates via shell substitution, so contents never enter Claude's context.

## Issue Pane

Run `/issue <view>` to list a view from the configured project's `dashboard.base`, created by `/obw:pm`, then select one to read its title, status, priority, and markdown body in the same pane. `/issue` with no argument opens the All Tasks view as an arrow-key list under the view picker: cards grouped by status (todo, in-progress, blocked, done), each heading with its card count, each row reading `[H|M|L] <title>  <due>  <tags>` sorted by priority, and `done` folded at the start. Click the list to give it the keys; ↑↓ move, PgUp/PgDn page, → or Enter opens a card or unfolds a heading, and ← goes back to the list or folds a heading. Other views stay flat lists. A dashboard without All Tasks opens Active and says to run `/obw:pm refresh dashboard`. `/issue <card>` opens that card directly. The pane reports missing configuration, unavailable CLI output, and missing cards in place without adding vault content to the conversation.

A thin rule sets the card off from the list. Status and priority are coloured labels, followed by an `AC <checked>/<total>` count when the card's Acceptance Criteria section has checkboxes. Errors are drawn in red; progress and empty-list notices stay dim.

Mermaid blocks in the card body are drawn in the pane as text diagrams by `uvx termaid@0.9.0`, which needs [uv](https://docs.astral.sh/uv/). uv is optional: without it, a block stays the code block it is in the card. A block also stays a code block when its diagram type is not supported, when it starts with a `%%` comment or `---` frontmatter, or when termaid fails, prints nothing, or takes longer than 5 s. The card is drawn first and each diagram replaces its code block when it is ready, so the first run may show the code block until uv has fetched termaid.

A shown card has an **Open in browser** Button that renders the card body, Mermaid included, through the [viz](../viz) plugin's `render.sh`. The Button appears only when viz is installed, found through `installed_plugins.json` under `$CLAUDE_CONFIG_DIR` or `~/.claude`, and only in the terminal. Opening the browser uses macOS `open`; over SSH the pane shows the page's URL instead. The pane reports where the card was rendered, or why it was not. The page opens on the machine running Claude Code: when you reach the session through a terminal multiplexer or relay that does not set the SSH variables (herdr, for example), the browser opens on that host, not on the device you are looking at.

Enable Claude Mods globally before using the pane:

```bash
export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1
```

Test the plugin with:

```bash
claude plugin test obsidian-workspace
```

Built and tested against Claude Code 2.1.276.

## Prerequisites

- Official `obsidian` plugin (from the `obsidian-skills` marketplace) — declared as a plugin dependency, so it auto-installs with this plugin as long as that marketplace is added (`claude plugin marketplace add`)
- [Obsidian](https://obsidian.md) app running (headless CLI also works)
- Obsidian community plugin **`obsidian-cli`** installed and enabled. The plugin's name is `obsidian-cli` but the executable it installs is `obsidian` (invoked as `obsidian vault=<name> ...`). This is **not** the unrelated standalone `obsidian-cli` binary by Yakitrak.
- **Templates** core plugin enabled (required for `/obw:pm` — `task` / `doc` / `adr` templates)
- **Daily Notes** core plugin enabled (required for `/obw:jot` quick capture)
- **Bases** core plugin enabled (required only for `/obw:pm` dashboards — bundled in Obsidian 1.9+)
- [uv](https://docs.astral.sh/uv/) (optional; lets the `/issue` pane draw Mermaid blocks as text diagrams through `uvx termaid@0.9.0` — without it they show as code blocks)
- [viz](../viz) plugin (optional; enables the `/issue` pane's **Open in browser** Button — without it the Button is not drawn)
- `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` (required only for the `/issue` pane; skills work without it)

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
    ├── dashboard.base    # Project dashboard (Bases)
    ├── tasks/            # Active tasks
    │   └── archive/      # Completed tasks
    └── docs/             # Docs + ADRs
```

Every project gets `tasks/`, `docs/`, and `dashboard.base` — `/obw:init` creates all three up front, so a project is never a bare folder.

Upgrading a vault from before 0.9: re-run `/obw:init`. It detects the old layout and offers, each separately, to move `archive/` into `tasks/archive/` (through the CLI, so links follow), backfill the `title` property on existing notes, and regenerate the dashboards with the new views. Existing filenames are never renamed.

A plugin update can add dashboard views. Run `/obw:pm refresh dashboard` to bring in All Tasks (and any other new template view) on an existing vault. The refresh regenerates `dashboard.base` from the template, so hand edits to that file are overwritten; it warns and asks first.

## Filenames

All notes are kebab-cased (`Implement Auth` → `implement-auth.md`), for both `/obw:jot` notes and `/obw:pm` tasks / docs / ADRs. Because Obsidian's `{{title}}` resolves to the filename, the human-readable title lives in the `title` property — that is what the dashboards display.

## Property Schema

Dashboards and searches depend on these frontmatter fields. If you edit the installed templates, keep the field names.

- **Task** — `title`, `type: task`, `status` (`todo` / `in-progress` / `blocked` / `done`), `priority` (`high` / `medium` / `low`), `project`, `due` (date), `tags` (list), `parent` (link), `blocked_by` (list of links), `related` (list of links), `created`, `completed`
- **Doc** — `title`, `type: doc`, `project`, `created`, `updated`
- **ADR** — `title`, `type: adr`, `project`, `status` (`proposed` / `accepted` / `deprecated` / `superseded`), `created`, `deciders`

## Task Relations

Tasks link to each other by wikilink through three properties — `blocked_by`, `related`, and `parent` (epic → subtask). There is no separate issue ID: the kebab filename is the handle, and Obsidian rewrites links when a note is renamed.

Only one direction is stored. What a task *blocks*, and what its subtasks are, come from Obsidian's backlinks pane — a `blocks` field alongside `blocked_by` would only drift. Adding a blocker sets `status: blocked`; archiving a task lists whatever still depends on it and asks before unblocking. Ticket splitting writes its blocking edges to `blocked_by`; the unblocked frontier is a `search` excluding `-[blocked_by:` wikilinks, not a view.

## Examples

```
/obw:jot #worklog 完成 API 重構 PR，等 review
/obw:jot API Redesign Proposal --folder Architecture --tag design
/obw:pm add task implement-auth, high priority, due 2026-05-01
/obw:pm create adr about switching to SQLite
/obw:pm implement-auth is blocked by db-migration
/obw:pm implement-auth is done, archive it
/obw:pm split this spec into tickets
/obw:pm refresh dashboard
```
