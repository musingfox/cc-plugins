# Obsidian PM

Project management via Obsidian vault — tasks, documents, and ADRs managed through the Obsidian CLI. All data lives in your Obsidian vault as plain markdown notes with structured properties.

## Features

- Task lifecycle: create, query, update status, archive completed tasks
- Document management: design docs, specs, and other project documents
- ADR lifecycle: propose, accept, deprecate, supersede with auto-numbering (4-digit zero-padded)
- Property-based search and filtering via Obsidian's `[property:value]` syntax
- Wikilink cross-references between tasks, docs, and ADRs
- Templates with auto-filled `{{date}}` and `{{title}}` variables
- Dashboard: cross-project overview and per-project status via Dataview queries
- Tag-based filtering with native Obsidian `tags` property

## Prerequisites

- [Obsidian](https://obsidian.md) app running (or headless CLI mode)
- Obsidian CLI installed and enabled (via the `obsidian-cli` plugin)
- [Dataview](https://github.com/blacksmithgu/obsidian-dataview) community plugin installed and enabled

## Installation

```bash
/plugin install obsidian-pm
```

## Configuration

Create a `.obsidian-pm.yaml` file in your project root:

```yaml
vault: MyVault        # Obsidian vault name
project: my-project   # Project identifier (used as subfolder name)
```

If the config file doesn't exist, the skill will list available vaults and help you create one.

## Vault Structure

```
pm/
├── dashboard.md               # Cross-project dashboard (Dataview)
├── {project}/
│   ├── dashboard.md           # Project dashboard (Dataview)
│   ├── tasks/                 # Active tasks
│   ├── archive/               # Completed/archived tasks
│   └── docs/                  # Project documents (design docs, specs, ADRs)
└── templates/
    ├── task.md                # Task template
    ├── doc.md                 # Document template
    └── adr.md                 # ADR template
```

Templates use Obsidian's core Templates plugin. Set **Settings > Templates > Template folder location** to `pm/templates/`.

## Usage

Natural language triggers:

```
"create a task for implementing auth"
"list my tasks"
"what am I working on"
"mark the auth task as done"
"show my backlog"
"create a design doc for the API"
"create an ADR for choosing PostgreSQL"
"archive completed tasks"
```

### Task Operations

- **Create**: Creates from template, sets properties (project, priority, due date), appends description
- **Query**: Filter by status (`todo`, `in-progress`, `blocked`, `done`), priority, or project
- **Update**: Change status, priority, due date, or append notes
- **Archive**: Mark as done, set completion date, move to `pm/{project}/archive/`

### Document Operations

- **Create**: Creates from doc template with project property
- **Read/Update**: Read current content, append new content

### ADR Operations

- **Create**: Auto-numbers with 4-digit zero-padding (e.g., `adr-0001-use-postgres.md`)
- **Lifecycle**: Set status to `proposed`, `accepted`, `deprecated`, or `superseded`

### Dashboard

- **Cross-project**: Overview of all projects — task counts by status, recent completions
- **Per-project**: Task breakdown, active tasks, tag summary
- Dashboards are Dataview-powered markdown notes generated in the vault
- Also queryable in Claude Code conversation via "show dashboard" / "project status"

## Property Schema

### Task Properties

| Property | Type | Values |
|----------|------|--------|
| `status` | text | `todo`, `in-progress`, `blocked`, `done` |
| `priority` | text | `high`, `medium`, `low` |
| `project` | text | Project identifier from config |
| `type` | text | `task` |
| `due` | date | `YYYY-MM-DD` |
| `created` | date | Auto-filled by template |
| `completed` | date | Set when archiving |
| `tags` | list | Free-form tags for filtering |

### Document Properties

| Property | Type | Values |
|----------|------|--------|
| `type` | text | `doc` |
| `project` | text | Project identifier |
| `created` | date | Auto-filled by template |
| `updated` | date | Update when content changes |

### ADR Properties

| Property | Type | Values |
|----------|------|--------|
| `type` | text | `adr` |
| `project` | text | Project identifier |
| `status` | text | `proposed`, `accepted`, `deprecated`, `superseded` |
| `created` | date | Auto-filled by template |
| `deciders` | text | Who made the decision |
