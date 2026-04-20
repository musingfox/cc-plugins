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

## References

- **Diagram type syntax**: `references/diagram-types.md`
- **Mermaid docs**: https://mermaid.js.org/
- **Live editor**: https://mermaid.live
