# Plan Visualizer Plugin

Ultra-lightweight plugin for viewing Claude Code plan files as beautifully formatted HTML with UTF-8 support.

## Overview

Claude Code's plan files (`~/.claude/plans/*.md`) are raw Markdown that can be difficult to review in the terminal. This plugin instantly transforms them into readable, styled HTML pages that open in your browser.

## Features

- 🚀 **Zero dependencies** - All libraries loaded via CDN
- 🎨 **Beautiful rendering** - Clean typography and responsive design
- 🌓 **Dark mode** - Automatically detects system preference
- 📊 **Mermaid diagrams** - Renders inline automatically (Mermaid.js v11)
- 🔒 **Secure** - XSS protection via DOMPurify, strict security level
- 🌍 **UTF-8 support** - Handles multi-byte characters (繁體中文, etc.)
- ⚡ **Fast** - Instant HTML generation

## Installation

### From Marketplace (Recommended)

```bash
/plugin marketplace add musingfox/cc-plugins
/plugin install plan-viz
```

### Manual Installation

1. Clone or copy this plugin to your Claude Code plugins directory:
   ```bash
   cd ~/.claude/plugins
   git clone https://github.com/musingfox/cc-plugins.git
   ```

2. Restart Claude Code or reload plugins

## Usage

### View Most Recent Plan
```bash
/view-plan
```

### View Specific Plan
```bash
/view-plan snazzy-herding-gizmo
```

Note: Omit the `.md` extension when specifying a plan name.

## How It Works

1. **Reads** your plan file from `~/.claude/plans/`
2. **Wraps** the content in a self-contained HTML template
3. **Opens** the HTML in your default browser

All processing happens client-side in the browser using:
- **marked.js v11.1.1** - Markdown to HTML conversion
- **DOMPurify v3.0.8** - HTML sanitization
- **Mermaid.js v11** - Diagram rendering with strict security

## Example Output

The generated HTML includes:
- Properly formatted headers and tables
- Syntax-highlighted code blocks
- Rendered Mermaid diagrams
- Responsive layout optimized for reading
- Dark mode support

## Architecture

```
plan-viz/
├── .claude-plugin/
│   └── plugin.json       # Plugin manifest
├── commands/
│   └── view-plan.md      # Command implementation
└── README.md             # This file
```

**Total complexity**: 3 files, ~100 lines of command code

## Browser Compatibility

Works with all modern browsers:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## Security

- All plan content is sanitized via DOMPurify before rendering
- Mermaid.js runs in strict security mode (no arbitrary JavaScript)
- Base64 encoding + UTF-8 decoding for safe multi-byte character handling
- No server-side processing or network requests
- Temporary HTML files are stored in `/tmp`

## Future Enhancements

- Export to PDF
- Side-by-side plan comparison
- Search across all plans
- Custom CSS themes
- Syntax highlighting for code blocks

## License

MIT

## Author

Nick Huang (nick12703990@gmail.com)

## Changelog

### Version 1.1.0 (2026-01-30)

**Improvements:**
- ⬆️ Upgraded Mermaid.js from v10.6.1 to v11
- 🔒 Enhanced security: Changed `securityLevel` from 'loose' to 'strict'
- 📦 Added to marketplace catalog

### Version 1.0.0 (2026-01-28)

- Initial release
- UTF-8 support via Base64 encoding
- Dark mode auto-detection
- Mermaid diagram rendering
- XSS protection via DOMPurify
