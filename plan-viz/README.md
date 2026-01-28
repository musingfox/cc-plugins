# Plan Visualizer Plugin

Ultra-lightweight plugin for viewing Claude Code plan files as beautifully formatted HTML.

## Overview

Claude Code's plan files (`~/.claude/plans/*.md`) are raw Markdown that can be difficult to review in the terminal. This plugin instantly transforms them into readable, styled HTML pages that open in your browser.

## Features

- 🚀 **Zero dependencies** - All libraries loaded via CDN
- 🎨 **Beautiful rendering** - Clean typography and responsive design
- 🌓 **Dark mode** - Automatically detects system preference
- 📊 **Mermaid diagrams** - Renders inline automatically
- 🔒 **Secure** - XSS protection via DOMPurify
- ⚡ **Fast** - Instant HTML generation

## Installation

1. Clone or copy this plugin to your Claude Code plugins directory:
   ```bash
   cd ~/.claude/plugins
   git clone <repo-url> plan-viz
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
- **marked.js** - Markdown to HTML conversion
- **DOMPurify** - HTML sanitization
- **Mermaid.js** - Diagram rendering

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
- No server-side processing or network requests
- Temporary HTML files are stored in `/tmp`

## Future Enhancements

- Linux/Windows support (`xdg-open`, `start` commands)
- Export to PDF
- Side-by-side plan comparison
- Search across all plans
- Custom CSS themes

## License

MIT

## Author

Nick Huang (nick12703990@gmail.com)

## Version

0.1.0
