---
description: Render a document as formatted HTML
argument-hint: "[file-path or plan-name]"
allowed-tools: ["Bash", "Read", "Write"]
---

# View Document Command

Renders a markdown document as formatted HTML with syntax highlighting, math formulas, Mermaid diagrams, and animations, then opens it in your browser.

## Usage

- `/view-doc` - List available plans from `~/.claude/plans/` and show usage hint
- `/view-doc <plan-name>` - Open a plan file by name (backward compatible with `/view-plan`)
- `/view-doc /path/to/file.md` - Open any markdown file by path

## Implementation

### Step 1: Resolve File Path

Use bash to determine the input file:

```bash
INPUT="$ARGUMENTS"
PLANS_DIR="$HOME/.claude/plans"

if [ -z "$INPUT" ]; then
    # No argument: list available plans and show usage
    echo "📋 Available plans in $PLANS_DIR:"
    ls -t "$PLANS_DIR"/*.md 2>/dev/null | head -20 | xargs -n1 basename | sed 's/\.md$//' | sed 's/^/  • /'
    echo ""
    echo "Usage:"
    echo "  /view-doc <plan-name>       Open a plan file"
    echo "  /view-doc /path/to/file.md  Open any markdown file"
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
        echo "❌ File not found: $INPUT"
        exit 1
    fi
else
    # Bare name: try as plan file (backward compat)
    DOC_FILE="$PLANS_DIR/$INPUT.md"
    DOC_NAME="$INPUT"
    if [ ! -f "$DOC_FILE" ]; then
        echo "❌ Plan file not found: $INPUT.md"
        echo ""
        echo "📋 Available plans:"
        ls -t "$PLANS_DIR"/*.md 2>/dev/null | head -10 | xargs -n1 basename | sed 's/\.md$//' | sed 's/^/  • /'
        exit 1
    fi
fi

echo "📄 Reading: $DOC_FILE"
```

### Step 2: Read Document Content

Use the **Read** tool to read the resolved `$DOC_FILE`.

### Step 3: Generate HTML with Base64 Encoding

Use Python to encode the document content and generate HTML:

```python
import base64

# Document content from Read tool
doc_content = """DOC_CONTENT_HERE"""

# Base64 encode (handles UTF-8 correctly)
doc_base64 = base64.b64encode(doc_content.encode('utf-8')).decode('ascii')

# Generate HTML with embedded base64 content
# Replace DOC_BASE64_PLACEHOLDER with doc_base64
# Replace DOC_NAME_PLACEHOLDER with document name
```

### Step 4: HTML Template

The generated HTML includes these CDN libraries (all loaded client-side, zero server dependencies):

- **marked.js v11.1.1** — Markdown to HTML
- **DOMPurify v3.0.8** — XSS protection (sanitizes ALL HTML before DOM insertion)
- **Mermaid v11** — Diagram rendering
- **Highlight.js** — Code syntax highlighting
- **KaTeX v0.16.33** — Math formula rendering
- **AOS v2.3.4** — Scroll animations

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DOC_NAME_PLACEHOLDER</title>

    <!-- Code highlighting -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@latest/build/styles/atom-one-dark.min.css" id="hljs-theme">

    <!-- KaTeX math -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.33/dist/katex.min.css">

    <!-- AOS scroll animations -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/aos@2.3.4/dist/aos.css">

    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            max-width: 900px;
            margin: 40px auto;
            padding: 0 20px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft JhengHei", Roboto, sans-serif;
            line-height: 1.7;
            color: #333;
            background: #fff;
            animation: pageLoad 0.6s ease-out;
        }

        @keyframes pageLoad {
            from { opacity: 0; transform: translateY(20px); }
            to   { opacity: 1; transform: translateY(0); }
        }

        h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; font-weight: 600; }
        h1 { font-size: 2em; border-bottom: 2px solid #eee; padding-bottom: 0.3em; }
        h2 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
        h3 { font-size: 1.25em; }

        p { margin: 0.8em 0; }
        a { color: #0366d6; text-decoration: none; }
        a:hover { text-decoration: underline; }

        code {
            background: #f5f5f5;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: "SF Mono", Monaco, Consolas, "Liberation Mono", monospace;
            font-size: 0.9em;
        }

        pre {
            background: #282c34;
            padding: 16px;
            border-radius: 6px;
            overflow-x: auto;
            margin: 1em 0;
            border: 1px solid #e1e1e1;
        }

        pre code {
            background: none;
            padding: 0;
            color: #abb2bf;
            font-size: 0.85em;
            line-height: 1.5;
        }

        table { border-collapse: collapse; width: 100%; margin: 1em 0; }
        th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
        th { background: #f5f5f5; font-weight: 600; }
        tr:nth-child(even) { background: #fafafa; }

        blockquote {
            border-left: 4px solid #ddd;
            margin: 1em 0;
            padding: 0.5em 1em;
            background: #f9f9f9;
            color: #555;
        }

        ul, ol { padding-left: 1.5em; margin: 0.5em 0; }
        li { margin: 0.3em 0; }
        hr { border: none; border-top: 1px solid #eee; margin: 2em 0; }
        img { max-width: 100%; height: auto; border-radius: 4px; }

        .mermaid {
            background: white;
            padding: 20px;
            border-radius: 6px;
            margin: 1em 0;
            border: 1px solid #e1e1e1;
            text-align: center;
        }

        .katex-display {
            overflow-x: auto;
            overflow-y: hidden;
            padding: 0.5em 0;
        }

        /* Dark mode */
        @media (prefers-color-scheme: dark) {
            body { background: #1a1a1a; color: #e1e1e1; }
            a { color: #58a6ff; }
            h1, h2 { border-bottom-color: #333; }
            code { background: #2d2d2d; }
            pre { background: #282c34; border-color: #444; }
            th, td { border-color: #444; }
            th { background: #2d2d2d; }
            tr:nth-child(even) { background: #222; }
            blockquote { border-left-color: #555; background: #252525; color: #aaa; }
            hr { border-top-color: #333; }
            .mermaid { background: #2d2d2d; border-color: #444; }
        }
    </style>
</head>
<body>
    <div id="content"></div>

    <!-- Markdown rendering -->
    <script src="https://cdn.jsdelivr.net/npm/marked@11.1.1/marked.min.js"></script>
    <!-- DOMPurify: sanitizes ALL rendered HTML before DOM insertion to prevent XSS -->
    <script src="https://cdn.jsdelivr.net/npm/dompurify@3.0.8/dist/purify.min.js"></script>

    <!-- Diagrams -->
    <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>

    <!-- Code highlighting -->
    <script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@latest/build/highlight.min.js"></script>

    <!-- KaTeX math -->
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.33/dist/katex.min.js"></script>

    <!-- AOS scroll animations -->
    <script src="https://cdn.jsdelivr.net/npm/aos@2.3.4/dist/aos.js"></script>

    <script>
        function base64DecodeUTF8(base64) {
            var binaryString = atob(base64);
            var bytes = new Uint8Array(binaryString.length);
            for (var i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return new TextDecoder('utf-8').decode(bytes);
        }

        window.addEventListener('load', function() {
            try {
                // 1. Decode base64 content
                var docBase64 = "DOC_BASE64_PLACEHOLDER";
                var docMarkdown = base64DecodeUTF8(docBase64);

                // 2. Configure marked with highlight.js for syntax highlighting
                marked.setOptions({
                    highlight: function(code, lang) {
                        if (lang && hljs.getLanguage(lang)) {
                            return hljs.highlight(code, { language: lang }).value;
                        }
                        return hljs.highlightAuto(code).value;
                    },
                    gfm: true,
                    breaks: false
                });

                // 3. Render markdown, sanitize with DOMPurify, insert into DOM
                var html = marked.parse(docMarkdown);
                var cleanHtml = DOMPurify.sanitize(html, {
                    ADD_TAGS: ['pre', 'span'],
                    ADD_ATTR: ['class', 'language', 'style']
                });
                document.getElementById('content').innerHTML = cleanHtml;

                // 4. KaTeX: render math expressions after DOM insertion
                // Block math: $$...$$
                document.querySelectorAll('p, li, td, th, blockquote').forEach(function(el) {
                    if (el.textContent.indexOf('$$') === -1) return;
                    el.innerHTML = el.innerHTML.replace(/\$\$([\s\S]*?)\$\$/g, function(match, tex) {
                        try {
                            return katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false });
                        } catch (e) { return match; }
                    });
                });
                // Inline math: $...$ (but not $$)
                document.querySelectorAll('p, li, td, th, blockquote').forEach(function(el) {
                    if (el.textContent.indexOf('$') === -1) return;
                    el.innerHTML = el.innerHTML.replace(/(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)\$(?!\$)/g, function(match, tex) {
                        try {
                            return katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false });
                        } catch (e) { return match; }
                    });
                });

                // 5. Convert mermaid code blocks to mermaid divs
                document.querySelectorAll('code.language-mermaid').forEach(function(codeBlock) {
                    var pre = codeBlock.parentElement;
                    var mermaidDiv = document.createElement('div');
                    mermaidDiv.className = 'mermaid';
                    mermaidDiv.textContent = codeBlock.textContent;
                    pre.replaceWith(mermaidDiv);
                });

                // 6. Add AOS scroll animations to content sections
                document.querySelectorAll('h1, h2, h3, table, pre, blockquote, .mermaid, .katex-display').forEach(function(el) {
                    el.setAttribute('data-aos', 'fade-up');
                });

                // 7. Initialize Mermaid (visibility-aware lazy rendering)
                // Mermaid needs visible DOM to compute SVG layout dimensions.
                // When multiple files open simultaneously, background tabs have
                // visibilityState === "hidden" and mermaid.run() silently fails.
                mermaid.initialize({
                    startOnLoad: false,
                    theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default',
                    securityLevel: 'strict'
                });

                var mermaidNodes = document.querySelectorAll('.mermaid');
                function renderMermaid() {
                    if (mermaidNodes.length === 0) return;
                    requestAnimationFrame(function() {
                        mermaid.run({ nodes: mermaidNodes });
                    });
                }

                if (document.visibilityState === 'visible') {
                    renderMermaid();
                } else {
                    document.addEventListener('visibilitychange', function onVisible() {
                        if (document.visibilityState === 'visible') {
                            document.removeEventListener('visibilitychange', onVisible);
                            renderMermaid();
                        }
                    });
                }

                // 8. Initialize AOS scroll animations
                AOS.init({ duration: 600, once: true, offset: 50 });

            } catch (error) {
                document.getElementById('content').textContent = 'Error: ' + error.message;
                console.error('Error:', error);
            }
        });
    </script>
</body>
</html>
```

### Step 5: Write and Open

Write the HTML to `/tmp/doc-${DOC_NAME}-TIMESTAMP.html` where TIMESTAMP is `$(date +%y%m%d%H%M%S)`.

Then open in browser:

```bash
TIMESTAMP=$(date +%y%m%d%H%M%S)
HTML_FILE="/tmp/doc-${DOC_NAME}-${TIMESTAMP}.html"
open "$HTML_FILE"
echo "✅ Generated HTML: $HTML_FILE"
echo "✅ Opened in browser"
```

## Key Technical Details

1. **Base64 Encoding**: Avoids all escaping issues with special characters
2. **UTF-8 Support**: TextDecoder properly handles multi-byte characters (中文, etc.)
3. **Syntax Highlighting**: highlight.js integrated via marked's `highlight` callback
4. **Math Rendering**: KaTeX processes `$...$` (inline) and `$$...$$` (block) after DOM insertion
5. **Mermaid Integration**: Converts `<code class="language-mermaid">` to `<div class="mermaid">`
6. **Animations**: CSS page-load fade-in + AOS scroll-triggered fade-up on sections
7. **XSS Protection**: DOMPurify sanitizes all HTML before insertion
8. **Dark Mode**: Auto-detects system preference via `matchMedia`
