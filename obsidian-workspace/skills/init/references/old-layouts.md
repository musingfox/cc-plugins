# Old layouts

Layouts from before obw 0.9, checked by `/obw:init` step 6 on a project that already existed. Detect each one, report what was found, and ask before touching anything; each part is independently skippable.

- **Legacy `archive/`** — if `$VAULT_PATH/pm/$PROJECT/archive` exists, list it with `ls`, then move each note to `pm/$PROJECT/tasks/archive` with the CLI's `move` (exact parameter names from the `obsidian:obsidian-cli` skill), one call per file, so Obsidian rewrites inbound links. Never `mv` these — a filesystem move breaks every wikilink pointing at them. Finish with `rmdir` on the old folder, never `rm -r`: `rmdir` refuses if anything is left behind, which is exactly the check you want. Report a moved/failed count, not a file listing.

- **Missing `title`** — pre-0.9 notes have no `title` property. Dashboards fall back to the filename, so this is cosmetic; offer it, don't force it. Backfill by un-kebabbing the filename (`implement-auth` → `Implement Auth`) with one `property:set` per note. Skip notes that already have a `title`. On a large project, work in batches and report counts only — never read the notes into the conversation to recover exact original casing unless the user asks for that specifically.

Non-kebab filenames are left alone. Renaming them is a link-rewriting operation with no upside; the kebab rule applies to newly created notes.
