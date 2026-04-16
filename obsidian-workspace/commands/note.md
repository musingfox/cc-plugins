---
description: "Create a long-form note in your Obsidian vault, optionally in a custom folder"
argument-hint: "<title> [--folder <path>] [--tag <tag>] [content...]"
allowed-tools: ["Bash", "Read", "Write", "Edit", "AskUserQuestion"]
---

# /obw:note — Create a Full Note

Load and execute the `note` skill from this plugin. Creates a new note in the vault using the configured default folder (or an explicit override).

## Usage

```
/obw:note API redesign proposal
/obw:note Weekend reading list --folder References
/obw:note Retro 2026 Q1 --folder Retros --tag retro --tag quarterly
```

## Execution

Follow the `note` skill. In summary:

1. Read `.obsidian.yaml` → get `vault`, `note.default_folder`, `note.filename_strategy`.
2. If no config exists, tell the user to run `/obw:init`.
3. Parse arguments:
   - First non-flag token(s) before any `--` → `title`
   - `--folder <path>` → override default folder (relative to vault root)
   - `--tag <tag>` (repeatable) → frontmatter tags
   - Remaining text after title / flags → initial body content (optional)
4. Compute filename per `note.filename_strategy`:
   - `title`: kebab-case of title
   - `slug`: kebab-case + `-YYYYMMDD`
   - `timestamp-title`: `YYYYMMDD-` + kebab-case
5. If the target file already exists, ask the user (via `AskUserQuestion`): overwrite / pick a new name / cancel.
6. Create the note at `<folder>/<filename>.md` with frontmatter:
   ```yaml
   ---
   created: YYYY-MM-DD
   tags: [<tag1>, <tag2>]
   ---
   
   # <title>
   
   <initial body content, if provided>
   ```
7. If no initial content was supplied, leave the body with just the H1 title so the user can fill in later.
8. Confirm with the file path and Obsidian wikilink form `[[<filename>]]`.
