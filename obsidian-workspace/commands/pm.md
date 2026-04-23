---
description: "Obsidian Workspace PM — tasks, documents, and ADRs in your Obsidian vault"
argument-hint: "[natural language request]"
allowed-tools: ["Bash", "Read", "Glob", "Grep", "AskUserQuestion"]
---

# /obw:pm — Obsidian Project Management

Trigger the `pm` skill. Accepts free-form natural language (中文 / English) describing the intent — no fixed verb vocabulary.

## Usage

```
/obw:pm                                  # no args → active-task summary
/obw:pm show me the implement-auth task
/obw:pm add a task called fix-search-perf, high priority
/obw:pm create an ADR about switching to SQLite
/obw:pm implement-auth is done, archive it
/obw:pm list all in-progress tasks
/obw:pm refresh dashboard
/obw:pm delete obsolete-task
```

## Intent Classification

Map the argument to one (entity × intent):

| Entity | Intents |
|--------|---------|
| task | create, read, list, update, archive, delete |
| doc | create, read, list, update, delete |
| adr | create (auto-number), read, list, update status, supersede |
| dashboard | generate / refresh (cross-project or per-project) |
| search | free-text vault search |

Ambiguity:
- Entity unclear (e.g. "看看 api-design") → try a single `read file="..."` first. Do **not** pre-search.
- Intent unclear → one `AskUserQuestion` with options + "other".
- No argument → summary of active tasks (in-progress → todo → blocked).

Destructive intents (delete, archive+move, supersede, full-body overwrite) require confirmation before executing.
