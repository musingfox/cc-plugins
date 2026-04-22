---
description: "Obsidian Workspace PM — manage tasks, documents, and ADRs in your Obsidian vault"
argument-hint: "[natural language request]"
allowed-tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "Task"]
---

# /obw:pm — Obsidian Project Management

Load and execute the `pm` skill. All vault I/O goes through the `obsidian` CLI against the configured vault.

## Usage

Accepts free-form natural language (Chinese or English). The argument describes the **intent**; this command does not require a fixed verb vocabulary. Examples — not an exhaustive list, not keywords to pattern-match:

```
/obw:pm                                              # No args → project status summary
/obw:pm show me the implement-auth task
/obw:pm read the api-design doc
/obw:pm add a task called fix-search-perf, high priority
/obw:pm create an ADR about switching to SQLite
/obw:pm implement-auth is done, archive it
/obw:pm list all in-progress tasks
/obw:pm change fix-search-perf priority to low
/obw:pm search for authentication-related content
/obw:pm delete obsolete-task
/obw:pm refresh dashboard
```

## Execution

1. **Load config:** read `.obsidian.yaml` from the project root to obtain top-level `vault` and `pm.project`. If missing, suggest `/obw:init` and stop.

2. **Parse intent from natural language.** Do not rely on keyword matching. Classify the user's argument into one CRUD intent across one entity type:

   | Entity | Intents |
   |--------|---------|
   | task   | create, read, list, update (status / priority / due / tags / body), complete+archive, delete |
   | doc    | create, read, list, update, delete |
   | adr    | create (auto-number), read, list, update (status: proposed/accepted/deprecated/superseded), supersede |
   | dashboard | generate / refresh (cross-project or per-project) |
   | search | free-text content search across the vault |

   Ambiguity resolution:
   - Entity unclear (e.g. "看看 api-design") → try task first, fall back to doc/adr via a single CLI `read` attempt; do **not** pre-search.
   - Intent unclear → ask the user one focused question (AskUserQuestion with options + "other").
   - No argument → show a summary of active tasks (in-progress first, then todo, then blocked).

3. **Dispatch to the `pm` skill.** Follow the skill's CLI command reference for the chosen intent. Respect the "Direct Read" rule: when a name is known, issue one `obsidian vault=... read file="<name>"` call. Never chain `search → read` to locate a known note.

4. **CLI-only I/O.** All vault reads and writes go through the `obsidian` CLI. Do not substitute filesystem Read/Write against `$VAULT_PATH` — the few exceptions (e.g. `mkdir -p` for archive, full dashboard rewrite) are spelled out in the skill and only apply there.

5. **Confirm destructive intents** (delete, archive+move, supersede, full-body overwrite) before executing — show the target and the action, wait for user approval.
