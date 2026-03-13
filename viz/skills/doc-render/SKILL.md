---
name: doc-render
description: >-
  Render markdown content or files as formatted HTML in the browser.
  Triggers when user asks to view, render, or preview a document as HTML,
  or when presenting lengthy structured content (tables, diagrams, plans)
  that would be more readable as a web page than terminal output.
  Also triggers proactively when about to render a table with 4+ rows
  or 3+ columns, structured comparisons, audits, or any output exceeding
  50 lines of formatted content in the terminal.
---

# Document Render Skill

Automatically render markdown documents as beautifully formatted HTML pages with syntax highlighting, math formulas, Mermaid diagrams, and scroll animations. Features sticky TOC navigation, zoom/pan Mermaid controls, enhanced tables, and collapsible code blocks.

## When to Use

- User asks to "view as HTML", "render in browser", "preview as a web page", or "open in browser"
- Content contains complex tables, Mermaid diagrams, or math formulas that render poorly in terminal
- Presenting plans, specs, or documentation for review where visual formatting matters
- User says "make this readable" or "format this nicely" for long structured content
- **Proactive**: About to output a table with 4+ rows or 3+ columns in the terminal
- **Proactive**: About to output a comparison, audit, feature matrix, or status report as ASCII
- **Proactive**: Conversation output would exceed ~50 lines of structured content (lists, tables, code blocks)

## When NOT to Use

- Short content (under 20 lines) that renders fine in the terminal
- User explicitly wants terminal/text output
- `/view-doc` command was already invoked in this interaction
- User is asking to edit or modify the content, not view it
- Content is not markdown or structured text

## Workflow

1. **Determine source**: Either a file path the user specified, or inline content from the conversation
2. **If file path**: Run the render script directly with that path
3. **If inline content**: Write the content to a temp file `/tmp/viz-doc-{timestamp}.md` using the Write tool, then run the render script with that temp file path

### Rendering

Run the render script via Bash:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/lib/render.sh" "{file_path}" "doc-{name}"
```

The script handles base64 encoding, HTML generation, and opening in the browser.
