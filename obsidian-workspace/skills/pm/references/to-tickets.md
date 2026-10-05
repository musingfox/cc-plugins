# To Tickets

Look for prefactor opportunities first: make the change easy, then make the easy change.

Every ticket is a vertical slice:

- A complete narrow path through schema, API, UI, and tests — not a horizontal layer.
- Demoable or verifiable on its own.
- Sized to one fresh context window.
- Prefactor done first.

Split a spec, task, or conversation already in context — or a vault reference the user names. A missing reference stops with the CLI error. Nothing to split → say so and write nothing.

Before any vault write, show a numbered list. Per ticket: **Title**, **Blocked by** (other titles or none), **What it delivers**. Then `AskUserQuestion` with at least: approve / too coarse / too fine / edges wrong. Repeat until the user approves. Only then publish.

Create tickets blockers first so no link targets a missing note. Per ticket, in that order: one **Create task** (kebab filename, `template=task`, `title` and `project`); fill `## Description` from what it delivers and `## Acceptance Criteria`. If it has blockers, set `blocked_by` once with its complete list of `[[kebab]]` wikilinks and `status=blocked`. If the source is a task note in the same project, set `parent` to `[[source]]`. Any later blocker on an already-existing task follows Relations in [SKILL.md](../SKILL.md). The source is never modified.

A `create` error mid-publish → stop, receipt of which tickets landed and which did not, never re-run `create`. End with a receipt of created filenames.

Startable tickets — the frontier — are one `search` with `query="[type:task] [project:{project}] -[status:done] -[blocked_by:\"[[\"]" format=json`. `blocked_by` values are always `[[kebab]]` wikilinks; an empty list `[]` is not excluded by presence, only by value. A linear chain yields one at a time.
