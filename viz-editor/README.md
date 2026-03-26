# viz-editor

A Model Context Protocol (MCP) server that provides an `edit-document` tool for visually editing markdown documents in the browser with live preview.

## Features

- **Split-pane editor**: Edit markdown on the left, see live preview on the right
- **Real-time preview**: Renders markdown with syntax highlighting, math, diagrams
- **Mermaid diagrams**: Interactive zoom/pan controls for diagrams
- **Math support**: KaTeX rendering for inline (`$...$`) and block (`$$...$$`) math
- **Code blocks**: Syntax highlighting with copy buttons
- **Dark mode**: Automatically detects system preference
- **UTF-8 safe**: Base64 encoding ensures multi-byte characters (Chinese, etc.) work correctly

## Installation

```bash
npm install
npm run build
```

## Usage

### As MCP Server

Configure in your MCP client:

```json
{
  "mcpServers": {
    "viz-editor": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/absolute/path/to/viz-editor"
    }
  }
}
```

### Tool: `edit-document`

**Input schema:**
```typescript
{
  content: string;     // The markdown content to edit
  title?: string;      // Optional document title (default: "Edit Document")
}
```

**Behavior:**
1. Opens a browser window with the markdown editor
2. User edits the content and sees live preview
3. User clicks "Done — Send back to AI"
4. Tool returns the edited content

**Output:**
```typescript
{
  content: [{ type: 'text', text: editedMarkdown }]
}
```

**Example:**
```javascript
const result = await callTool('edit-document', {
  content: '# Hello\n\nEdit me!',
  title: 'My Document'
});
// User edits in browser, clicks Done
console.log(result.content[0].text); // Edited markdown
```

## Testing

Run the test suite:

```bash
node test.mjs
```

Tests verify:
- Base64 UTF-8 encoding (Chinese and English text)
- HTTP server lifecycle (dynamic port allocation, POST /done)
- HTML template rendering
- MCP server tool registration

## Architecture

### Server (`src/index.ts`)
- MCP server exposing `edit-document` tool
- HTTP server lifecycle management
- Base64 UTF-8 encoding for content injection
- Browser spawning via `open` command

### Client (`client/`)
- Single-file HTML bundle (built with Vite)
- Rendering pipeline: marked → DOMPurify → KaTeX → Mermaid → highlight.js
- Split-pane editor with live preview
- POST to `/done` endpoint when user clicks Done

## Dependencies

**Runtime:**
- `@modelcontextprotocol/sdk` - MCP server framework
- `zod` - Schema validation

**Client (bundled):**
- `marked` - Markdown parser
- `dompurify` - HTML sanitization
- `mermaid` - Diagram rendering
- `katex` - Math rendering
- `highlight.js` - Code syntax highlighting

**Build:**
- `vite` - Bundler (single-file output)
- `vite-plugin-singlefile` - Inline all assets
- `typescript` - Type checking

## License

MIT
