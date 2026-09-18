---
id: mod-ui-text-within-element-bounds
status: proposed
scope:
  - "obsidian-workspace/hooks/**"
verify: null
related: [obsidian-cli-output-classified-positively]
source: obw-issue-pane
adr: null
---
A Claude Mod checks every string it hands to a `Markdown` or `Text` element
before drawing it: at most 10000 characters, and no control characters other
than tab and newline. Text from outside the module, such as a CLI's stdout or a
file's contents, is the case this is for: strip the other control characters
and clip an overlong string with a visible notice. The bound comes from the
Claude Code 2.1.276 type definitions: `MarkdownProps` states it, and the
`CodeProps` doc comment bounds a `Text` string "the same way".

Strings the module writes itself and knows are short are in scope but need no
check. Where it applies, the check belongs in the module and not in a test,
because the input only shows up at run time.

The engine does not report a tree that breaks these bounds. In the `ui.render`
doc comment's words, a tree that does not validate "draws the engine's own".
The whole pane is replaced by the default drawing, and only a `--plugin-dir`
session is told why, so an installed plugin just looks empty or broken.

Born prose: the bound is on run-time data. Bind it to a `claude plugin test`
case per module that feeds an 11000-character and a `\r`-bearing string
through the render path and asserts on the drawn strings. The test kit draws a
`\r` rather than falling back to the engine's drawing, so a test that waits for
the fallback passes with no check in the module. `omp-quota/hooks/**` is the next scope to add: it draws
provider names from `omp usage --json` into `Text` unchecked
(`omp-quota/hooks/register.ts:106`), so it joins once that path is audited.
