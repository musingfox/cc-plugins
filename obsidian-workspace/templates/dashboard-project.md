---
type: dashboard
project: __PROJECT__
created: {{date}}
---

# __PROJECT__ Dashboard

## Tasks by Status

```dataview
TABLE WITHOUT ID
  length(filter(rows, (r) => r.status = "todo")) as "Todo",
  length(filter(rows, (r) => r.status = "in-progress")) as "In Progress",
  length(filter(rows, (r) => r.status = "blocked")) as "Blocked",
  length(filter(rows, (r) => r.status = "done")) as "Done",
  length(rows) as "Total"
FROM "pm/__PROJECT__"
WHERE type = "task"
GROUP BY true
```

## Active Tasks

```dataview
TABLE status, priority, due, tags
FROM "pm/__PROJECT__/tasks"
WHERE type = "task"
SORT choice(status = "in-progress", 0, choice(status = "blocked", 1, choice(status = "todo", 2, 3))) ASC, choice(priority = "high", 0, choice(priority = "medium", 1, 2)) ASC
```

## Recently Completed

```dataview
TABLE completed, tags
FROM "pm/__PROJECT__/archive"
WHERE type = "task" AND status = "done"
SORT completed DESC
LIMIT 10
```

## Tags

```dataview
TABLE WITHOUT ID
  tags as "Tag",
  length(rows) as "Count"
FROM "pm/__PROJECT__"
WHERE type = "task" AND tags
FLATTEN tags
GROUP BY tags
SORT length(rows) DESC
```
