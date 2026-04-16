# Dashboard Templates Reference

Dataview-powered dashboard templates for Obsidian PM. Generate these as markdown notes in the vault.

Dashboards are generated on first request and can be refreshed by overwriting the file.

## Cross-Project Dashboard

**Location**: `pm/dashboard.md` in the vault root (under pm/)

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

## Per-Project Dashboard

**Location**: `pm/{project}/dashboard.md`

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

## Creating Dashboards

Get the vault path first, then write the file directly:

```bash
VAULT_PATH=$(cat ~/Library/Application\ Support/obsidian/obsidian.json | jq -r '.vaults | to_entries[] | select(.value.path | endswith("/'"$VAULT_NAME"'")) | .value.path')
```

- Cross-project: Write to `$VAULT_PATH/pm/dashboard.md`
- Per-project: Write to `$VAULT_PATH/pm/{project}/dashboard.md`
