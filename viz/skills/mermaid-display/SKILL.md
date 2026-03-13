---
name: mermaid-display
description: >-
  Display Mermaid diagrams as interactive HTML pages. Activated when the user asks to
  visualize, diagram, chart, or draw system architecture, data flows, process workflows,
  sequence diagrams, class diagrams, state machines, ER diagrams, or any relationships
  better shown graphically. Renders as HTML by default; PNG/SVG only when explicitly requested.
---

# Mermaid Diagram Display

Render Mermaid diagrams as interactive HTML pages with zoom/pan controls, dark mode, and responsive layout.

## When to Use

Use when:
- User requests visual diagrams (flowcharts, sequence, architecture, etc.)
- Complex relationships are better shown graphically
- Creating documentation with visual aids

Do NOT use when:
- Simple text descriptions are sufficient
- User explicitly prefers text-only output
- Diagram would be trivial (2-3 nodes with obvious relationships)

## Workflow

### Step 1: Generate Mermaid Code

Based on user requirements, create valid Mermaid syntax. Choose the appropriate diagram type from `references/diagram-types.md`.

### Step 2: Write Temp Markdown and Spawn Renderer

Wrap the Mermaid code as a markdown document:

```
# {Diagram Title}

```mermaid
{mermaid code}
`` `
```

Write this markdown content to a temp file `/tmp/diagram-{name}.md` using the Write tool.

Then run the render script via Bash:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/lib/render.sh" "/tmp/diagram-{name}.md" "diagram-{name}"
```

### Step 3: Inform User

Report what was created and the file path:
```
I've generated and opened the [diagram type].
Diagram saved to: /tmp/diagram-{name}-{timestamp}.html
```

## Explicit Image Output (PNG/SVG)

Only when the user **explicitly asks** for a PNG or SVG file:

1. Save Mermaid code to `/tmp/mermaid-diagram-{timestamp}.mmd`
2. Run `references/render-script.sh` with `INPUT_FILE` set to the .mmd path:
   ```bash
   INPUT_FILE="/tmp/mermaid-diagram-{timestamp}.mmd" bash references/render-script.sh
   ```
3. The script handles tool detection, theme config, rendering, and opening

## Configuration

Theme configuration for HTML output uses browser-side Mermaid.js with system dark mode auto-detection.

For PNG/SVG output, environment variables apply:
```bash
export MERMAID_OUTPUT_FORMAT=png   # or svg
export MERMAID_COLOR_SCHEME=tokyo-night
```

See `../mermaid-theme/references/color-schemes.md` for all 8 built-in schemes + custom option.

## Error Handling

| Issue | Solution |
|-------|----------|
| No renderer (PNG/SVG only) | Install Node.js: `brew install node` |
| Invalid syntax | Check syntax, suggest testing at https://mermaid.live |
| Complex diagram unreadable | Split into multiple smaller diagrams |

## References

- **Diagram type syntax**: `references/diagram-types.md`
- **Render script (PNG/SVG)**: `references/render-script.sh`
- **Color schemes**: `../mermaid-theme/references/color-schemes.md`
- **Mermaid docs**: https://mermaid.js.org/
- **Live editor**: https://mermaid.live
