---
description: "Interactively create .obsidian.yaml and install starter templates for this project"
argument-hint: ""
allowed-tools: ["Bash", "Read", "Write", "AskUserQuestion"]
---

# /obw:init — Initialize Obsidian Workspace

Create `.obsidian.yaml` for the current project and install the plugin's starter templates into the vault's Obsidian Templates folder (only for names that don't already exist there).

## Execution

1. **Handle existing config** — if `.obsidian.yaml` exists, show its contents and ask whether to overwrite.

2. **Pick a vault** — list vaults from Obsidian's config and ask the user:
   ```bash
   cat ~/Library/Application\ Support/obsidian/obsidian.json \
     | jq -r '.vaults | to_entries[] | "\(.key)\t\(.value.path)"'
   ```
   (Linux: `~/.config/obsidian/obsidian.json`; Windows: `%APPDATA%\obsidian\obsidian.json`.) Resolve `$VAULT_PATH` from the chosen entry.

3. **Ask config options** (via `AskUserQuestion`):
   - Project identifier for `/obw:pm`? (default = current directory basename; allow "skip" to omit the `pm` section)
   - Prepend `HH:MM` to `/obw:cap` bullets? (default yes)
   - Merge `#tags` from `/obw:cap` into daily note frontmatter? (default yes)
   - Default folder for `/obw:note`? (default `Inbox`)
   - Filename strategy for `/obw:note`? options: `title` / `slug` / `timestamp-title`

   Mention: daily note folder / filename / template are configured in Obsidian's **Daily Notes** core plugin, not here.

4. **Install starter templates** — read the Templates folder from `$VAULT_PATH/.obsidian/templates.json`:
   ```bash
   TF=$(jq -r .folder "$VAULT_PATH/.obsidian/templates.json" 2>/dev/null)
   ```
   - If `.obsidian/templates.json` is missing → tell the user to enable the **Templates** core plugin in Obsidian, then re-run `/obw:init`. Stop.
   - Empty `TF` means vault root; otherwise `mkdir -p "$VAULT_PATH/$TF"`.
   - For each of `task.md`, `doc.md`, `adr.md`:
     ```bash
     [ -e "$VAULT_PATH/$TF/task.md" ] || cp "${CLAUDE_PLUGIN_ROOT}/templates/task.md" "$VAULT_PATH/$TF/task.md"
     ```
     Never overwrite existing templates. Do not read template contents into the conversation — `cp` is enough.

5. **Write `.obsidian.yaml`** using the template below. Omit the `pm` section if skipped.

6. **Offer `.gitignore` entry** — ask whether to add `.obsidian.yaml` to `.gitignore`.

## Config Template

```yaml
# Obsidian Workspace configuration
vault: <VAULT_NAME>

journal:
  timestamp: true
  tag_frontmatter: true

note:
  default_folder: Inbox
  filename_strategy: title    # title | slug | timestamp-title

pm:
  project: <PROJECT_NAME>
```

## Confirmation Output

```
.obsidian.yaml created.
Templates installed to: <TF>/ (task.md, doc.md, adr.md — only the missing ones).

Next:
  /obw:cap <text>        — quick capture to today's daily note
  /obw:note <title>      — create a long-form note
  /obw:pm                — task / doc / ADR management
```
