---
name: mermaid-display-beauty
description: >-
  Activated when the user asks to visualize, diagram, chart, or draw system architecture,
  data flows, process workflows, sequence diagrams, class diagrams, state machines, or ER diagrams
  using beautiful-mermaid. Renders Mermaid syntax to SVG synchronously via Bun — no browser or Puppeteer needed.
  Preferred when user wants SVG output, faster rendering, or when mmdc/npx is unavailable.
---

# Mermaid Diagram Display (beautiful-mermaid)

Render Mermaid diagrams as SVG images using `beautiful-mermaid` for fast, server-side rendering.

## When to Use

Use when:
- User requests visual diagrams (flowcharts, sequence, architecture, etc.)
- Complex relationships are better shown graphically
- User prefers SVG output over PNG
- User wants faster rendering without Puppeteer
- `mmdc` or `npx` is unavailable but Bun is installed
- User explicitly asks for "beautiful-mermaid" or "beauty" rendering

Do NOT use when:
- Simple text descriptions are sufficient
- User explicitly prefers text-only output
- Diagram would be trivial (2-3 nodes with obvious relationships)
- **User needs Gantt charts, pie charts, or mindmap diagrams** (use `mermaid-display` instead)

## Supported Diagram Types

- Flowchart / Graph
- Sequence Diagram
- Class Diagram
- State Diagram
- ER Diagram
- XY Chart

**NOT supported**: Gantt, Pie, Mindmap — redirect to `mermaid-display` skill for these.

## Prerequisites

- **Bun** must be installed (`curl -fsSL https://bun.sh/install | bash`)
- Dependencies auto-install on first use

## Workflow

### Step 1: Generate Mermaid Code

Based on user requirements, create valid Mermaid syntax. Choose the appropriate diagram type from `../mermaid-display/references/diagram-types.md`.

### Step 2: Save to Temporary File

Use the Write tool to create `/tmp/mermaid-diagram-{unix-timestamp}.mmd` with the Mermaid code. Use `date +%s` in Bash to get the timestamp.

### Step 3: Ensure Dependencies

```bash
[ -d "${CLAUDE_PLUGIN_ROOT}/node_modules/beautiful-mermaid" ] || (cd "${CLAUDE_PLUGIN_ROOT}" && bun install)
```

### Step 4: Render and Open

Run the render script via Bash:

```bash
bun run "${CLAUDE_PLUGIN_ROOT}/lib/render-beauty.ts" "/tmp/mermaid-diagram-{timestamp}.mmd"
```

The script handles:
- Theme resolution from `$MERMAID_COLOR_SCHEME` env var (15 built-in themes)
- Synchronous SVG rendering via beautiful-mermaid
- Writing SVG to `/tmp/mermaid-diagram-{timestamp}.svg`
- Opening in the platform-appropriate viewer (macOS: `open`, Linux: `xdg-open`)

### Step 5: Inform User

Report what was created and the file path:

```
I've generated and opened the [diagram type] using the [color-scheme] theme (beautiful-mermaid SVG).
Diagram saved to: /tmp/mermaid-diagram-{timestamp}.svg
```

## Configuration

**Environment variables**:
```bash
export MERMAID_COLOR_SCHEME=tokyo-night
```

15 built-in themes: `zinc-light`, `zinc-dark`, `tokyo-night`, `tokyo-night-storm`, `tokyo-night-light`, `catppuccin-mocha`, `catppuccin-latte`, `nord`, `nord-light`, `dracula`, `github-light`, `github-dark`, `solarized-light`, `solarized-dark`, `one-dark`

For custom colors:
```bash
export MERMAID_COLOR_SCHEME=custom
export MERMAID_PRIMARY_COLOR=#1a1b26
export MERMAID_TEXT_COLOR=#a9b1d6
```

## Error Handling

| Issue | Solution |
|-------|----------|
| No Bun | Install Bun: `curl -fsSL https://bun.sh/install \| bash` |
| Unsupported diagram type | Use `mermaid-display` skill for Gantt, Pie, Mindmap |
| Invalid syntax | Check syntax, suggest testing at https://mermaid.live |
| Theme not applied | Verify `echo $MERMAID_COLOR_SCHEME` |

## References

- **Color schemes**: `../mermaid-display/references/color-schemes.md`
- **Diagram type syntax**: `../mermaid-display/references/diagram-types.md`
- **Mermaid docs**: https://mermaid.js.org/
- **beautiful-mermaid**: https://github.com/nicholasgasior/beautiful-mermaid
