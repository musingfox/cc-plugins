---
description: "Interactively create .obsidian.yaml config for the current project"
argument-hint: ""
allowed-tools: ["Bash", "Read", "Write", "AskUserQuestion"]
---

# /obw:init — Initialize Obsidian Workspace Config

Create a `.obsidian.yaml` file in the current project root, configuring vault binding and settings for `/obw:cap`, `/obw:note`, and `/obw:pm`.

## Execution

1. **Check existing config**: If `.obsidian.yaml` already exists, show current contents and ask whether to overwrite.

2. **List available vaults** from Obsidian's config:
   ```bash
   cat ~/Library/Application\ Support/obsidian/obsidian.json | jq -r '.vaults | to_entries[] | "\(.key)\t\(.value.path)"'
   ```
   (Linux: `~/.config/obsidian/obsidian.json`; Windows: `%APPDATA%\obsidian\obsidian.json`)

3. **Ask the user** (use `AskUserQuestion` with each prompt):
   - Which vault to bind? (present vaults as options)
   - Project identifier for `/obw:pm`? (default: current directory basename; allow "skip" to omit PM)
   - Journal folder? (default: `Journal`)
   - Journal filename pattern? (default: `{{date}}` → `YYYY-MM-DD.md`)
   - Journal section heading for `/obw:cap`? (default: `## Log`)
   - Default note folder for `/obw:note`? (default: `Inbox`)
   - Note filename strategy? Options: `title` (kebab-case title), `slug` (title + timestamp), `timestamp-title`

4. **Write `.obsidian.yaml`** with the template below, filling in user-provided values. Omit the `pm` section if user skipped PM setup.

5. **Suggest adding to `.gitignore`** if the file should not be tracked (ask the user).

## Config Template

```yaml
# Obsidian Workspace configuration
vault: <VAULT_NAME>

# Journal settings for /obw:cap (quick capture)
journal:
  folder: Journal
  filename: "{{date}}"        # {{date}} → YYYY-MM-DD
  section: "## Log"           # Heading under which entries are appended
  timestamp: true             # Prepend HH:MM to each entry
  tag_frontmatter: true       # If capture contains #tags, merge into frontmatter tags list

# Note settings for /obw:note (long-form notes)
note:
  default_folder: Inbox
  filename_strategy: title    # title | slug | timestamp-title

# Project Management for /obw:pm (optional; omit to disable)
pm:
  project: <PROJECT_NAME>
```

## Filename Strategy Reference

- `title`: `My New Note` → `my-new-note.md`
- `slug`: `My New Note` → `my-new-note-20260417.md`
- `timestamp-title`: `My New Note` → `20260417-my-new-note.md`

## After Creation

Confirm success and show next steps:

```
.obsidian.yaml created.

Next steps:
  /obw:cap <text>        — quick capture to journal
  /obw:note <title>      — create a full note
  /obw:pm                — project management (if configured)
```
