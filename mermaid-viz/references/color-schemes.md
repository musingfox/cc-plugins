# Mermaid Color Schemes

## Available Schemes

| Scheme | Style | Primary | Secondary | Text | Line |
|--------|-------|---------|-----------|------|------|
| `tokyo-night` | Dark | #7aa2f7 (blue) | #bb9af7 (purple) | #c0caf5 | #565f89 |
| `nord` | Dark | #88c0d0 (cyan) | #81a1c1 (blue) | #eceff4 | #4c566a |
| `catppuccin-mocha` | Dark | #89b4fa (blue) | #cba6f7 (mauve) | #cdd6f4 | #6c7086 |
| `catppuccin-latte` | Light | #1e66f5 (blue) | #8839ef (mauve) | #4c4f69 | #9ca0b0 |
| `dracula` | Dark | #bd93f9 (purple) | #ff79c6 (pink) | #f8f8f2 | #6272a4 |
| `github-dark` | Dark | #58a6ff (blue) | #79c0ff (light blue) | #c9d1d9 | #30363d |
| `github-light` | Light | #0969da (blue) | #0550ae (dark blue) | #24292f | #d0d7de |
| `solarized-dark` | Dark | #268bd2 (blue) | #2aa198 (cyan) | #839496 | #586e75 |
| `custom` | User-defined | `$MERMAID_PRIMARY_COLOR` | `$MERMAID_SECONDARY_COLOR` | `$MERMAID_TEXT_COLOR` | #565f89 |
| `default` | Mermaid built-in | (no custom colors) | | | |

## Scheme Name Mapping (for AskUserQuestion labels)

- "Tokyo Night" → `tokyo-night`
- "Nord" → `nord`
- "Catppuccin Mocha" → `catppuccin-mocha`
- "Catppuccin Latte" → `catppuccin-latte`
- "Dracula" → `dracula`
- "GitHub Dark" → `github-dark`
- "GitHub Light" → `github-light`
- "Solarized Dark" → `solarized-dark`
- "Custom" → `custom`

## Environment Variables

```bash
# Output format (png or svg)
export MERMAID_OUTPUT_FORMAT=png

# Color scheme
export MERMAID_COLOR_SCHEME=tokyo-night

# Custom colors (only when MERMAID_COLOR_SCHEME=custom)
export MERMAID_PRIMARY_COLOR=#7aa2f7
export MERMAID_SECONDARY_COLOR=#bb9af7
export MERMAID_TEXT_COLOR=#c0caf5
```

## All Themes JSON Configs

All themes use `"theme": "base"` with `"background": "transparent"`. Additional themeVariables per scheme:

- `tertiaryColor`: tokyo-night=#9ece6a, nord=#a3be8c, catppuccin-mocha=#a6e3a1, catppuccin-latte=#40a02b, dracula=#50fa7b, github-dark=#56d364, github-light=#1a7f37, solarized-dark=#859900
- `primaryBorderColor`, `secondaryBorderColor`, `tertiaryBorderColor`: same as `lineColor` for each scheme
