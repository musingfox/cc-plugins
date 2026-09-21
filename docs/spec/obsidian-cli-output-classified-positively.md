---
id: obsidian-cli-output-classified-positively
status: accepted
scope:
  - "obsidian-workspace/hooks/**"
verify: null
related: [obsidian-cli-never-empty-target, mod-ui-text-within-element-bounds, base-rows-keyed-by-path-not-labels]
source: obw-issue-pane
adr: null
---
Code that draws or parses `obsidian` CLI output accepts it only when it matches
a known success shape; everything else is an error. The CLI's exit code cannot
be used: it exits 0 on its own errors and prints them on stdout. The success
shapes are a note's text starting with `---\n`, a `base:query … format=json`
result that parses as a JSON array of row objects each carrying a string
`path`, where the empty array means a view with no rows, and a `base:views`
listing of `name\ttype` lines, where no line means a dashboard with no views.
An empty result is a success shape, an unreadable one is not: collapsing an
error into the empty case is the same violation as accepting it. A closed
Obsidian.app is the only case observed to exit 1, with its message on stderr,
so a failed run is reported from stderr rather than from whatever
success-shaped text it printed on stdout.

The rule binds the obw module, which runs the CLI through `$.process.run` and
draws the result. The skills, where the model reads the output itself, are out
of scope.

A deny-list keyed on `Error: ` is the violation this forbids: `Vault not found.`
already has no such prefix, and any new error text the CLI adds is drawn as if
it were a card, with nothing marking it wrong.

Bound by `claude plugin test obsidian-workspace`: `tests/cli-output.test.ts`
carries a case per shape for both readers, and `tests/issue.test.ts` carries
the pane cases that show a failed listing reaching the user instead of being
re-read as an empty one. It stays prose because no single command asserts this
entry alone — the runner also proves every unrelated case — and a grep cannot
tell a classification from any other conditional.
