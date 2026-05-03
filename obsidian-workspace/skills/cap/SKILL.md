---
name: cap
description: |
  Quick-capture short entries to today's daily note in an Obsidian vault.
  Composes a timestamped bullet and delegates the append to the Obsidian CLI's
  `daily:append`.
when-to-use: |
  Triggered when the user wants a quick journal/log entry — "記一下", "capture this",
  "寫到 journal", "log 一下", "紀錄這個想法", "add to today's journal". Also triggers on `/obw:cap`.
  Requires `.obsidian.yaml` in the project root.
  NOT triggered for: long-form notes (use `note` skill), project tasks (use `pm` skill).
---

# cap — Quick Journal Capture

Append a timestamped bullet to today's daily note. Nothing more.

## Config (`.obsidian.yaml`)

```yaml
vault: <VAULT_NAME>
```

Daily note folder / filename / template are owned by Obsidian's **Daily Notes** core plugin. If `.obsidian.yaml` is missing, tell the user to run `/obw:init` and stop.

## Steps

1. If body is empty, prompt for content.
2. Compose bullet: `- HH:MM — <body>` (any `#tag` tokens stay inline — Obsidian indexes them automatically).
3. Append via `obsidian vault=<v> daily:append content="<bullet>"`. The CLI creates the daily note if missing.
4. Confirm with the appended line. Return `[[<daily-note-basename>]]`.

For CLI syntax, consult the preloaded `obsidian:obsidian-cli` skill; fall back to `obsidian daily:append --help` if needed.

## Example

`/obw:cap #worklog 完成了 API-first 架構 draft，交給 @arch review`

→ `- 14:32 — 完成了 API-first 架構 draft，交給 @arch review #worklog`
