---
name: cap
description: |
  Quick-capture short entries to today's journal in an Obsidian vault.
  Appends timestamped bullets under a configured section, extracts #tags into frontmatter,
  and creates the daily journal file if it doesn't exist yet.
when-to-use: |
  Triggered when the user wants a quick journal/log entry — phrases like
  "記一下", "capture this", "寫到 journal", "log 一下", "紀錄這個想法",
  "add to today's journal", "筆記一下剛剛的", "捕捉這個靈感".
  Also triggers on `/obw:cap` and when `.obsidian.yaml` exists with a `journal` section
  and the user describes a short thought, observation, or work log entry.
  NOT triggered for: long-form notes (use `note` skill / `/obw:note`),
  project-management tasks (use `pm` skill / `/obw:pm`), or generic note-taking
  outside an Obsidian vault context.
---

# cap — Quick Journal Capture

Append a short entry to today's journal note in the configured Obsidian vault.

## Prerequisites

- Obsidian running or headless CLI available
- `obsidian` CLI installed and enabled
- `.obsidian.yaml` exists in the project root with a `journal` section

## Config Schema

```yaml
vault: <VAULT_NAME>
journal:
  folder: Journal              # Folder inside the vault where daily notes live
  filename: "{{date}}"         # {{date}} → YYYY-MM-DD
  section: "## Log"            # Heading under which entries are appended
  timestamp: true              # Prepend HH:MM to each entry
  tag_frontmatter: true        # Merge #tags into frontmatter tags list
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
   - Extract all `#tag` tokens (must start with `#`, no spaces) from the content.
   - Remaining text = content body (trimmed).
   - If content is empty after tag removal, ask the user for the capture content.

2. **Resolve paths**:
   - Today's date: `date +%Y-%m-%d`
   - Current time: `date +%H:%M`
   - Journal file: `<journal.folder>/<filename>.md` (substitute `{{date}}` → today)
   - Absolute path: `$VAULT_PATH/<journal.folder>/<resolved-filename>.md`

3. **Ensure journal file exists**:
   - Check via `obsidian vault=<vault> read file="<resolved-filename>"` or filesystem.
   - If missing, create with initial content:
     ```
     ---
     date: YYYY-MM-DD
     tags: []
     ---
     
     # YYYY-MM-DD
     
     ## Log
     ```
     Use `obsidian vault=<vault> create path="<folder>/<file>.md" silent` then overwrite with frontmatter via direct file write.
   - If `journal.section` differs from `## Log`, use the configured section heading instead.

4. **Merge tags into frontmatter** (if `tag_frontmatter: true` and tags were extracted):
   - Read current frontmatter `tags` list.
   - Union with new tags (dedup, preserve order).
   - Write back via `obsidian vault=<vault> property:set file="<file>" name=tags value="<t1>,<t2>" type=list`.

5. **Compose the bullet line**:
   - If `timestamp: true`: `- HH:MM — <content>`
   - Else: `- <content>`
   - Append tags inline (visible in Obsidian): `- HH:MM — <content> #tag1 #tag2`

6. **Append under the configured section**:
   - If the section heading doesn't exist in the file, append it first, then the bullet.
   - Use `obsidian vault=<vault> append file="<file>" content="<bullet>"` for simple append.
   - For section-targeted append, read the file, insert the bullet after the section heading (and after any existing bullets under it), then overwrite the file.

7. **Confirm**:
   - Show: file path, section, and the line that was added.
   - Return a wikilink: `[[<filename>]]`.

## Edge Cases

- **Multiple tags**: `/obw:cap #idea #auth 把 session 改成 JWT` → body = "把 session 改成 JWT", tags = [idea, auth].
- **No tag_frontmatter**: tags still appear inline in the bullet but are not added to frontmatter.
- **Section not found**: create it at the end of the file (after existing content).
- **File exists but no frontmatter**: prepend frontmatter block; do not destroy existing content.
- **Empty content**: prompt for the capture text before writing anything.

## Example

Input: `/obw:cap #worklog 完成了 API-first 架構 draft，交給 @arch review`

Result — appends to `Journal/2026-04-17.md`:
```markdown
## Log

- 14:32 — 完成了 API-first 架構 draft，交給 @arch review #worklog
```

Frontmatter `tags` updated to include `worklog`.
