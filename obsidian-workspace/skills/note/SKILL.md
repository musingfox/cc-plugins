---
name: note
description: |
  Create long-form notes in an Obsidian vault with configurable default folder and filename strategy.
  Supports custom folders via flag, tag frontmatter, and filename strategies (title / slug / timestamp-title).
when-to-use: |
  Triggered when the user wants to create a more substantial note in a project-bound vault —
  phrases like "建立一篇筆記", "new note about", "寫一份筆記", "create a note on",
  "寫一個完整的紀錄", "long-form note", "詳細紀錄到 vault".
  Also triggers on `/obw:note`.
  Requires `.obsidian.yaml` with a `note` section in the project root.
  NOT triggered for: quick log entries (use `cap` skill / `/obw:cap`),
  project tasks/docs/ADRs (use `pm` skill / `/obw:pm`),
  ad-hoc notes in a vault without project binding (use `obsidian:obsidian-cli` or `obsidian:obsidian-markdown`),
  or vault-less contexts.
---

# note — Create a Long-Form Note

Create a new note in the configured Obsidian vault. Default location comes from `.obsidian.yaml`; can be overridden per call.

## Prerequisites

- Obsidian running or headless CLI available
- `obsidian` CLI installed and enabled
- `.obsidian.yaml` exists in the project root with a `note` section

## Config Schema

```yaml
vault: <VAULT_NAME>
note:
  default_folder: Inbox
  filename_strategy: title     # title | slug | timestamp-title
```

If `.obsidian.yaml` is missing, instruct the user to run `/obw:init` and stop.

## Resolving Vault Path

```bash
VAULT_PATH=$(cat ~/Library/Application\ Support/obsidian/obsidian.json \
  | jq -r '.vaults | to_entries[] | select(.value.path | endswith("/'"$VAULT_NAME"'")) | .value.path')
```

(Linux: `~/.config/obsidian/obsidian.json`; Windows: `%APPDATA%\obsidian\obsidian.json`)

## Execution Steps

1. **Parse input**:
   - `title`: required — first non-flag text before any `--flag`.
   - `--folder <path>`: optional — overrides `note.default_folder`. Path relative to vault root.
   - `--tag <tag>`: optional, repeatable — frontmatter tag entries.
   - Remaining text after flags (if any): initial body content.

2. **Compute filename** using `note.filename_strategy`:
   - Kebab-case the title: lowercase, replace whitespace + punctuation with `-`, collapse repeats, strip leading/trailing `-`.
   - `title`: `<kebab>`
   - `slug`: `<kebab>-YYYYMMDD`
   - `timestamp-title`: `YYYYMMDD-<kebab>`
   - Append `.md`.

3. **Resolve target folder**:
   - `--folder` value if provided, else `note.default_folder`.
   - Full vault-relative path: `<folder>/<filename>`.

4. **Check for conflicts**:
   - If the target file already exists, ask the user (via `AskUserQuestion`):
     - Overwrite
     - Choose a different filename
     - Cancel

5. **Ensure target folder exists**:
   ```bash
   mkdir -p "$VAULT_PATH/<folder>"
   ```
   (Resolve `$VAULT_PATH` per the "Resolving Vault Path" section above.)

6. **Create the note**:
   ```bash
   obsidian vault=<vault> create path="<folder>/<filename>" silent
   ```
   Then write frontmatter + title + body by overwriting the file at `$VAULT_PATH/<folder>/<filename>`:

   ```markdown
   ---
   created: YYYY-MM-DD
   tags: [<tag1>, <tag2>]
   ---
   
   # <original title, un-kebabbed>
   
   <initial body, if provided>
   ```

   If no tags were provided, use `tags: []`. If no body was provided, leave the file with just frontmatter and H1.

7. **Confirm**:
   - Show: absolute vault path and wikilink form `[[<filename-without-ext>]]`.
   - Suggest: open in Obsidian, or add content with follow-up commands.

## Filename Strategy Examples

Title: `API Redesign Proposal`, today: `2026-04-17`

| Strategy          | Result                           |
|-------------------|----------------------------------|
| `title`           | `api-redesign-proposal.md`       |
| `slug`            | `api-redesign-proposal-20260417.md` |
| `timestamp-title` | `20260417-api-redesign-proposal.md` |

## Edge Cases

- **Non-ASCII titles (e.g., Chinese)**: keep characters as-is in the H1 heading, but kebab the filename by transliterating or leaving Unicode intact — prefer leaving Unicode intact (Obsidian supports it). Replace only whitespace and punctuation.
- **`--folder` with leading slash or `..`**: reject and ask the user for a vault-relative path.
- **Missing title**: prompt the user for it before creating anything.
- **Folder doesn't exist**: create with `mkdir -p` silently; no confirmation needed.

## Example

Input: `/obw:note API Redesign Proposal --folder Architecture --tag design --tag api`

Config: `filename_strategy: title`, vault: `CyrisVault`

Result:
- Creates `$VAULT_PATH/Architecture/api-redesign-proposal.md`
- Content:
  ```markdown
  ---
  created: 2026-04-17
  tags: [design, api]
  ---
  
  # API Redesign Proposal
  ```
- Returns: `[[api-redesign-proposal]]`
