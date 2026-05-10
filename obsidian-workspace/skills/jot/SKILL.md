---
name: jot
description: Unified entry point for Obsidian daily-note captures and long-form notes. Triggers on "記一下 / log / 紀錄 / capture this / 寫到 journal" (→ cap mode) and "建立筆記 / new note / 寫一份筆記 / create a note on" (→ note mode). Also via `/obw:cap` and `/obw:note`. Requires `.obsidian.yaml`.
---

# jot — Capture or Note

Single triage skill. Decide the mode, then delegate to the `obsidian-operator` agent. Never touch the vault directly.

## Mode selection

Inspect the user's input:

- **cap mode** — short text (one line / a sentence), `#tag` tokens, no explicit title, journaling/log verbs. Goes to today's daily note.
- **note mode** — explicit title, multi-line body, "create a note on X", document-shaped content. Goes to a vault folder (per `.obsidian.yaml` `note` config).
- **ambiguous** — call `AskUserQuestion` with two options: "Quick capture (daily note)" and "New long-form note".

Slash-command bypass: `/obw:cap` → cap, `/obw:note` → note, no triage.

## Delegate

Invoke `Agent`:

- `subagent_type`: `obsidian-operator`
- `description`: `Quick capture to daily note` (cap) or `Create long-form note` (note)
- `prompt`: `mode=cap\nargs=<input>` or `mode=note\nargs=<input>`

Relay the agent's summary verbatim. Do not add commentary.

## Pre-flight

If `.obsidian.yaml` is missing, tell the user to run `/obw:init` and stop.
