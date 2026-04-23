---
type: dashboard
created: {{date}}
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
