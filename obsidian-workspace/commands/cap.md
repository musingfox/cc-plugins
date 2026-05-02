---
description: "Quick capture — append a short entry to today's daily note"
argument-hint: "<content> [#tag ...]"
allowed-tools: ["Agent"]
---

# /obw:cap — Quick Daily Capture

Delegate to the `obsidian-operator` agent so vault I/O stays out of the main context.

Invoke `Agent` with:
- `subagent_type`: `obsidian-operator`
- `description`: `Quick capture to daily note`
- `prompt`: `mode=cap\nargs=$ARGUMENTS`

Relay the agent's summary to the user verbatim (it is already concise). Do not add commentary.

## Usage

```
/obw:cap Figured out why the rebase kept failing — stale bookmark on main
/obw:cap #idea 做一個 agent 自動跑 /obw:cap 記錄每天的 commit
/obw:cap #worklog 完成了 PR #42 的 review
```

Daily note folder, filename, and template come from Obsidian's **Daily Notes** core plugin settings.
