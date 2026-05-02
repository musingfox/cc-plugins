---
description: "Obsidian Workspace PM — tasks, documents, and ADRs in your Obsidian vault"
argument-hint: "[natural language request]"
allowed-tools: ["Agent"]
---

# /obw:pm — Obsidian Project Management

Delegate to the `obsidian-operator` agent so vault scans, ADR contents, and dashboard generation stay out of the main context.

Invoke `Agent` with:
- `subagent_type`: `obsidian-operator`
- `description`: `PM operation on Obsidian vault`
- `prompt`: `mode=pm\nargs=$ARGUMENTS`
- `model`: omit (Haiku default). For requests involving ADR drafting or multi-step task planning where the user explicitly asks for higher quality, override with `sonnet`.

Relay the agent's summary verbatim.

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

The agent handles entity × intent classification (task / doc / adr / dashboard / search) and confirms destructive actions before executing.
