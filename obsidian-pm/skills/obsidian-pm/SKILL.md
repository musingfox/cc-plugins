---
name: obsidian-pm
description: |
  This skill should be used when the user mentions tasks, project documents, ADRs,
  architecture decisions, or project management in the context of development work.
  Covers creating, listing, updating, completing, and archiving tasks. Also handles
  writing design docs, specs, and ADR lifecycle (propose, accept, deprecate, supersede).
  Common triggers: "create a task", "list my tasks", "what am I working on",
  "write a design doc", "create an ADR", "show project status", "what's in my backlog",
  "mark task as done", "record this decision", "archive completed tasks", "task priorities",
  "show dashboard", "專案狀況", "project status", "cross-project status", "跨專案".
  All operations use the Obsidian CLI against a configured vault.
---

# Obsidian PM — Project Management via Obsidian Vault

Manage tasks, documents, and ADRs for the current project through an Obsidian vault using the `obsidian` CLI.

## Prerequisites

- Obsidian must be running (or use headless CLI)
- The `obsidian` CLI must be installed and enabled
- Note: Vault config path is macOS-specific (`~/Library/Application Support/obsidian/`). Adjust for Linux/Windows.
- Dataview plugin must be installed and enabled in the vault
- A `.obsidian-pm.yaml` config file must exist in the project root

## Configuration

Read `.obsidian-pm.yaml` from the project root to get vault and project context:

```yaml
vault: CyrisVault        # Obsidian vault name
project: cc-plugins       # Project identifier (used as subfolder name)
```

**MUST read this file before any operation.** If it does not exist:

1. List available vaults from `~/Library/Application Support/obsidian/obsidian.json` — the `vaults` object contains vault IDs mapped to `{ path, ts }`.
2. Ask the user which vault to use and what project name to set.
3. Create `.obsidian-pm.yaml` in the project root with the chosen values.
4. Remind the user to add `.obsidian-pm.yaml` to `.gitignore` if they don't want it tracked.

Use the `vault` value as the first parameter in all CLI commands: `obsidian vault=<vault> ...`

### First-Time Vault Setup

When a project connects to a vault for the first time, ensure the folder structure exists:

```bash
# Get vault path from obsidian.json
VAULT_PATH=$(cat ~/Library/Application\ Support/obsidian/obsidian.json | jq -r '.vaults | to_entries[] | select(.value.path | contains("'"$VAULT_NAME"'")) | .value.path')

# Create required folders
mkdir -p "$VAULT_PATH/pm/{project}/tasks"
mkdir -p "$VAULT_PATH/pm/{project}/archive"
mkdir -p "$VAULT_PATH/pm/{project}/docs"
```

Also verify that templates exist at `pm/templates/` in the vault. If not, inform the user that task/doc/adr templates need to be created. Template definitions are available in `references/templates.md`.

Also verify that the **Dataview** community plugin is installed and enabled in the vault. Dashboards require Dataview to render queries. If not installed, inform the user.

## Vault Structure

```
pm/
├── {project}/
│   ├── tasks/             # Active tasks
│   ├── archive/           # Completed tasks
│   └── docs/              # Project documents (design docs, specs, ADRs, etc.)
└── templates/
    ├── task.md            # Task template
    ├── doc.md             # Document template
    └── adr.md             # ADR template
```

## CLI Command Reference

All commands require `vault=<vault>` as the first parameter.

### Read Operations

| Operation | Command |
|-----------|---------|
| List active tasks | `search query="[type:task] [project:{project}] [status:todo]" format=json` |
| List in-progress | `search query="[type:task] [project:{project}] [status:in-progress]" format=json` |
| List all active | `search query="[type:task] [project:{project}]" format=json` then filter out archived |
| Read a task | `read file="{task-name}"` |
| Read properties | `properties file="{task-name}"` |
| List documents | `search query="[type:doc] [project:{project}]" format=json` |
| List ADRs | `search query="[type:adr] [project:{project}]" format=json` |
| Search content | `search query="{keyword}" format=json` |
| Search with context | `search:context query="{keyword}" format=json` |
| Search by tag | `search query="[type:task] [tags:{tag}]" format=json` |
| List files in folder | `files folder="pm/{project}/tasks"` |

### Write Operations

**Create task:**
```bash
obsidian vault={vault} create path="pm/{project}/tasks/{task-name}.md" template=task silent
obsidian vault={vault} property:set file="{task-name}" name=project value="{project}"
obsidian vault={vault} property:set file="{task-name}" name=priority value="{high|medium|low}"
obsidian vault={vault} property:set file="{task-name}" name=due value="{YYYY-MM-DD}" type=date
obsidian vault={vault} property:set file="{task-name}" name=tags value="{tag1,tag2}" type=list
```

After creation, append the task description and acceptance criteria to the note body:
```bash
obsidian vault={vault} append file="{task-name}" content="{description text}"
```

**Create document:**
```bash
obsidian vault={vault} create path="pm/{project}/docs/{doc-name}.md" template=doc silent
obsidian vault={vault} property:set file="{doc-name}" name=project value="{project}"
```

**Create ADR:**
```bash
obsidian vault={vault} create path="pm/{project}/docs/adr-{number}-{title}.md" template=adr silent
obsidian vault={vault} property:set file="adr-{number}-{title}" name=project value="{project}"
obsidian vault={vault} property:set file="adr-{number}-{title}" name=status value="{proposed|accepted|deprecated|superseded}"
```

ADR numbering: query existing ADRs and increment. Use 4-digit zero-padded numbers (e.g., `adr-0001-use-obsidian-for-pm.md`).

**Update task status:**
```bash
obsidian vault={vault} property:set file="{task-name}" name=status value="{todo|in-progress|blocked|done}"
```

**Update document content:**
```bash
obsidian vault={vault} read file="{name}"          # Read current content
obsidian vault={vault} append file="{name}" content="{new content}"
```

For full content replacement, read the vault path from `~/Library/Application Support/obsidian/obsidian.json`, then use the Write tool to overwrite the file directly at `{vault-path}/{note-path}`. Re-read via CLI afterward to confirm.

**Archive a completed task:**
```bash
# 1. Mark as done and add completion date
obsidian vault={vault} property:set file="{task-name}" name=status value=done
obsidian vault={vault} property:set file="{task-name}" name=completed value="{YYYY-MM-DD}" type=date

# 2. Ensure archive folder exists
mkdir -p "{vault-path}/pm/{project}/archive"

# 3. Move to archive
obsidian vault={vault} move file="{task-name}" to="pm/{project}/archive"
```

**Note:** The `move` command requires the target folder to already exist. Get the vault path from Obsidian's config at `~/Library/Application Support/obsidian/obsidian.json`.

### Task Checkbox Operations

```bash
# Complete a subtask (by line number)
obsidian vault={vault} task file="{task-name}" line={n} status=x

# Uncomplete a subtask
obsidian vault={vault} task file="{task-name}" line={n} status=" "
```

## Naming Conventions

- **Tasks**: kebab-case descriptive name — `implement-auth`, `fix-search-perf`, `add-rate-limiting`
- **Documents**: kebab-case — `api-design`, `deployment-guide`, `data-model`
- **ADRs**: `adr-{NNNN}-{kebab-title}` — `adr-0001-use-obsidian-for-pm`, `adr-0002-vault-structure`

## Wikilinks

When creating notes, use Obsidian wikilinks to connect related items:

- In a task, link to relevant docs: `See [[api-design]] for details`
- In an ADR, link to the task that triggered it: `Triggered by [[implement-auth]]`
- In a doc, link to related ADRs: `Decision recorded in [[adr-0001-use-obsidian-for-pm]]`

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
| `tags` | list | Free-form tags for filtering (e.g., `backend`, `auth`) |

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

## Dashboard

The skill generates two types of dashboards as Dataview-powered markdown notes in the vault. Dashboards are generated on first request and can be refreshed by overwriting the file.

### Cross-Project Dashboard

**Location**: `pm/dashboard.md` in the vault root (under pm/)

Generate this file with the following content:

~~~markdown
---
type: dashboard
created: {YYYY-MM-DD}
---

# Project Dashboard

## Overview

```dataview
TABLE
  length(filter(rows, (r) => r.status = "todo")) as "Todo",
  length(filter(rows, (r) => r.status = "in-progress")) as "In Progress",
  length(filter(rows, (r) => r.status = "blocked")) as "Blocked",
  length(filter(rows, (r) => r.status = "done" AND r.completed >= date(today) - dur(7d))) as "Done (7d)",
  length(rows) as "Total"
FROM "pm"
WHERE type = "task" AND project
GROUP BY project
SORT project ASC
```

## Recently Completed

```dataview
TABLE project, completed, tags
FROM "pm"
WHERE type = "task" AND project AND status = "done" AND completed >= date(today) - dur(7d)
SORT completed DESC
```
~~~

**CLI command to create:**
```bash
# Get vault path
VAULT_PATH=$(cat ~/Library/Application\ Support/obsidian/obsidian.json | jq -r '.vaults | to_entries[] | select(.value.path | contains("'"$VAULT_NAME"'")) | .value.path')

# Write dashboard file directly
# Use the Write tool to write the dashboard content to "$VAULT_PATH/pm/dashboard.md"
```

### Per-Project Dashboard

**Location**: `pm/{project}/dashboard.md`

Generate this file with the following content:

~~~markdown
---
type: dashboard
project: {project}
created: {YYYY-MM-DD}
---

# {project} Dashboard

## Tasks by Status

```dataview
TABLE WITHOUT ID
  length(filter(rows, (r) => r.status = "todo")) as "Todo",
  length(filter(rows, (r) => r.status = "in-progress")) as "In Progress",
  length(filter(rows, (r) => r.status = "blocked")) as "Blocked",
  length(filter(rows, (r) => r.status = "done")) as "Done",
  length(rows) as "Total"
FROM "pm/{project}"
WHERE type = "task"
GROUP BY true
```

## Active Tasks

```dataview
TABLE status, priority, due, tags
FROM "pm/{project}/tasks"
WHERE type = "task"
SORT choice(status = "in-progress", 0, choice(status = "blocked", 1, choice(status = "todo", 2, 3))) ASC, choice(priority = "high", 0, choice(priority = "medium", 1, 2)) ASC
```

## Recently Completed

```dataview
TABLE completed, tags
FROM "pm/{project}/archive"
WHERE type = "task" AND status = "done"
SORT completed DESC
LIMIT 10
```

## Tags

```dataview
TABLE WITHOUT ID
  tags as "Tag",
  length(rows) as "Count"
FROM "pm/{project}"
WHERE type = "task" AND tags
FLATTEN tags
GROUP BY tags
SORT length(rows) DESC
```
~~~

**CLI command to create:**
```bash
# Write dashboard file directly using Write tool to "$VAULT_PATH/pm/{project}/dashboard.md"
```

### Dashboard in Claude Code

When the user asks for dashboard/status in the conversation (not in Obsidian), query via CLI and format the results:

```bash
# Cross-project: get all tasks
obsidian vault={vault} search query="[type:task]" format=json

# Per-project: get project tasks  
obsidian vault={vault} search query="[type:task] [project:{project}]" format=json
```

Parse the JSON results and present a formatted summary table in the conversation.

## Decision Trees

### User mentions a task

```
Task operation?
├── "create/add/new task" → Create task from template + set properties
├── "list/show/my tasks" → Search by [type:task] [project:{project}]
│   ├── "todo/backlog" → add [status:todo]
│   ├── "in progress" → add [status:in-progress]
│   └── "blocked" → add [status:blocked]
├── "update/change task" → property:set on the target field
├── "complete/close/done task" → Archive flow (status=done → completed date → move)
└── "what am I working on" → Search [status:in-progress] [project:{project}]
```

### User mentions a document

```
Document operation?
├── "create/write doc" → Create from doc template + set properties
├── "create/new ADR" → Create from adr template + auto-number
├── "list docs" → Search [type:doc] [project:{project}]
├── "list ADRs" → Search [type:adr] [project:{project}]
├── "read/show doc" → read file="{name}"
└── "update doc" → read current → append or inform user of full rewrite needed
```

### During development (implicit)

These are suggestions only. Do NOT autonomously update task status or create ADRs unless the user explicitly requests it.

```
Agent is working on implementation?
├── Starting a task → property:set status=in-progress
├── Finished implementation → property:set status=done + archive
├── Made an architectural decision → Suggest creating an ADR
├── Need to record design context → Suggest creating a doc
└── Hit a blocker → property:set status=blocked + append blocker description
```

### User asks for dashboard or status

```
Dashboard request?
├── "dashboard" / "status" / "專案狀況" / "project status"
│   ├── In conversation → CLI search + format summary table
│   └── In Obsidian → Check if dashboard.md exists, create if not, tell user to open it
├── "cross-project" / "all projects" / "跨專案"
│   ├── In conversation → Search all [type:task], group by project, format table
│   └── In Obsidian → Create/refresh pm/dashboard.md
├── "project dashboard" / "{project} status"
│   ├── In conversation → Search [type:task] [project:{project}], format table
│   └── In Obsidian → Create/refresh pm/{project}/dashboard.md
└── "refresh dashboard" → Regenerate the dashboard .md file(s)
```

## Important Notes

1. **Always read `.obsidian-pm.yaml` first** — every operation needs vault and project
2. **Use `silent` flag on create** — prevents Obsidian from switching focus
3. **Use `format=json` on search** — easier to parse results
4. **Target folder must exist for `move`** — `mkdir -p` before moving
5. **Do not modify templates** — they are shared across all projects
6. **Property names are case-sensitive** — always lowercase
7. **`file=` uses wikilink resolution** — just the note name, no path or extension needed

## Error Handling

- **CLI not installed or not responding** → Tell the user to install the Obsidian CLI and ensure Obsidian is running
- **Vault name not found** → List available vaults from `~/Library/Application Support/obsidian/obsidian.json` and ask the user to pick one
- **Note already exists on create** → Ask the user if they want to overwrite the existing note or choose a different name
- **Search returns no results** → Inform the user that no matches were found and suggest a broader query
- **Move fails (target folder missing)** → Run `mkdir -p` to create the target folder first, then retry the move
