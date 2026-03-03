---
name: diagram-beauty
description: Quick interactive diagram generator using beautiful-mermaid (SVG output, no Puppeteer needed)
---

# Quick Diagram Generator (beautiful-mermaid)

Interactive command to quickly generate and display Mermaid diagrams using `beautiful-mermaid` for fast, server-side SVG rendering — no browser or Puppeteer required.

## Workflow

### Step 1: Ask User What They Want

Use AskUserQuestion to gather diagram requirements:

**Question 1: Diagram Type**
```json
{
  "questions": [
    {
      "question": "What type of diagram would you like to create?",
      "header": "Diagram Type",
      "multiSelect": false,
      "options": [
        {"label": "Flowchart", "description": "Process flows, decision trees, algorithms"},
        {"label": "Sequence Diagram", "description": "API interactions, communications, time-based flows"},
        {"label": "Class Diagram", "description": "Object-oriented design, data models"},
        {"label": "State Diagram", "description": "State machines, workflow states, transitions"},
        {"label": "ER Diagram", "description": "Database schemas, entity relationships"}
      ]
    }
  ]
}
```

> **Note**: Gantt, Pie, and Mindmap are NOT supported by beautiful-mermaid. If the user selects "Other" and requests one of these, inform them and suggest using the standard `/diagram` command instead.

**Question 2: Diagram Content**
Ask the user to describe what the diagram should show — components, actors, relationships, flows.

### Step 2: Generate Mermaid Code

Based on user input:
1. Choose appropriate diagram syntax from `../skills/mermaid-display/references/diagram-types.md`
2. Generate clean, well-structured Mermaid code
3. Use descriptive labels (<30 characters), meaningful node IDs (no spaces)
4. Keep focused: 5-15 nodes optimal

### Step 3: Render and Open

1. Use the Write tool to save Mermaid code to `/tmp/diagram-{timestamp}.mmd`
2. Ensure dependencies are installed:
   ```bash
   [ -d "${CLAUDE_PLUGIN_ROOT}/node_modules/beautiful-mermaid" ] || (cd "${CLAUDE_PLUGIN_ROOT}" && bun install)
   ```
3. Render using beautiful-mermaid:
   ```bash
   bun run "${CLAUDE_PLUGIN_ROOT}/lib/render-beauty.ts" "/tmp/diagram-{timestamp}.mmd"
   ```
4. The script handles theme resolution, SVG rendering, and opening in viewer

### Step 4: Inform User

```
I've created your [diagram type] and opened it in your default viewer.

[Brief description of what the diagram shows]

File saved to: /tmp/mermaid-diagram-{timestamp}.svg
```

## Handling Complex Requirements

If the description is too complex for a single diagram, suggest splitting:

```
Your description covers multiple aspects. I suggest separate diagrams for:
1. High-level architecture (Flowchart)
2. Authentication flow (Sequence Diagram)
3. Data model (ER Diagram)

Which one first?
```

## Differences from `/diagram`

| Feature | `/diagram` | `/diagram-beauty` |
|---------|-----------|-------------------|
| Renderer | mmdc / npx mermaid-cli | beautiful-mermaid |
| Output | PNG or SVG | SVG only |
| Themes | 8 schemes | 15 schemes |
| Requires | Node.js + Puppeteer | Bun only |
| Diagram types | All (incl. Gantt, Pie) | Flowchart, Sequence, Class, State, ER, XY |
| Speed | ~300ms (cached) | Synchronous, near-instant |

## Configuration

Uses the same environment variables as mermaid-display:
```bash
export MERMAID_COLOR_SCHEME=tokyo-night  # see ../skills/mermaid-display/references/color-schemes.md
```

Additional themes available only in beauty variant:
`zinc-light`, `zinc-dark`, `tokyo-night-storm`, `tokyo-night-light`, `nord-light`, `github-light`, `github-dark`, `solarized-light`, `one-dark`

## Error Handling

- **No Bun**: Inform user to install Bun (`curl -fsSL https://bun.sh/install | bash`)
- **Unsupported diagram type**: Suggest using `/diagram` for Gantt, Pie, Mindmap
- **Unclear description**: Ask for components, actions, and decision points
- **Invalid type from "Other"**: Map to closest supported type

## References

- **Color schemes**: `../skills/mermaid-display/references/color-schemes.md`
- **Diagram type syntax**: `../skills/mermaid-display/references/diagram-types.md`
