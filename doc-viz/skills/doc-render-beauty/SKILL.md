---
name: doc-render-beauty
description: >-
  Render markdown content or files as formatted HTML in the browser with
  pre-rendered Mermaid SVG diagrams using beautiful-mermaid. Triggers when
  user asks to view, render, or preview a document as HTML with server-side
  diagram rendering, or when presenting content with diagrams that need
  fast, Puppeteer-free rendering. Also triggers proactively when about to
  render a table with 4+ rows or 3+ columns, structured comparisons, or
  output exceeding 50 lines of formatted content.
---

# Document Render Skill (beautiful-mermaid)

Automatically render markdown documents as beautifully formatted HTML pages with syntax highlighting, math formulas, scroll animations, and **pre-rendered Mermaid SVG diagrams** — no browser-side Mermaid.js needed. Features sticky TOC navigation, zoom/pan diagram controls, enhanced tables, and collapsible code blocks.

## When to Use

- User asks to "view as HTML", "render in browser", "preview as a web page", or "open in browser"
- Content contains Mermaid diagrams and user wants fast, server-side rendering
- User explicitly asks for "beautiful-mermaid" or "beauty" variant
- User prefers SVG diagram output over browser-rendered Mermaid
- Content contains complex tables, math formulas, or diagrams that render poorly in terminal
- Presenting plans, specs, or documentation for review where visual formatting matters

## When NOT to Use

- Short content (under 20 lines) that renders fine in the terminal
- User explicitly wants terminal/text output
- `/view-doc-beauty` command was already invoked in this interaction
- User is asking to edit or modify the content, not view it
- Content is not markdown or structured text
- **Document contains Gantt, Pie, or Mindmap diagrams** (use `doc-render` skill instead — those types are not supported by beautiful-mermaid)

## Supported Mermaid Diagram Types

- Flowchart / Graph
- Sequence Diagram
- Class Diagram
- State Diagram
- ER Diagram
- XY Chart

**NOT supported**: Gantt, Pie, Mindmap — redirect to `doc-render` skill for these.

## Workflow

1. **Determine source**: Either read a file path the user specified, or capture inline content from the conversation
2. **Pre-render mermaid blocks** using beautiful-mermaid:
   ```bash
   [ -d "${CLAUDE_PLUGIN_ROOT}/node_modules/beautiful-mermaid" ] || (cd "${CLAUDE_PLUGIN_ROOT}" && bun install)
   MERMAID_COLOR_SCHEME="${MERMAID_COLOR_SCHEME:-tokyo-night}" \
     bun run "${CLAUDE_PLUGIN_ROOT}/lib/render-beauty.ts" "$DOC_FILE" > /tmp/doc-processed.md
   ```
3. **Read processed markdown** from `/tmp/doc-processed.md`
4. **Base64 encode** the processed content using Python:
   ```python
   import base64
   content_base64 = base64.b64encode(content.encode('utf-8')).decode('ascii')
   ```
5. **Write HTML** to `/tmp/doc-{name}-{timestamp}.html` using the beauty HTML template from `/view-doc-beauty`:
   - marked.js for markdown rendering
   - DOMPurify for XSS protection (with SVG tags/attributes allowed)
   - highlight.js for syntax highlighting
   - KaTeX for math formulas (`$...$` inline, `$$...$$` block)
   - AOS for scroll animations
   - CSS page-load fade-in animation
   - Dark mode auto-detection
   - **NO mermaid.js** — diagrams are pre-rendered as inline SVGs
6. **Open** in browser using `open` command
7. **Report** the file path to the user

## HTML Template Reference

Use the exact same HTML template defined in the `/view-doc-beauty` command (`doc-viz/commands/view-doc-beauty.md`, Step 5). This ensures consistent rendering between the command and skill.
