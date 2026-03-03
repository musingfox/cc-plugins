---
description: Render a document as formatted HTML with pre-rendered Mermaid SVGs (beautiful-mermaid)
argument-hint: "[file-path or plan-name]"
allowed-tools: ["Bash", "Read", "Write"]
---

# View Document Command (beautiful-mermaid)

Renders a markdown document as formatted HTML with syntax highlighting, math formulas, and **pre-rendered Mermaid SVG diagrams** (via beautiful-mermaid), then opens it in your browser.

Mermaid diagrams are rendered server-side before the HTML is generated — no browser-side Mermaid.js needed.

## Usage

- `/view-doc-beauty` - List available plans from `~/.claude/plans/` and show usage hint
- `/view-doc-beauty <plan-name>` - Open a plan file by name
- `/view-doc-beauty /path/to/file.md` - Open any markdown file by path

## Implementation

### Step 1: Resolve File Path

Use bash to determine the input file:

```bash
INPUT="$ARGUMENTS"
PLANS_DIR="$HOME/.claude/plans"

if [ -z "$INPUT" ]; then
    # No argument: list available plans and show usage
    echo "Available plans in $PLANS_DIR:"
    ls -t "$PLANS_DIR"/*.md 2>/dev/null | head -20 | xargs -n1 basename | sed 's/\.md$//' | sed 's/^/  - /'
    echo ""
    echo "Usage:"
    echo "  /view-doc-beauty <plan-name>       Open a plan file"
    echo "  /view-doc-beauty /path/to/file.md  Open any markdown file"
    exit 0
elif [ -f "$INPUT" ]; then
    # Direct file path exists
    DOC_FILE="$INPUT"
    DOC_NAME=$(basename "$DOC_FILE" .md)
elif echo "$INPUT" | grep -qE '[/~]|\.md$'; then
    # Looks like a path but doesn't exist
    # Expand ~ if present
    EXPANDED=$(eval echo "$INPUT")
    if [ -f "$EXPANDED" ]; then
        DOC_FILE="$EXPANDED"
        DOC_NAME=$(basename "$DOC_FILE" .md)
    else
        echo "File not found: $INPUT"
        exit 1
    fi
else
    # Bare name: try as plan file (backward compat)
    DOC_FILE="$PLANS_DIR/$INPUT.md"
    DOC_NAME="$INPUT"
    if [ ! -f "$DOC_FILE" ]; then
        echo "Plan file not found: $INPUT.md"
        echo ""
        echo "Available plans:"
        ls -t "$PLANS_DIR"/*.md 2>/dev/null | head -10 | xargs -n1 basename | sed 's/\.md$//' | sed 's/^/  - /'
        exit 1
    fi
fi

echo "Reading: $DOC_FILE"
```

### Step 2: Read Document Content

Use the **Read** tool to read the resolved `$DOC_FILE`.

### Step 3: Pre-render Mermaid Blocks

Use Bash to run beautiful-mermaid pre-rendering on the document. This replaces all ` ```mermaid ` code blocks with inline SVGs.

```bash
# Ensure beautiful-mermaid is installed
[ -d "${CLAUDE_PLUGIN_ROOT}/node_modules/beautiful-mermaid" ] || (cd "${CLAUDE_PLUGIN_ROOT}" && bun install)

# Pre-render mermaid blocks to inline SVGs
MERMAID_COLOR_SCHEME="${MERMAID_COLOR_SCHEME:-tokyo-night}" \
  bun run "${CLAUDE_PLUGIN_ROOT}/lib/render-beauty.ts" "$DOC_FILE" > /tmp/doc-processed.md
```

Then use the **Read** tool to read `/tmp/doc-processed.md` — this is the processed markdown with mermaid blocks replaced by SVG divs.

### Step 4: Generate HTML with Base64 Encoding

Use Python to encode the **processed** document content and generate HTML:

```python
import base64

# Document content from Read tool (the processed markdown with inline SVGs)
doc_content = """DOC_CONTENT_HERE"""

# Base64 encode (handles UTF-8 correctly)
doc_base64 = base64.b64encode(doc_content.encode('utf-8')).decode('ascii')

# Generate HTML with embedded base64 content
# Replace DOC_BASE64_PLACEHOLDER with doc_base64
# Replace DOC_NAME_PLACEHOLDER with document name
```

### Step 5: HTML Template

The generated HTML includes these CDN libraries (NO mermaid.js — diagrams are pre-rendered):

- **marked.js v11.1.1** — Markdown to HTML
- **DOMPurify v3.0.8** — XSS protection (sanitizes ALL HTML before DOM insertion)
- **Highlight.js** — Code syntax highlighting
- **KaTeX v0.16.33** — Math formula rendering
- **AOS v2.3.4** — Scroll animations

IMPORTANT: DOMPurify config must allow SVG tags and attributes for pre-rendered diagrams.
The DOMPurify sanitize call should use:

```javascript
var cleanHtml = DOMPurify.sanitize(html, {
    ADD_TAGS: ['pre', 'span', 'svg', 'g', 'path', 'rect', 'circle', 'ellipse',
               'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'clipPath',
               'marker', 'use', 'foreignObject', 'image', 'pattern',
               'linearGradient', 'radialGradient', 'stop', 'title', 'desc', 'style'],
    ADD_ATTR: ['class', 'language', 'style', 'viewBox', 'xmlns', 'fill', 'stroke',
               'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
               'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
               'width', 'height', 'transform', 'text-anchor', 'dominant-baseline',
               'font-size', 'font-family', 'font-weight', 'opacity', 'clip-path',
               'marker-end', 'marker-start', 'id', 'href', 'xlink:href', 'points',
               'dx', 'dy', 'offset', 'stop-color', 'stop-opacity', 'gradientTransform',
               'patternUnits', 'preserveAspectRatio', 'role', 'aria-label',
               'aria-roledescription', 'tabindex']
});
```

The HTML template CSS should include these additional styles for pre-rendered diagrams:

```css
.mermaid-rendered {
    text-align: center;
    margin: 1em 0;
    padding: 20px;
    border-radius: 6px;
    border: 1px solid #e1e1e1;
}

.mermaid-rendered svg {
    max-width: 100%;
    height: auto;
}
```

And in dark mode:
```css
.mermaid-rendered { border-color: #444; }
```

The JavaScript should NOT include:
- Step 5 from view-doc.md (mermaid code block conversion)
- Step 7 from view-doc.md (mermaid initialization + visibility-aware rendering)
- The mermaid.js CDN script tag

Use `.mermaid-rendered` instead of `.mermaid` in the AOS animation selector.

Otherwise, the template is identical to `view-doc.md` Step 4.

### Step 6: Write and Open

Write the HTML to `/tmp/doc-${DOC_NAME}-TIMESTAMP.html` where TIMESTAMP is `$(date +%y%m%d%H%M%S)`.

Then open in browser:

```bash
TIMESTAMP=$(date +%y%m%d%H%M%S)
HTML_FILE="/tmp/doc-${DOC_NAME}-${TIMESTAMP}.html"
open "$HTML_FILE"
echo "Generated HTML: $HTML_FILE"
echo "Opened in browser"
```

## Key Technical Details

1. **Pre-rendered Mermaid**: Diagrams are rendered to SVG server-side via beautiful-mermaid before HTML generation
2. **No Mermaid.js CDN**: The HTML template does NOT load mermaid.js — all diagrams are inline SVGs
3. **DOMPurify SVG allowlist**: SVG tags and attributes are explicitly allowed in sanitization config
4. **Base64 Encoding**: Avoids all escaping issues with special characters
5. **UTF-8 Support**: TextDecoder properly handles multi-byte characters
6. **Syntax Highlighting**: highlight.js integrated via marked's `highlight` callback
7. **Math Rendering**: KaTeX processes `$...$` (inline) and `$$...$$` (block) after DOM insertion
8. **Animations**: CSS page-load fade-in + AOS scroll-triggered fade-up on sections
9. **Unsupported diagrams**: Gantt, Pie, Mindmap blocks are left as code blocks if rendering fails
