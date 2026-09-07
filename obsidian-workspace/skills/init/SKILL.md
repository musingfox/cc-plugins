---
name: init
description: Interactively create `.obsidian.yaml`, install starter templates (task / doc / adr), bootstrap the project's vault workspace, and migrate a pre-0.9 layout. Triggers via `/obw:init`, on "migrate my obw vault", or when another obw skill reports missing config.
---

# init — Initialize Obsidian Workspace

Run everything directly in the main context — the flow is interactive (`AskUserQuestion`) by design.

## Execution

1. **Handle existing config** — if `.obsidian.yaml` exists in the project root, show a one-line summary (vault name + project) and ask whether to overwrite. If the user declines the overwrite, don't exit: read `vault` and `pm.project` from the existing file and jump to step 5, so bootstrap and migration still run. An already-configured project is the normal case for a migration run.

2. **Pick a vault** — list vaults from Obsidian's config and ask the user:
   ```bash
   cat ~/Library/Application\ Support/obsidian/obsidian.json \
     | jq -r '.vaults | to_entries[] | "\(.key)\t\(.value.path)"'
   ```
   (Linux: `~/.config/obsidian/obsidian.json`; Windows: `%APPDATA%\obsidian\obsidian.json`.) Resolve `$VAULT_PATH` from the chosen entry.

3. **Ask config options** (via `AskUserQuestion`):
   - Project identifier for `/obw:pm`? (default = current directory basename; allow "skip" to omit the `pm` section)
   - Default folder for long-form notes? (default `Inbox`)
   - Filename strategy for notes? options: `title` / `slug` / `timestamp-title`

   Mention: daily note folder / filename / template are configured in Obsidian's **Daily Notes** core plugin, not here. Quick capture always prepends `HH:MM` and writes `#tag` tokens inline (Obsidian indexes them automatically).

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

5. **Bootstrap the project workspace** — skip entirely if the `pm` section was skipped. Every project gets `tasks/`, `docs/`, and a dashboard:
   ```bash
   mkdir -p "$VAULT_PATH/pm/$PROJECT/tasks/archive" "$VAULT_PATH/pm/$PROJECT/docs"
   obsidian vault=<VAULT_NAME> create path="pm/$PROJECT/dashboard.base" \
     content="$(sed "s/__PROJECT__/$PROJECT/g" "${CLAUDE_PLUGIN_ROOT}/templates/dashboard-project.base")"
   ```
   The CLI has no folder verb, so the folders are created with `mkdir` — this and the templates copy are the only filesystem writes into the vault. Omit `overwrite` on the `create` so an existing dashboard is left alone; an already-exists error here means the dashboard was there, which is success, not failure.

6. **Migrate a pre-0.9 project** — only if `pm/$PROJECT` already existed before step 5. Detect, report what was found, and ask before touching anything; each part is independently skippable.

   - **Legacy `archive/`** — if `$VAULT_PATH/pm/$PROJECT/archive` exists, list it with `ls`, then move each note to `pm/$PROJECT/tasks/archive` with the CLI's `move` (exact parameter names from the `obsidian:obsidian-cli` skill), one call per file, so Obsidian rewrites inbound links. Never `mv` these — a filesystem move breaks every wikilink pointing at them. Finish with `rmdir` on the old folder, never `rm -r`: `rmdir` refuses if anything is left behind, which is exactly the check you want. Report a moved/failed count, not a file listing.

   - **Missing `title`** — pre-0.9 notes have no `title` property. Dashboards fall back to the filename, so this is cosmetic; offer it, don't force it. Backfill by un-kebabbing the filename (`implement-auth` → `Implement Auth`) with one `property:set` per note. Skip notes that already have a `title`. On a large project, work in batches and report counts only — never read the notes into the conversation to recover exact original casing unless the user asks for that specifically.

   - **Stale dashboards** — an existing `pm/$PROJECT/dashboard.base` predates the Blocked / By Parent / Docs views. Ask, then re-run the step 5 `create` **with** `overwrite`. Same for `pm/dashboard.base` using `templates/dashboard-cross.base`. This discards any hand edits to those files — say so before overwriting.

   Non-kebab filenames are left alone. Renaming them is a link-rewriting operation with no upside; the kebab rule applies to newly created notes.

7. **Write `.obsidian.yaml`** using the template below. Omit the `pm` section if skipped.

8. **Offer `.gitignore` entry** — ask whether to add `.obsidian.yaml` to `.gitignore`.

## Config Template

```yaml
# Obsidian Workspace configuration
vault: <VAULT_NAME>

note:
  default_folder: Inbox
  filename_strategy: title    # title | slug | timestamp-title

pm:
  project: <PROJECT_NAME>
```

## Confirmation Output

Return a summary in this shape:

```
.obsidian.yaml created (vault=<NAME>, project=<PROJ>).
Templates installed to <TF>/: task.md, doc.md, adr.md (only the missing ones).
Workspace ready at pm/<PROJ>/: tasks/, docs/, dashboard.base.
Migrated: <N> notes moved to tasks/archive/, <N> titles backfilled, dashboards regenerated. (omit if nothing migrated)

Next:
  /obw:jot <text>        — quick capture to today's daily note, or a long-form note
  /obw:pm                — task / doc / ADR management
```
