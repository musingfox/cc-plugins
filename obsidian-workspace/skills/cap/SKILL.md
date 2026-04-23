---
name: cap
description: |
  Quick-capture short entries to today's daily note in an Obsidian vault.
  Composes a timestamped bullet, optionally merges #tags into frontmatter, then delegates
  the actual daily-note append to the Obsidian CLI's `daily:append` command.
when-to-use: |
  Triggered when the user wants a quick journal/log entry — "記一下", "capture this",
  "寫到 journal", "log 一下", "紀錄這個想法", "add to today's journal". Also triggers on `/obw:cap`.
  Requires `.obsidian.yaml` with a `journal` section in the project root.
  NOT triggered for: long-form notes (use `note` skill), project tasks (use `pm` skill).
---

# cap — Quick Journal Capture

This skill owns: tag extraction and bullet composition. Everything else (daily note creation, path resolution, appending, frontmatter) delegates to the `obsidian` CLI. **For all CLI syntax, invoke the official `obsidian:obsidian-cli` skill first** — it is the authoritative reference. Only fall back to `obsidian help` if that skill's guidance is missing or contradicts observed behavior.

## Config (`.obsidian.yaml`)

```yaml
vault: <VAULT_NAME>
journal:
  timestamp: true          # Prepend HH:MM
  tag_frontmatter: true    # Merge #tags into daily note frontmatter
```

Daily note folder / filename format / template are owned by Obsidian's **Daily Notes** core plugin — `.obsidian.yaml` does not restate them. If `.obsidian.yaml` is missing, tell the user to run `/obw:init` and stop.

## Steps

1. **Parse input** — extract `#tag` tokens, strip from body. If body is empty after stripping, prompt for content.
2. **Compose bullet** — `- HH:MM — <body> #tag1 #tag2` (omit `HH:MM —` when `timestamp: false`; omit `#tags` when no tags).
3. **Append to today's daily note** via CLI `daily:append content="<bullet>"`. The CLI creates the daily note if missing, honoring Obsidian's Daily Notes settings.
4. **Merge tags into frontmatter** (only when `tag_frontmatter: true` and tags exist):
   - Resolve daily note path via `daily:path`.
   - Read existing `tags` via `property:read`.
   - Union + dedup, then write back via `property:set ... type=list`.
5. **Confirm** — show the daily note path and the appended line. Return wikilink `[[<basename>]]`.

## Edge cases

- **Daily Notes plugin disabled** — `daily:append` errors; ask the user to enable it in Obsidian settings.
- **Empty content after tag extraction** — prompt before writing anything.

## Example

`/obw:cap #worklog 完成了 API-first 架構 draft，交給 @arch review`

→ bullet: `- 14:32 — 完成了 API-first 架構 draft，交給 @arch review #worklog`
→ appended via `daily:append`; `worklog` merged into daily note frontmatter `tags`.
