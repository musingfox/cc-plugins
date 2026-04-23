---
description: "Quick capture — append a short entry to today's daily note"
argument-hint: "<content> [#tag ...]"
allowed-tools: ["Bash", "Read"]
---

# /obw:cap — Quick Daily Capture

Trigger the `cap` skill. Extracts `#tags`, composes a timestamped bullet, and delegates the append to `obsidian daily:append`.

## Usage

```
/obw:cap Figured out why the rebase kept failing — stale bookmark on main
/obw:cap #idea 做一個 agent 自動跑 /obw:cap 記錄每天的 commit
/obw:cap #worklog 完成了 PR #42 的 review
```

Daily note folder, filename, and template come from Obsidian's **Daily Notes** core plugin settings. This command doesn't override them.
