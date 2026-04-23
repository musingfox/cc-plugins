# obw Starter Templates

These files are **fallback templates** — `/obw:init` copies them into the vault's Obsidian Templates folder if the corresponding names don't already exist there. After copy, they belong to the vault; modify freely.

Templates are deliberately **not** auto-loaded into Claude's context. They are plain files copied via shell (`cp` / `sed` + `obsidian create content=$(cat ...)`) so their contents never enter the token budget.

## Files

| Template | Purpose | Obsidian vars | Post-process |
|----------|---------|---------------|--------------|
| `task.md` | `/obw:pm` task | `{{title}}`, `{{date}}` | `property:set` for project/priority/due/tags |
| `doc.md` | `/obw:pm` document | `{{title}}`, `{{date}}` | `property:set` for project |
| `adr.md` | `/obw:pm` ADR | `{{title}}`, `{{date}}` | `property:set` for project/status |
| `dashboard-cross.md` | Cross-project Dataview dashboard | `{{date}}` | none |
| `dashboard-project.md` | Per-project dashboard | `{{date}}` | `sed` replace `__PROJECT__` before create |

Obsidian's Templates core plugin only resolves `{{title}}`, `{{date}}`, `{{time}}`. Anything project-scoped (`project`, `priority`, `due`) is set after creation via `obsidian property:set`.

## Required Frontmatter Fields

If you rewrite these templates, keep these fields — `/obw:pm` search / dashboard queries depend on them:

- Tasks: `type: task`, `status`, `priority`, `project`, `tags`
- Docs: `type: doc`, `project`
- ADRs: `type: adr`, `project`, `status`

## Regenerating

To restore a template to its plugin default, delete the file from the vault and run `/obw:init` again. Init only copies missing names; it never overwrites existing templates.
