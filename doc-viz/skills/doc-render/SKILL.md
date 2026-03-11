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

1. **Determine source**: Either read a file path the user specified, or capture inline content from the conversation
2. **Base64 encode** the content using Python:
   ```python
   import base64
   content_base64 = base64.b64encode(content.encode('utf-8')).decode('ascii')
   ```
3. **Write HTML** to `/tmp/doc-{name}-{timestamp}.html` using the same enhanced HTML template as `/view-doc`:
   - marked.js for markdown rendering
   - DOMPurify for XSS protection (sanitize ALL HTML before DOM insertion)
   - highlight.js for syntax highlighting
   - KaTeX for math formulas (`$...$` inline, `$$...$$` block)
   - Mermaid for diagrams
   - AOS for scroll animations
   - CSS page-load fade-in animation
   - Dark mode auto-detection
4. **Open** in browser using `open` command
5. **Report** the file path to the user

## HTML Template Reference

Use the exact same HTML template defined in the `/view-doc` command (`doc-viz/commands/view-doc.md`, Step 4). This ensures consistent rendering between the command and skill.
