---
description: "Quick capture — append a short entry to today's journal as work log or inspiration"
argument-hint: "<content> [#tag ...]"
allowed-tools: ["Bash", "Read", "Write", "Edit"]
---

# /obw:cap — Quick Journal Capture

Load and execute the `cap` skill from this plugin. Appends the user's content to today's journal file under the configured section, with optional timestamp and tag extraction.

## Usage

```
/obw:cap Figured out why the rebase kept failing — stale bookmark on main
/obw:cap #idea 做一個 agent 自動跑 /obw:cap 記錄每天的 commit
/obw:cap #worklog 完成了 PR #42 的 review
```

## Execution

Follow the `cap` skill. In summary:

1. Read `.obsidian.yaml` → get `vault`, `journal.folder`, `journal.filename`, `journal.section`, `journal.timestamp`, `journal.tag_frontmatter`.
2. If no config exists, tell the user to run `/obw:init`.
3. Parse `#tags` from the argument; strip them from the content body.
4. Resolve today's journal path (e.g., `Journal/2026-04-17.md`). Create the file if it doesn't exist (with `tags: []` frontmatter if `tag_frontmatter` is enabled).
5. If tags present and `tag_frontmatter` is true: merge new tags into frontmatter `tags` list (dedup).
6. Append a bullet under the configured section (create the section if missing):
   ```
   - HH:MM — <content> #tag1 #tag2
   ```
   (Omit `HH:MM —` if `timestamp` is false.)
7. Confirm: show the file path and the appended line.
