---
name: note
description: |
  Create long-form notes in an Obsidian vault at a configured default folder
  with a chosen filename strategy. Delegates vault I/O to the Obsidian CLI.
when-to-use: |
  Triggered for substantial new notes — "建立一篇筆記", "new note about",
  "寫一份筆記", "create a note on". Also triggers on `/obw:note`.
  Requires `.obsidian.yaml` with a `note` section.
  NOT triggered for: quick log entries (use `cap` skill),
  project tasks/docs/ADRs (use `pm` skill),
  or ad-hoc notes with no project binding (use `obsidian:obsidian-cli`).
---

# note — Create a Long-Form Note

This skill owns: target folder resolution, filename strategy, frontmatter composition. Vault I/O delegates to the `obsidian` CLI. **For all CLI syntax, invoke the official `obsidian:obsidian-cli` skill first** — it is the authoritative reference. Only fall back to `obsidian help` if that skill's guidance is missing or contradicts observed behavior.

## Config (`.obsidian.yaml`)

```yaml
vault: <VAULT_NAME>
note:
  default_folder: Inbox
  filename_strategy: title     # title | slug | timestamp-title
```

## Steps

1. **Parse input**:
   - `title` — required, first non-flag text.
   - `--folder <path>` — override default folder (vault-relative, reject leading `/` or `..`).
   - `--tag <tag>` — repeatable, adds to frontmatter.
   - Trailing text after flags — optional initial body.

2. **Compute filename** by kebab-casing the title (lowercase, whitespace/punctuation → `-`, collapse repeats). Keep Unicode characters intact.
   - `title` → `<kebab>.md`
   - `slug` → `<kebab>-YYYYMMDD.md`
   - `timestamp-title` → `YYYYMMDD-<kebab>.md`

3. **Resolve path** = `<folder>/<filename>`. Check for conflict via CLI `read` — if it exists, ask the user (overwrite / rename / cancel via `AskUserQuestion`).

4. **Create the note** via CLI `create path="<folder>/<filename>" content="..."` where content is:
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

## Example

`/obw:note API Redesign Proposal --folder Architecture --tag design --tag api`

With `filename_strategy: title` → creates `Architecture/api-redesign-proposal.md`, returns `[[api-redesign-proposal]]`.
