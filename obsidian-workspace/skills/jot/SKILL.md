---
name: jot
description: Unified entry point for Obsidian daily-note captures and long-form notes. Triggers on "記一下 / log / 紀錄 / capture this / 寫到 journal" (→ cap mode) and "建立筆記 / new note / 寫一份筆記 / create a note on" (→ note mode). Also via `/obw:jot`. Requires `.obsidian.yaml`.
---

# jot — Capture or Note

Single triage skill. Decide the mode, then run the `obsidian` CLI directly — no sub-agent. Before any CLI call, invoke the `obsidian:obsidian-cli` skill to load exact syntax — never run `obsidian help`/`--help` to discover it. If `.obsidian.yaml` is missing, tell the user to run `/obw:init` and stop.

## Mode selection

Inspect the user's input:

- **cap mode** — short text (one line / a sentence), `#tag` tokens, no explicit title, journaling/log verbs. Goes to today's daily note.
- **note mode** — explicit title, multi-line body, "create a note on X", document-shaped content. Goes to a vault folder (per `.obsidian.yaml` `note` config).
- **ambiguous** — call `AskUserQuestion` with two options: "Quick capture (daily note)" and "New long-form note".

## cap mode

Append a timestamped bullet to today's daily note. Nothing more. Daily note folder / filename / template are owned by Obsidian's **Daily Notes** core plugin.

1. If body is empty, prompt for content.
2. Compose bullet: `- HH:MM — <body>` (any `#tag` tokens stay inline — Obsidian indexes them automatically).
3. Append the bullet to today's daily note via `daily:append` (creates the note if missing).
4. Confirm with the appended line. Return `[[<daily-note-basename>]]`.

Example: `記一下 #worklog 完成了 API-first 架構 draft` → `- 14:32 — 完成了 API-first 架構 draft #worklog`

## note mode

Config (`.obsidian.yaml`):

```yaml
vault: <VAULT_NAME>
note:
  default_folder: Inbox
  filename_strategy: title     # title | slug | timestamp-title
```

1. **Parse input**:
   - `title` — required, first non-flag text.
   - `--folder <path>` — override default folder (vault-relative, reject leading `/` or `..`).
   - `--tag <tag>` — repeatable, adds to frontmatter.
   - Trailing text after flags — optional initial body.

2. **Compute filename** by kebab-casing the title (lowercase, whitespace/punctuation → `-`, collapse repeats). Keep Unicode characters intact.
   - `title` → `<kebab>.md`
   - `slug` → `<kebab>-YYYYMMDD.md`
   - `timestamp-title` → `YYYYMMDD-<kebab>.md`

3. **Resolve path** = `<folder>/<filename>`. Check for conflict (`read`) — if it exists, ask the user (overwrite / rename / cancel via `AskUserQuestion`).

4. **Create the note** at that path (`create`) with content:
   ```markdown
   ---
   created: YYYY-MM-DD
   tags: [<tag1>, <tag2>]
   ---

   # <original title, un-kebabbed>

   <initial body, if provided>
   ```
   Empty tag list → `tags: []`. Missing body → just frontmatter + H1.

5. **Confirm** — show vault-relative path and wikilink `[[<basename>]]`.

Example: `new note: API Redesign Proposal --folder Architecture --tag design --tag api` — with `filename_strategy: title` → creates `Architecture/api-redesign-proposal.md`, returns `[[api-redesign-proposal]]`.
