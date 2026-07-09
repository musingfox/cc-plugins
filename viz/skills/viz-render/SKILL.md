---
name: viz-render
description: >-
  Render markdown or Mermaid content as formatted HTML in the browser.
  Triggers when the user asks to view, render, or preview a document as HTML;
  when the user asks to visualize, diagram, chart, or draw architecture,
  flows, sequence/class/state/ER diagrams; when resolving plan files from
  ~/.claude/plans/; or proactively when about to output a table with 4+ rows
  or 3+ columns, a structured comparison, an audit, a feature matrix, or any
  formatted content exceeding ~50 lines in the terminal.
---

# Viz Render Skill

Render markdown documents, Mermaid diagrams, or plan files as formatted HTML
with syntax highlighting, math formulas, Mermaid, scroll animations, and dark
mode. One skill, one script, three input shapes.

## When to Use

- User asks to "view as HTML", "render in browser", "preview as a web page"
- User asks for a diagram (flowchart, sequence, architecture, ER, state, …)
- User references a plan by name (resolve from `~/.claude/plans/`)
- Content contains complex tables, Mermaid, or math formulas
- **Proactive**: terminal output would contain a table with 4+ rows or 3+ columns
- **Proactive**: comparison, audit, feature matrix, or status report as ASCII
- **Proactive**: conversation output would exceed ~50 lines of structured content

## When NOT to Use

- Short content (<20 lines) that renders fine in terminal
- User explicitly wants terminal/text output
- User is asking to edit or modify the content, not view it
- Simple diagrams (2–3 nodes with obvious relationships)

## Input Shapes → Workflow

### Shape A: file path

User gave an absolute/relative path to a markdown file.

```bash
bash "${CLAUDE_PLUGIN_ROOT}/lib/render.sh" "{file_path}" "doc-{name}"
```

### Shape B: plan name (bare name, no path separator, no `.md`)

List available plans or resolve by name against `~/.claude/plans/`:

```bash
INPUT="$ARGUMENTS"
PLANS_DIR="$HOME/.claude/plans"

if [ -z "$INPUT" ]; then
    echo "Available plans in $PLANS_DIR:"
    ls -t "$PLANS_DIR"/*.md 2>/dev/null | head -20 | xargs -n1 basename | sed 's/\.md$//' | sed 's/^/  - /'
elif [ -f "$INPUT" ]; then
    DOC_FILE="$INPUT"; DOC_NAME=$(basename "$DOC_FILE" .md)
    bash "${CLAUDE_PLUGIN_ROOT}/lib/render.sh" "$DOC_FILE" "doc-$DOC_NAME"
else
    DOC_FILE="$PLANS_DIR/$INPUT.md"
    [ -f "$DOC_FILE" ] && bash "${CLAUDE_PLUGIN_ROOT}/lib/render.sh" "$DOC_FILE" "doc-$INPUT" \
      || { echo "Plan not found: $INPUT.md"; ls -t "$PLANS_DIR"/*.md 2>/dev/null | head -10 | xargs -n1 basename | sed 's/\.md$//' | sed 's/^/  - /'; }
fi
```

### Shape C: inline content or Mermaid code

Write the content (or Mermaid wrapped in a ```` ```mermaid ```` fence) to a
temp markdown file, then render.

For inline markdown, write to `/tmp/viz-doc-{timestamp}.md`.

For bare Mermaid code, wrap as:

````markdown
# {Diagram Title}

```mermaid
{mermaid code}
```
````

…write to `/tmp/viz-diagram-{name}.md`, then:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/lib/render.sh" "/tmp/viz-diagram-{name}.md" "diagram-{name}"
```

## Generating Mermaid From Scratch

When the user requests a diagram without providing the code:

1. Pick a diagram type (see `references/diagram-types.md` for syntax)
2. Keep it focused: 5–15 nodes, descriptive labels <30 chars, no-space IDs
3. If requirements are too broad, suggest splitting into multiple diagrams

## Output

The render script prints the output HTML path (under `/tmp/viz/{project}/`)
and opens it in the default browser. Report the path to the user.

## Recipes (interactive HTML artifacts)

If the markdown file starts with frontmatter `viz: <recipe>`, the render
script swaps the generic viewer for a recipe-specific interactive template.
Recipes treat markdown as the canonical source: the HTML reads from it on
load and exports a roundtrippable markdown back to the clipboard on Export.

Use a recipe when the user wants an output they will iterate on (mark items
as done/wontfix, filter, edit fields), not just read.

Available recipes:

- **pr-review** — severity-grouped finding cards with status badges,
  inline-editable metadata, and severity filters. See
  `references/recipes/pr-review.md` for the markdown structure spec.

Workflow:

1. Author the markdown with the recipe's frontmatter and structure.
2. `bash "${CLAUDE_PLUGIN_ROOT}/lib/render.sh" <file.md> <output-name>`
3. User edits in HTML → clicks Export → updated markdown is on clipboard.
4. User pastes back to chat → agent overwrites the source `.md` → re-render.

Markdown without `viz:` frontmatter falls through to the generic viewer
unchanged.

The recipe Save endpoint listens on port `18090` by default. If that port is
held by another process, render.sh auto-selects the next free port (trying
up to 5 candidates) so the recipe still opens over `http://` — no manual
override needed. Set `VIZ_PORT=<port>` only to pin a specific base port.

## Recipe Round-trip Monitoring

A recipe's "儲存" button writes the edited markdown back to the source `.md`
via the viz server (`/api/save`), but **nothing wakes you to read it** — the
user otherwise has to come back to chat and tell you, or click 複製 and paste.
To close the loop automatically, arm a `Monitor` on the source file right
after rendering: the user edits, clicks 儲存, the file's mtime changes, and
the Monitor wakes you to read it back — no copy-paste, no "I'm done" ping.

**Prerequisite**: the recipe must open on `http://127.0.0.1:<port>/...` (the
URL render.sh prints). If render.sh fell back to `file://` (server
unavailable — all candidate ports held), the 儲存 button is hidden and
monitoring is useless; tell the user to use 複製/Export instead.

After a successful recipe render, note the absolute source path (the path
you passed to render.sh — for plan-name inputs it is
`~/.claude/plans/<name>.md`), then arm the Monitor:

```
Monitor:
  description: recipe edits on <source-path>
  timeout_ms: 300000
  command: |
    f="<source-path>"; prev=$(stat -f %m "$f" 2>/dev/null || echo 0); idle=0
    while true; do
      sleep 1
      cur=$(stat -f %m "$f" 2>/dev/null || echo 0)
      if [ "$cur" != "$prev" ]; then
        echo "recipe-saved: $f mtime=$cur"; prev="$cur"; idle=0
      else
        idle=$((idle + 1))
        [ "$idle" -ge 120 ] && { echo "recipe-watch-idle: $f — say resume-watch to restart"; exit 0; }
      fi
    done
```

- **`recipe-saved` event**: `Read` the source file, diff against what you
  last knew, and report the updated content to the user. They need not type
  anything.
- **`recipe-watch-idle` (120s no change) or Monitor timeout (300s)**: tell
  the user monitoring stopped. **Restart** = re-arm the same Monitor on the
  same source path, on an explicit "resume watch" from the user. Do not
  auto-restart indefinitely — idle usually means they stopped editing.

`stat -f %m` is macOS; viz targets macOS (`open`, `stat -f`).

## References

- **Diagram type syntax**: `references/diagram-types.md`
- **Recipe specs**: `references/recipes/`
- **Mermaid docs**: https://mermaid.js.org/
- **Live editor**: https://mermaid.live
