# note — Create a Long-Form Note

This mode owns: target folder resolution, filename strategy, frontmatter composition. Everything else is plain CLI usage.

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

## Example

`/obw:note API Redesign Proposal --folder Architecture --tag design --tag api`

With `filename_strategy: title` → creates `Architecture/api-redesign-proposal.md`, returns `[[api-redesign-proposal]]`.
