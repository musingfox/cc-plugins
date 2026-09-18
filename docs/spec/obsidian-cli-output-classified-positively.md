---
id: obsidian-cli-output-classified-positively
status: proposed
scope:
  - "obsidian-workspace/hooks/**"
verify: null
related: [obsidian-cli-never-empty-target, mod-ui-text-within-element-bounds]
source: obw-issue-pane
adr: null
---
Code that draws or parses `obsidian` CLI output accepts it only when it matches
a known success shape; everything else is an error. The CLI's exit code cannot
be used: it exits 0 on its own errors and prints them on stdout. The success
shapes are a note's text starting with `---\n`, a `search … format=json` result
that parses as a JSON array of strings, and the exact text `No matches found.`,
which that same search prints instead of JSON when nothing matches and which
means an empty list. A closed Obsidian.app is the only case observed to exit 1,
with its message on stderr.

The rule binds the obw module, which runs the CLI through `$.process.run` and
draws the result. The skills, where the model reads the output itself, are out
of scope.

A deny-list keyed on `Error: ` is the violation this forbids: `Vault not found.`
already has no such prefix, and any new error text the CLI adds is drawn as if
it were a card, with nothing marking it wrong.

Born prose: the module does not exist yet. Once it does, bind this to a
`claude plugin test` case per error shape with the CLI call stubbed.
