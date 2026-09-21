---
id: base-rows-keyed-by-path-not-labels
status: accepted
scope:
  - "obsidian-workspace/hooks/**"
verify: null
related: [obsidian-cli-output-classified-positively, obsidian-cli-never-empty-target]
source: null
adr: null
---
Code that reads `obsidian base:query` output takes a row's identity from `path`
and its values from raw frontmatter property names only. A column label is
never a key.

The keys of a `base:query … format=json` row are the view's column headers, and
two kinds of header are not the module's to depend on: a formula's
`displayName` from the `.base` file, which the vault owner edits, and
Obsidian's own UI-language label for a file property — a zh-TW interface
returns `檔案基本名稱` for `file.name` (verified 2026-09-20 against
`pm/cc-plugins/dashboard.base`, where the same rows also carried `Title` from
the template's `display` formula). Raw frontmatter properties — `status`,
`priority`, `due` — come back under their own names and are safe. For anything
derived, take `path` and read the note, or ask for `format=paths`.

This binds the obw module, which runs the CLI through `$.process.run` and draws
the result. The skills, where the model reads the output itself and can see a
renamed column, are out of scope.

The violation is silent in full: the CLI exits 0, the JSON parses, every row is
present, and only the value is `undefined`. The pane draws a blank column or
drops the rows it cannot name, with nothing marking it wrong — and it happens
only under an interface language or an edited `.base` the author does not have,
so the machine the code was written on never shows it.

Born prose: the reader does not exist yet, and a grep cannot tell a label key
from any other string index. Bind it to a `claude plugin test` case that stubs
`base:query` twice, once with the template's labels and once with every label
renamed, and asserts the drawn rows are identical.
