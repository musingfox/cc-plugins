---
name: agent-browser
description: >-
  Use for live browser automation via the agent-browser CLI — open URLs, snapshot pages,
  click/fill/screenshot, inspect elements, or read pages that need JavaScript rendering,
  login, or interaction. Not for writing Playwright test files (use playwright or web-test).
allowed-tools: Bash(agent-browser open *) Bash(agent-browser snapshot *) Bash(agent-browser screenshot *) Bash(agent-browser get *) Read Grep Glob
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
5. **Re-snapshot** when the page changes (see Re-snapshot Rules)

## Snapshot Modes

The snapshot command is the primary inspection tool. Choose the right mode:

- **`snapshot -i`** — Interactive elements only (buttons, inputs, links). **Use as default.**
- **`snapshot -i -C`** (uppercase C) — Include cursor-interactive elements (divs with onclick). Use when expected elements are missing from `-i`. Note: `-C` (cursor-interactive) is distinct from `-c` (compact).
- **`snapshot -c`** — Compact output. Reduces token usage on large pages.
- **`snapshot -d N`** — Limit tree depth to N levels. Use for deeply nested DOMs.
- **`snapshot -s "selector"`** — Scope to a CSS selector. Focus on a specific page section.

Combine flags freely: `agent-browser snapshot -i -c -d 3` for compact, shallow, interactive-only output.

## Element Interaction Patterns

### Text Input
- **`fill @eN "text"`** — Clears existing content, then types. Use for replacing field values.
- **`type @eN "text"`** — Appends without clearing. Use for adding to existing content.

### Navigation via Click
- **`click @eN`** — Standard click.
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

Refs are invalidated by navigation and DOM changes. Read every ref from the most recent snapshot.

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
2. **Ask before irreversible actions** — Before a click or submit that deletes, buys, sends, or otherwise cannot be undone, confirm the target with `screenshot --annotate`, tell the user what the action will do, and proceed only after they approve.
3. **Handle dynamic content** — For SPAs and lazy-loaded content, wait with `wait --load networkidle` or `wait --text "<expected text>"`, then re-snapshot.
4. **Minimize token usage** — Use `-c` (compact) and `-d N` (depth limit) for large pages. Scope with `-s "selector"` for targeted sections.

## Additional Resources

### Command Help

For the full command list, run `agent-browser --help`; for one command's flags and examples, run `agent-browser <command> --help`.
