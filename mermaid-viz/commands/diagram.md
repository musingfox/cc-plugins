---
name: diagram
description: Quick interactive diagram generator - ask user what they want, generate Mermaid, and display the image
---

# Quick Diagram Generator

Interactive command to quickly generate and display Mermaid diagrams.

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

**Question 2: Diagram Content**
Ask the user to describe what the diagram should show — components, actors, relationships, flows.

### Step 2: Generate Mermaid Code

Based on user input:
1. Choose appropriate diagram syntax from `references/diagram-types.md`
2. Generate clean, well-structured Mermaid code
3. Use descriptive labels (<30 characters), meaningful node IDs (no spaces)
4. Keep focused: 5-15 nodes optimal

### Step 3: Render and Open

1. Use the Write tool to save Mermaid code to `/tmp/diagram-{timestamp}.mmd`
2. Run the render script from `references/render-script.sh` via Bash tool (set `INPUT_FILE` to the .mmd path)
3. The script handles tool detection, theme config, rendering, and opening in viewer

### Step 4: Inform User

```
I've created your [diagram type] and opened it in your default image viewer.

[Brief description of what the diagram shows]

File saved to: /tmp/diagram-{timestamp}.{format}
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

## Configuration

Uses the same environment variables as mermaid-display:
```bash
export MERMAID_OUTPUT_FORMAT=png       # or svg
export MERMAID_COLOR_SCHEME=tokyo-night  # see references/color-schemes.md
```

## Error Handling

- **No renderer**: Inform user to install Node.js (`brew install node`)
- **Unclear description**: Ask for components, actions, and decision points
- **Invalid type from "Other"**: Map to closest supported type

## References

- **Color schemes**: `references/color-schemes.md`
- **Render script**: `references/render-script.sh`
- **Diagram type syntax**: `references/diagram-types.md`
