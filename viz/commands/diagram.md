---
description: Quick interactive diagram generator - ask user what they want, generate Mermaid, and render as HTML
argument-hint: "[description]"
allowed-tools: ["Bash", "Write", "AskUserQuestion"]
---

# Quick Diagram Generator

Interactive command to generate Mermaid diagrams and render them as HTML pages.

## Workflow

### Step 1: Determine Diagram Requirements

If the user provided a description via argument, skip to Step 2.

Otherwise, use AskUserQuestion to gather requirements:

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
        {"label": "ER Diagram", "description": "Database schemas, entity relationships"},
        {"label": "Gantt Chart", "description": "Project timelines, task scheduling"},
        {"label": "Pie Chart", "description": "Data distribution, proportions"}
      ]
    }
  ]
}
```

**Question 2: Diagram Content**
Ask the user to describe what the diagram should show -- components, actors, relationships, flows.

### Step 2: Generate Mermaid Code

Based on user input:
1. Choose appropriate diagram syntax from `../skills/mermaid-display/references/diagram-types.md`
2. Generate clean, well-structured Mermaid code
3. Use descriptive labels (<30 characters), meaningful node IDs (no spaces)
4. Keep focused: 5-15 nodes optimal

### Step 3: Write Temp Markdown and Spawn Renderer

Wrap the generated Mermaid code as a markdown document:

```
# {Diagram Title}

```mermaid
{generated mermaid code}
`` `
```

Write this markdown content to a temp file `/tmp/diagram-{name}.md` using the Write tool.

Then run the render script via Bash:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/lib/render.sh" "/tmp/diagram-{name}.md" "diagram-{name}"
```

### Step 4: Inform User

```
I've created your [diagram type] and opened it in your browser.

[Brief description of what the diagram shows]

File saved to: /tmp/diagram-{name}-{timestamp}.html
```

## Handling Explicit Image Requests

If the user explicitly asks for a PNG or SVG file (not HTML), use the render script instead:

1. Save Mermaid code to `/tmp/diagram-{timestamp}.mmd`
2. Run `../skills/mermaid-display/references/render-script.sh` with `INPUT_FILE` set to the .mmd path
3. This produces a PNG/SVG file and opens it in the default image viewer

## Handling Complex Requirements

If the description is too complex for a single diagram, suggest splitting:

```
Your description covers multiple aspects. I suggest separate diagrams for:
1. High-level architecture (Flowchart)
2. Authentication flow (Sequence Diagram)
3. Data model (ER Diagram)

Which one first?
```

## References

- **Diagram type syntax**: `../skills/mermaid-display/references/diagram-types.md`
- **Color schemes**: `../skills/mermaid-theme/references/color-schemes.md`
- **Render script (PNG/SVG only)**: `../skills/mermaid-display/references/render-script.sh`
