# Set up the Obsidian Workspace

Run everything directly in the main context — the flow is interactive (`AskUserQuestion`) by design.

## Filesystem Access

Vault I/O goes through the `obsidian` CLI. Setup touches the vault's files directly only for these, and nothing else in obw does:

- **Reads** — `obsidian.json` and `.obsidian/templates.json`, parsed with `jq` (a dependency of this skill); `test -f` / `test -d` existence checks; `ls` of a legacy `archive/` folder.
- **Writes** — `mkdir` for the templates folder and the project skeleton (the CLI has no folder verb); `cp` of starter templates; `rmdir` of an emptied legacy `archive/` folder.

## Execution

1. **Handle existing config** — a `.obsidian.yaml` with no `pm.project` gets replaced in step 7, so go on to step 2 and offer its `vault` as the default. If the file has `pm.project`, show a one-line summary (vault name + project) and ask whether to overwrite. If the user declines the overwrite, don't exit: read `vault` and `pm.project` from the existing file, resolve `$VAULT_PATH` from the `obsidian.json` entry whose path basename matches that `vault` name (the step 2 listing, without asking), then jump to step 5, so bootstrap and migration still run. If no entry matches, report it and stop. This is the **keep-config** path. An already-configured project is the normal case for a migration run.

2. **Pick a vault** — list vaults from Obsidian's config and ask the user:
   ```bash
   cat ~/Library/Application\ Support/obsidian/obsidian.json \
     | jq -r '.vaults | to_entries[] | "\(.key)\t\(.value.path)"'
   ```
   (Linux: `~/.config/obsidian/obsidian.json`; Windows: `%APPDATA%\obsidian\obsidian.json`.) Resolve `$VAULT_PATH` from the chosen entry.

3. **Ask config options** (via `AskUserQuestion`):
   - Project identifier? (default = current directory basename)

4. **Install starter templates** — read the Templates folder from `$VAULT_PATH/.obsidian/templates.json`:
   ```bash
   test -f "$VAULT_PATH/.obsidian/templates.json" && TF=$(jq -r '.folder // ""' "$VAULT_PATH/.obsidian/templates.json")
   ```
   - If the `test -f` fails, `.obsidian/templates.json` is missing → tell the user to enable the **Templates** core plugin in Obsidian, then re-run `/obw:pm`. Stop.
   - Empty `TF` (no `folder` key, or an empty one) means vault root; otherwise `mkdir -p "$VAULT_PATH/$TF"`.
   - For each of `task.md`, `doc.md`:
     ```bash
     [ -e "$VAULT_PATH/$TF/task.md" ] || cp "${CLAUDE_PLUGIN_ROOT}/templates/task.md" "$VAULT_PATH/$TF/task.md"
     ```
     Never overwrite existing templates. Do not read template contents into the conversation — `cp` is enough.

5. **Bootstrap the project workspace** — every project gets `tasks/`, `docs/`, and a dashboard:
   ```bash
   test -d "$VAULT_PATH/pm/$PROJECT" && echo "pm/$PROJECT existed"
   mkdir -p "$VAULT_PATH/pm/$PROJECT/tasks/archive" "$VAULT_PATH/pm/$PROJECT/docs"
   obsidian vault=<VAULT_NAME> create path="pm/$PROJECT/dashboard.base" \
     content="$(sed "s/__PROJECT__/$PROJECT/g" "${CLAUDE_PLUGIN_ROOT}/templates/dashboard-project.base")"
   ```
   The CLI has no folder verb, so the folders are created with `mkdir`. The `test -d` line runs first so that step 6 knows whether the project was already there. Omit `overwrite` on the `create` so an existing dashboard is left alone; an already-exists error here means the dashboard was there, which is success, not failure.

6. **Upgrade an existing project** — only if step 5 printed `pm/$PROJECT existed`. Run the checks in Old Layouts below for a layout from before 0.9, then bring both dashboards up to the template with the pm skill's `refresh dashboard` (`/obw:pm refresh dashboard`).

7. **Write `.obsidian.yaml`** using the template below. On the keep-config path, skip this step: never write `.obsidian.yaml`, the existing file stays as it was.

8. **Offer `.gitignore` entry** — ask whether to add `.obsidian.yaml` to `.gitignore`. On the keep-config path, skip the question if `.gitignore` already lists it.

## Config Template

```yaml
# Obsidian Workspace configuration
vault: <VAULT_NAME>

pm:
  project: <PROJECT_NAME>
```

## Confirmation Output

Return a summary in this shape. On the keep-config path, the first line reads `.obsidian.yaml kept (vault=<NAME>, project=<PROJ>).` and the Templates line is omitted, since step 4 did not run:

```
.obsidian.yaml created (vault=<NAME>, project=<PROJ>).
Templates installed to <TF>/: task.md, doc.md (only the missing ones).
Workspace ready at pm/<PROJ>/: tasks/, docs/, dashboard.base.
Migrated: <N> notes moved to tasks/archive/, <N> titles backfilled, dashboards regenerated. (omit if nothing migrated)
```

## Old Layouts

Layouts from before obw 0.9, checked by step 6 on a project that already existed. Detect each one, report what was found, and ask before touching anything; each part is independently skippable.

- **Legacy `archive/`** — if `$VAULT_PATH/pm/$PROJECT/archive` exists, list it with `ls`, then move each note to `pm/$PROJECT/tasks/archive` with the CLI's `move` (exact parameter names from the `obsidian:obsidian-cli` skill), one call per file, so Obsidian rewrites inbound links. Never `mv` these — a filesystem move breaks every wikilink pointing at them. Finish with `rmdir` on the old folder, never `rm -r`: `rmdir` refuses if anything is left behind, which is exactly the check you want. Report a moved/failed count, not a file listing.

- **Missing `title`** — pre-0.9 notes have no `title` property. Dashboards fall back to the filename, so this is cosmetic; offer it, don't force it. Backfill by un-kebabbing the filename (`implement-auth` → `Implement Auth`) with one `property:set` per note. Skip notes that already have a `title`. On a large project, work in batches and report counts only — never read the notes into the conversation to recover exact original casing unless the user asks for that specifically.

Filenames outside the pm filename rule are left alone. Renaming them is a link-rewriting operation with no upside; the rule applies to newly created notes.
