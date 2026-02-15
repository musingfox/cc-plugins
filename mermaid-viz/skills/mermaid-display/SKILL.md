---
name: mermaid-display
description: >-
  Activated when the user asks to visualize, diagram, chart, or draw system architecture,
  data flows, process workflows, sequence diagrams, class diagrams, state machines, ER diagrams,
  or any relationships better shown graphically. Renders Mermaid syntax to PNG/SVG via mmdc or npx.
---

# Mermaid Diagram Display

Render Mermaid diagrams as PNG or SVG images that open in the default viewer.

## When to Use

Use when:
- User requests visual diagrams (flowcharts, sequence, architecture, etc.)
- Complex relationships are better shown graphically
- Creating documentation with visual aids

Do NOT use when:
- Simple text descriptions are sufficient
- User explicitly prefers text-only output
- Diagram would be trivial (2-3 nodes with obvious relationships)

## Prerequisites

**No installation required** — uses mermaid-cli via `npx` automatically.

Tool selection priority:
1. `mmdc` (if globally installed) — fastest
2. `npx -y @mermaid-js/mermaid-cli` (fallback) — universal

## Workflow

### Step 1: Generate Mermaid Code

Based on user requirements, create valid Mermaid syntax. Choose the appropriate diagram type from `references/diagram-types.md`.

### Step 2: Save to Temporary File

Use the Write tool to create `/tmp/mermaid-diagram-{unix-timestamp}.mmd` with the Mermaid code. Use `date +%s` in Bash to get the timestamp.

### Step 3: Render and Open

Use Bash to run the render script from `references/render-script.sh`. The script handles:
- Tool detection (mmdc vs npx)
- Theme configuration from `$MERMAID_COLOR_SCHEME` env var
- Rendering to PNG/SVG based on `$MERMAID_OUTPUT_FORMAT` env var
- Opening in the platform-appropriate viewer (macOS: `open`, Linux: `xdg-open`)
- Cleanup of temporary config files

Set `INPUT_FILE` to the path from Step 2 before running, e.g.:

```bash
INPUT_FILE="/tmp/mermaid-diagram-1706382451.mmd" bash references/render-script.sh
```

Or inline the script content from `references/render-script.sh` in the Bash tool call.

### Step 4: Inform User

Report what was created and the file path:

```
I've generated and opened the [diagram type] using the [color-scheme] theme.
Diagram saved to: /tmp/mermaid-diagram-{timestamp}.{format}
```

## Configuration

**Environment variables** (only 2):
```bash
export MERMAID_OUTPUT_FORMAT=png   # or svg
export MERMAID_COLOR_SCHEME=tokyo-night
```

For custom colors:
```bash
export MERMAID_COLOR_SCHEME=custom
export MERMAID_PRIMARY_COLOR=#7aa2f7
export MERMAID_SECONDARY_COLOR=#bb9af7
export MERMAID_TEXT_COLOR=#c0caf5
```

See `references/color-schemes.md` for all 8 built-in schemes + custom option.

## Error Handling

| Issue | Solution |
|-------|----------|
| No renderer | Install Node.js: `brew install node` |
| Slow first run | Normal — npx downloads mermaid-cli (~100MB) once, cached after |
| Invalid syntax | Check syntax, suggest testing at https://mermaid.live |
| Theme not applied | Verify `echo $MERMAID_COLOR_SCHEME`, use mermaid-theme skill |
| Complex diagram unreadable | Split into multiple smaller diagrams |

## References

- **Color schemes**: `references/color-schemes.md`
- **Render script**: `references/render-script.sh`
- **Diagram type syntax**: `references/diagram-types.md`
- **Mermaid docs**: https://mermaid.js.org/
- **Live editor**: https://mermaid.live
