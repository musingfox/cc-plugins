---
description: View plan file as formatted HTML
argument-hint: "[filename]"
allowed-tools: ["Bash", "Read", "Write"]
---

# View Plan Command

Renders a Claude Code plan file as formatted HTML and opens it in your browser.

## Usage

- `/view-plan` - Opens the most recent plan file
- `/view-plan <filename>` - Opens a specific plan file (without .md extension)

## Features

- ✅ Markdown rendering (headers, lists, tables, code blocks)
- ✅ Mermaid diagram support
- ✅ UTF-8 support (繁體中文, etc.)
- ✅ Dark mode auto-detection
- ✅ XSS protection via DOMPurify
- ✅ Responsive design
- ✅ Clean typography

## Implementation

### Step 1: Determine Plan File

Use bash to find the plan file:

```bash
PLANS_DIR="$HOME/.claude/plans"

if [ -n "$1" ]; then
    PLAN_FILE="$PLANS_DIR/$1.md"
    PLAN_NAME="$1"

    if [ ! -f "$PLAN_FILE" ]; then
        echo "❌ Plan file not found: $1.md"
        echo ""
        echo "📋 Available plans:"
        ls -t "$PLANS_DIR"/*.md 2>/dev/null | head -10 | xargs -n1 basename | sed 's/\.md$//' | sed 's/^/  • /'
        exit 1
    fi
else
    PLAN_FILE=$(ls -t "$PLANS_DIR"/*.md 2>/dev/null | head -1)

    if [ -z "$PLAN_FILE" ]; then
        echo "❌ No plan files found in $PLANS_DIR"
        exit 1
    fi

    PLAN_NAME=$(basename "$PLAN_FILE" .md)
fi

echo "📄 Reading plan: $PLAN_NAME.md"
```

### Step 2: Read Plan Content

Use the **Read** tool to read `$PLAN_FILE`.

### Step 3: Generate HTML with Base64 Encoding

Use Python to encode the plan content and generate HTML:

```python
import base64

# Plan content from Read tool
plan_content = """PLAN_CONTENT_HERE"""

# Base64 encode (handles UTF-8 correctly)
plan_base64 = base64.b64encode(plan_content.encode('utf-8')).decode('ascii')

# Generate HTML with embedded base64 content
# Replace PLAN_BASE64_PLACEHOLDER with plan_base64
# Replace PLAN_NAME_PLACEHOLDER with plan name
```

### Step 4: HTML Template

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Plan: PLAN_NAME_PLACEHOLDER</title>
    <style>
        * { box-sizing: border-box; }
        body {
            max-width: 900px;
            margin: 40px auto;
            padding: 0 20px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft JhengHei", Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #fff;
        }
        h1, h2, h3, h4 { margin-top: 1.5em; margin-bottom: 0.5em; }
        h1 { font-size: 2em; border-bottom: 2px solid #eee; padding-bottom: 0.3em; }
        h2 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
        h3 { font-size: 1.25em; }
        code {
            background: #f5f5f5;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: "SF Mono", Monaco, Consolas, monospace;
            font-size: 0.9em;
        }
        pre {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
            border: 1px solid #e1e1e1;
        }
        pre code { background: none; padding: 0; }
        table { border-collapse: collapse; width: 100%; margin: 1em 0; }
        th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
        th { background: #f5f5f5; font-weight: 600; }
        blockquote {
            border-left: 4px solid #ddd;
            margin: 1em 0;
            padding: 0.5em 1em;
            background: #f9f9f9;
        }
        ul, ol { padding-left: 1.5em; }
        li { margin: 0.3em 0; }
        hr { border: none; border-top: 1px solid #eee; margin: 2em 0; }
        .mermaid {
            background: white;
            padding: 20px;
            border-radius: 5px;
            margin: 1em 0;
            border: 1px solid #e1e1e1;
        }
        @media (prefers-color-scheme: dark) {
            body { background: #1a1a1a; color: #e1e1e1; }
            h1, h2 { border-bottom-color: #333; }
            code, pre { background: #2d2d2d; }
            pre { border-color: #444; }
            th, td { border-color: #444; }
            th { background: #2d2d2d; }
            blockquote { border-left-color: #555; background: #252525; }
            hr { border-top-color: #333; }
            .mermaid { background: #2d2d2d; border-color: #444; }
        }
    </style>
</head>
<body>
    <div id="content"></div>

    <script src="https://cdn.jsdelivr.net/npm/marked@11.1.1/marked.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/dompurify@3.0.8/dist/purify.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10.6.1/dist/mermaid.min.js"></script>

    <script>
        // Helper function to decode base64 with UTF-8 support
        function base64DecodeUTF8(base64) {
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const decoder = new TextDecoder('utf-8');
            return decoder.decode(bytes);
        }

        window.addEventListener('load', function() {
            try {
                // Base64 encoded plan content
                const planBase64 = "PLAN_BASE64_PLACEHOLDER";

                // Decode from base64 with UTF-8 support
                const planMarkdown = base64DecodeUTF8(planBase64);

                // Render Markdown
                const html = marked.parse(planMarkdown);

                // Sanitize HTML
                const cleanHtml = DOMPurify.sanitize(html, {
                    ADD_TAGS: ['pre'],
                    ADD_ATTR: ['class', 'language']
                });

                // Insert into DOM
                document.getElementById('content').innerHTML = cleanHtml;

                // Convert mermaid code blocks to mermaid divs
                document.querySelectorAll('code.language-mermaid').forEach(function(codeBlock) {
                    const pre = codeBlock.parentElement;
                    const mermaidDiv = document.createElement('div');
                    mermaidDiv.className = 'mermaid';
                    mermaidDiv.textContent = codeBlock.textContent;
                    pre.replaceWith(mermaidDiv);
                });

                // Initialize and render Mermaid
                mermaid.initialize({
                    startOnLoad: false,
                    theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default',
                    securityLevel: 'loose'
                });

                mermaid.run();

            } catch (error) {
                document.getElementById('content').innerHTML =
                    '<h2 style="color:red;">Error</h2><pre>' + error.message + '</pre>';
                console.error('Error:', error);
            }
        });
    </script>
</body>
</html>
```

### Step 5: Write and Open

Write the HTML to `/tmp/plan-${PLAN_NAME}-TIMESTAMP.html` where TIMESTAMP is `$(date +%y%m%d%H%M%S)`.

Then open in browser:

```bash
TIMESTAMP=$(date +%y%m%d%H%M%S)
HTML_FILE="/tmp/plan-${PLAN_NAME}-${TIMESTAMP}.html"
open "$HTML_FILE"
echo "✅ Generated HTML view"
echo "✅ Opened in browser: $HTML_FILE"
```

## Key Technical Details

1. **Base64 Encoding**: Avoids all escaping issues with special characters
2. **UTF-8 Support**: TextDecoder properly handles multi-byte characters (中文, etc.)
3. **Mermaid Integration**: Converts `<code class="language-mermaid">` to `<div class="mermaid">`
4. **XSS Protection**: DOMPurify sanitizes all HTML before insertion
5. **Dark Mode**: Auto-detects system preference via `matchMedia`
