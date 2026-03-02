# Document Visualizer Plugin

Render any markdown document as beautifully formatted HTML with syntax highlighting, math formulas, Mermaid diagrams, and scroll animations.

## Overview

Originally built to view Claude Code plan files, this plugin now works with **any markdown file**. It generates self-contained HTML pages that open instantly in your browser with zero server dependencies.

## Features

- **Syntax Highlighting** — Code blocks with language-aware coloring (highlight.js)
- **Math Formulas** — Inline `$E=mc^2$` and block `$$\int_0^1$$` rendering (KaTeX)
- **Mermaid Diagrams** — Flowcharts, sequence diagrams, and more rendered inline
- **Scroll Animations** — Fade-up effects on sections as you scroll (AOS)
- **Page-Load Animation** — Smooth fade-in on page open
- **Dark Mode** — Automatically detects system preference
- **UTF-8 Support** — Handles multi-byte characters (繁體中文, etc.)
- **XSS Protection** — DOMPurify sanitizes all HTML before rendering
- **Zero Dependencies** — All libraries loaded via CDN

## Installation

### From Marketplace (Recommended)

```bash
/plugin marketplace add musingfox/cc-plugins
/plugin install plan-viz
```

### Manual Installation

1. Clone or copy this plugin to your Claude Code plugins directory
2. Restart Claude Code or reload plugins

## Usage

### Command: `/view-doc`

```bash
# List available plan files
/view-doc

# Open a plan file by name (backward compatible)
/view-doc snazzy-herding-gizmo

# Open any markdown file by path
/view-doc /path/to/document.md
/view-doc ~/notes/architecture.md
```

### Skill: Auto-Trigger

The `doc-render` skill automatically triggers when you ask Claude to:
- "Render this as HTML"
- "Open this in the browser"
- "Preview this document"
- Present complex content with tables, diagrams, or math formulas

## How It Works

1. **Reads** the target markdown file
2. **Base64 encodes** the content (safe UTF-8 handling)
3. **Embeds** it in a self-contained HTML template with CDN libraries
4. **Opens** the HTML in your default browser

All processing happens client-side using:

| Library | Version | Purpose |
|---------|---------|---------|
| marked.js | 11.1.1 | Markdown to HTML |
| DOMPurify | 3.0.8 | XSS protection |
| Mermaid | 11 | Diagram rendering |
| Highlight.js | latest | Code syntax highlighting |
| KaTeX | 0.16.33 | Math formula rendering |
| AOS | 2.3.4 | Scroll animations |

## Architecture

```
plan-viz/
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest
├── commands/
│   └── view-doc.md          # /view-doc command
├── skills/
│   └── doc-render/
│       └── SKILL.md         # Auto-trigger skill
└── README.md
```

## Output

Generated HTML files are saved to `/tmp/doc-{name}-{timestamp}.html`.

## Browser Compatibility

Works with all modern browsers: Chrome/Edge, Firefox, Safari (latest versions).

## Security

- All content sanitized via DOMPurify before rendering
- Mermaid.js runs in strict security mode
- Base64 encoding + UTF-8 decoding for safe character handling
- No server-side processing or network requests beyond CDN

## License

MIT

## Author

Nick Huang (nick12703990@gmail.com)

## Changelog

### Version 0.2.0

- Generalized to render any markdown file (not just plan files)
- Added `/view-doc` command replacing `/view-plan`
- Added `doc-render` auto-trigger skill
- Added syntax highlighting via highlight.js
- Added math formula rendering via KaTeX
- Added scroll animations via AOS
- Added page-load fade-in animation

### Version 0.1.0

- Initial release with plan file visualization
- UTF-8 support, dark mode, Mermaid diagrams, DOMPurify
