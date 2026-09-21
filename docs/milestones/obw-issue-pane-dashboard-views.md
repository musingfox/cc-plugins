---
status: done        # accepted | done | superseded
delivered: 52acc82  # commit or tag ref — filled when acceptance passes
depends: []         # milestone slugs that must land first
---

# `/issue`: the pane lists a view of the project's Obsidian Bases dashboard

**Supersedes `obw-issue-pane.md`, written after delivery to replace a record that had gone
partly false.** That milestone committed the pane to a hand-written search query, to one CLI
call per view, and to kebab names as list labels, and it listed `base:query` among the
directions that lost — on the ground that a base row's keys are localized display names. The
spec `docs/spec/base-rows-keyed-by-path-not-labels.md` answers that objection directly (a row's
identity is its `path`, its values are raw frontmatter names, and no column label is ever a
key), so the objection no longer holds and the query it protected is gone. Everything else that
milestone recorded — the CLI's output shapes, the element bounds, the config lookup, what a
closed Obsidian.app does — is still true and is restated here where this change touched it.

## What is committed

The pane's list is a view of `pm/<project>/dashboard.base`, queried through the `obsidian` CLI.
The module owns no list definition: editing the Active view in the vault changes what `/issue`
lists, with no code change. `/issue` runs `base:views` on the dashboard and then one
`base:query` for the chosen view; the listing call is auxiliary and its failure is reported
rather than swallowed, while the query is the one call that produces the list. A view is chosen
by `/issue <view>` when the argument exactly equals a listed view name, and by a second `Select`
in the pane otherwise; both drive the same state, and a card name that is also a view name
resolves as the view, the card staying reachable from the list.

A row is opened at the `path` it carries, so a docs row, an ADR and an archived card all open —
which the previous pane could not do. `/issue <name>` resolves against the rows the current view
returned and falls back to `pm/<project>/tasks/<name>.md` only when no row carries that name.
Every path is validated before it reaches the CLI: the `pm/<project>/` prefix, a `.md` suffix, no
empty, `.` or `..` segment, no control character, and identical to its own bounded form, so the
string drawn and the string read are provably the same. Rows that fail it are counted and named
in a notice rather than silently dropped.

The list is grouped by each row's own status, in the order each status is first seen, CLI order
inside a group, rows with no status last, and no two status strings are ever compared — the
module imposes no status vocabulary, and `base:query` does not apply the view's own `groupBy`.

Classification stays positive, per `docs/spec/obsidian-cli-output-classified-positively.md`: the
known success shapes are a note starting with `---\n`, a JSON array of row objects each carrying
a string `path` (the empty array being a view with no rows), and a `name\ttype` listing (no line
being a dashboard with no views). Anything else is an error shown as the CLI printed it, and a
run that exited non-zero is reported from stderr rather than from whatever success-shaped text it
left on stdout. A failed dashboard query carries one fixed line pointing at `/obw:pm`; a
configuration error never does, because a missing `.obsidian.yaml` or `pm.project` belongs to
`/obw:init`.

## Concrete enough to build on

- **CLI verbs** (Obsidian CLI 1.13.7): `base:views path=<base>` prints one `name\ttype` line per
  view; `base:query path=<base> view=<name> format=json` returns the view's rows. Column keys are
  not stable — a formula's `displayName` and Obsidian's UI-language label for a file property
  both appear as keys — so only `path` and raw frontmatter names may be read.
- **Views differ in shape.** Blocked and Recently Completed carry no `status` key at all; Docs
  carries `status: null`. Grouping tolerates both.
- **Row paths** are vault-root-relative, end in `.md`, and nest deeper than the task folder.
- **The test kit can drive a `Select` pick**, through the mounted drawing's `select` — not
  through `$.ui`, which has no such method, and not through the rendered tree, whose `onSelect`
  the kit strips. `tests/fixtures/pane.ts` wraps it as `pick($, w, key, value)`. The earlier
  conclusion that a pick could only be verified in a live session was wrong.
- **The pane withholds the view picker while a query is in flight**, so a loading pane is the
  single line `Reading the vault…` and a second switch cannot start mid-flight. The discriminator
  is an explicit flag on the pane state: `message.kind` cannot serve, because the empty-view
  outcome is also a notice and must still draw the picker.
- **Built against Claude Code 2.1.278.** Suite: `bash obsidian-workspace/tests/run.sh` (9 shell
  suites) and `claude plugin test obsidian-workspace` (406 cases). The repo-wide
  `tests/run-all.sh` does not cover this plugin.

## Left open deliberately

`hooks/register.ts` still derives `pm/<project>/` in three modules, passes `vault` and `project`
as separate positional parameters against a `Scope` type that already pairs them, inlines the
clip notice twice, and names a field `CardRegion.name` that holds a full vault path and is drawn
to the user as one. Tracked as the Obsidian card `obw-issue-pane-structure-cleanup`; none of it
affects behaviour.

Two asymmetries are known and accepted: a failed view listing draws its text with a prefix naming
the listing, while the same text arriving through the query does not, and a listing whose lines
parse but whose names are all unusable is an error while a listing with no lines is empty — a
boundary no spec states.
