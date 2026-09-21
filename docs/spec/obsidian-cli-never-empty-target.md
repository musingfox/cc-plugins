---
id: obsidian-cli-never-empty-target
status: accepted
scope:
  - "obsidian-workspace/**"
verify: null
related: [obsidian-cli-output-classified-positively, base-rows-keyed-by-path-not-labels]
source: obw-issue-pane
adr: null
---
Never invoke the `obsidian` CLI with an empty `path=` or `file=` value, and
never build either one from an input that has not been checked non-empty
first. With the target empty the CLI falls back to the note currently active
in Obsidian: `read` returns that note, and write verbs such as `property:set`
and `append` modify it and still report success. Name a note by its literal
vault path, `pm/<project>/tasks/<kebab>.md`, never by `file=`: `file=`
resolves a bare name across the whole vault and picks one of several notes
that share it.

The obw module rejects an argument that is empty or contains `/` before it
builds argv. Skills write the path as a literal rather than through a shell
variable, which comes out empty when the variable fails to set.

The violation is silent twice over: a read shows a real, well-formed note that
is simply the wrong one, and a write lands in whatever note the user last had
open while the CLI reports success.

Born prose: nothing can grep for "an empty value at run time". A binding needs
the module's argv builder to exist, and then a `claude plugin test` case.
