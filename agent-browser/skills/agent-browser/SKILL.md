---
name: agent-browser
description: >-
  Use for live browser automation via the agent-browser CLI — open URLs, snapshot pages,
  click/fill/screenshot, inspect elements, scrape or read web pages. Ref-based workflow
  for AI agents. Not for writing Playwright test files (use playwright or web-test).
allowed-tools: Bash(agent-browser *) Read Grep Glob
---

# agent-browser

## Overview

agent-browser is a CLI that gives AI agents direct control over headless browsers. It uses a **ref-based** interaction model: every interactive element receives a unique reference identifier (`@e1`, `@e2`, etc.) derived from the accessibility tree. This enables deterministic, token-efficient browser automation without fragile CSS selectors.

## Prerequisites

Ensure agent-browser is installed and the browser binary is available:

```bash
# Check installation
agent-browser --version

# Install globally
npm install -g agent-browser
agent-browser install

# On Linux, include system dependencies
agent-browser install --with-deps
```

## Core Workflow: The Ref Cycle

Every browser interaction follows a strict cycle:

```
open URL → snapshot → read refs → interact → re-snapshot → repeat
```

1. **Navigate** to the target page with `open`
2. **Snapshot** to obtain the accessibility tree with refs
3. **Read** the snapshot output — identify target elements by their refs
4. **Interact** with elements using their refs (`click @e1`, `fill @e2 "text"`)
5. **Re-snapshot** after any action that changes the DOM

**Critical rule**: Refs are invalidated after navigation or significant DOM changes. Always take a fresh snapshot before interacting with elements after any page change.

## Command Quick Reference

| Command | Syntax | Purpose |
|---------|--------|---------|
| `open` | `agent-browser open <url>` | Navigate to URL |
| `snapshot` | `agent-browser snapshot [-i] [-c] [-d N] [-s "sel"]` | Get accessibility tree with refs |
| `click` | `agent-browser click @eN [--new-tab]` | Click element |
| `dblclick` | `agent-browser dblclick @eN` | Double-click element |
| `fill` | `agent-browser fill @eN "text"` | Clear field and type text |
| `type` | `agent-browser type @eN "text"` | Type without clearing |
| `focus` | `agent-browser focus @eN` | Focus element |
| `select` | `agent-browser select @eN "option"` | Select dropdown option |
| `check` | `agent-browser check @eN` | Check checkbox |
| `uncheck` | `agent-browser uncheck @eN` | Uncheck checkbox |
| `hover` | `agent-browser hover @eN` | Hover over element |
| `press` | `agent-browser press <key>` | Press keyboard key |
| `scroll` | `agent-browser scroll <dir> [pixels]` | Scroll page (default 300px) |
| `screenshot` | `agent-browser screenshot [--annotate]` | Capture screenshot |
| `open --headers` | `agent-browser open <url> --headers '{...}'` | Send headers to that URL's origin only |

## Snapshot Modes

The snapshot command is the primary inspection tool. Choose the right mode:

- **`snapshot -i`** — Interactive elements only (buttons, inputs, links). **Use as default.**
- **`snapshot -i -C`** (uppercase C) — Include cursor-interactive elements (divs with onclick). Use when expected elements are missing from `-i`. Note: `-C` (cursor-interactive) is distinct from `-c` (compact).
- **`snapshot -c`** — Compact output. Reduces token usage on large pages.
- **`snapshot -d N`** — Limit tree depth to N levels. Use for deeply nested DOMs.
- **`snapshot -s "selector"`** — Scope to a CSS selector. Focus on a specific page section.
- **`snapshot --annotate`** — Overlay numbered labels `[N]` on a screenshot matching refs `@eN`.

Combine flags freely: `agent-browser snapshot -i -c -d 3` for compact, shallow, interactive-only output.

## Element Interaction Patterns

### Text Input
- **`fill @eN "text"`** — Clears existing content, then types. Use for replacing field values.
- **`type @eN "text"`** — Appends without clearing. Use for adding to existing content.

### Navigation via Click
- **`click @eN`** — Standard click. If the page navigates, re-snapshot immediately.
- **`click @eN --new-tab`** — Opens in new tab. Original page state is preserved.

### Keyboard
- **`press Enter`** — Submit forms.
- **`press Tab`** / **`press Shift+Tab`** — Navigate focus.
- **`press Escape`** — Close modals or dialogs.
- Combinations: `press Control+a`, `press Control+c`.

### Scrolling
- **`scroll down 500`** — Scroll down 500 pixels. The amount is in pixels (default 300).
- **`scroll up 500`** — Scroll up 500 pixels.
- **`scrollintoview @eN`** — Scroll a specific element into view.
- Scroll to reveal off-screen elements before interacting with them.

## Screenshots

- **`screenshot`** — Capture current viewport for visual inspection.
- **`screenshot --annotate`** — Overlay `[N]` labels on interactive elements. Use to visually confirm ref assignments before performing destructive actions.

## Re-snapshot Rules

**Always re-snapshot after:**
- Navigation (`open`, clicking a link)
- Form submission
- Any action that triggers DOM changes (buttons loading content, search fields filtering)
- Scrolling (new elements may enter viewport)
- Tab switching

**Safe to skip re-snapshot after:**
- `screenshot` (read-only)
- `hover` (unless hover triggers a dropdown or tooltip DOM change)
- `focus` (usually no DOM change)

When uncertain, snapshot. The cost of an extra snapshot is far less than using a stale ref.

## Headers and Authentication

Pass credentials with `open --headers`, which sends them only to that URL's origin:

```bash
agent-browser open <url> --headers '{"Authorization": "Bearer <token>"}'
```

Never put credentials in `set headers`: it is a global setting that applies to every domain, so tokens and cookies would reach every third-party origin the page requests.

## Best Practices

1. **Start with `snapshot -i`** — Interactive elements are usually sufficient. Expand to `-i -C` or full snapshot only when needed.
2. **Verify before destructive actions** — Use `screenshot --annotate` to confirm the target element before delete, submit, or irreversible actions.
3. **Handle dynamic content** — For SPAs and lazy-loaded content, re-snapshot if expected elements are absent. A brief wait may be needed.
4. **Minimize token usage** — Use `-c` (compact) and `-d N` (depth limit) for large pages. Scope with `-s "selector"` for targeted sections.
5. **One action per step** — Perform one interaction, then snapshot to verify the result before proceeding.
6. **Never guess refs** — Always read refs from the most recent snapshot. Never reuse refs from a previous snapshot after a DOM change.

## Additional Resources

### Command Help

For full flags and examples of any command, run `agent-browser <command> --help`.
