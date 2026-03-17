# agent-browser Command Reference

Complete reference for all agent-browser CLI commands with flags and examples.

## Navigation

### `open`

Navigate the browser to a URL.

```bash
agent-browser open <url>
```

- Auto-prepends `https://` if no protocol specified
- Supported protocols: `https://`, `http://`, `file://`, `about://`, `data://`

**Examples:**
```bash
agent-browser open https://example.com
agent-browser open example.com                    # becomes https://example.com
agent-browser open file:///path/to/local.html
agent-browser open "http://localhost:3000/dashboard"
```

## Snapshot (State Inspection)

### `snapshot`

Return the accessibility tree of the current page with ref identifiers.

```bash
agent-browser snapshot [flags]
```

**Flags:**

| Flag | Description |
|------|-------------|
| `-i` | Interactive elements only (buttons, inputs, links) |
| `-C` | Include cursor-interactive elements (divs with onclick) — use with `-i` |
| `-c` | Compact output format (reduced whitespace) |
| `-d <depth>` | Limit tree depth (e.g., `-d 3`) |
| `-s "<selector>"` | Scope to CSS selector (e.g., `-s ".main-content"`) |
| `--annotate` | Overlay numbered labels `[N]` on screenshot matching refs `@eN` |

**Examples:**
```bash
agent-browser snapshot                     # Full accessibility tree
agent-browser snapshot -i                  # Interactive elements only (recommended default)
agent-browser snapshot -i -C               # Include cursor-interactive divs
agent-browser snapshot -i -c               # Interactive, compact output
agent-browser snapshot -i -c -d 3          # Interactive, compact, max 3 levels deep
agent-browser snapshot -s ".login-form"    # Only elements within .login-form
agent-browser snapshot -s "#main" -i       # Interactive elements within #main
agent-browser snapshot --annotate          # Screenshot with numbered overlay labels
```

**Output format:**
```
@e1: button "Sign In"
@e2: textbox "Email" [focused]
@e3: textbox "Password"
@e4: link "Forgot password?"
@e5: checkbox "Remember me"
```

Each line shows: `@ref: role "accessible name" [state]`

## Element Interaction

All interaction commands use ref syntax (`@eN`) from the most recent snapshot.

### `click`

```bash
agent-browser click @eN [--new-tab]
```

- Standard left-click on the referenced element
- `--new-tab`: Open the link target in a new tab

**Examples:**
```bash
agent-browser click @e1               # Click element @e1
agent-browser click @e4 --new-tab     # Open link in new tab
```

### `dblclick`

```bash
agent-browser dblclick @eN
```

Double-click on the referenced element.

### `fill`

```bash
agent-browser fill @eN "text"
```

Clear the input field and type the specified text. Use for replacing field values.

**Examples:**
```bash
agent-browser fill @e2 "user@example.com"
agent-browser fill @e3 "my-password-123"
```

### `type`

```bash
agent-browser type @eN "text"
```

Type text into the element without clearing existing content. Use for appending.

### `focus`

```bash
agent-browser focus @eN
```

Set focus on the referenced element.

### `select`

```bash
agent-browser select @eN "option text"
```

Select an option from a dropdown/select element by its visible text.

**Example:**
```bash
agent-browser select @e6 "United States"
```

### `check` / `uncheck`

```bash
agent-browser check @eN
agent-browser uncheck @eN
```

Check or uncheck a checkbox element.

### `hover`

```bash
agent-browser hover @eN
```

Hover over the referenced element. Useful for revealing tooltips or dropdown menus.

**Note:** If hover triggers a DOM change (dropdown menu appears), re-snapshot before interacting with newly revealed elements.

### `press`

```bash
agent-browser press <key>
```

Press a keyboard key or key combination.

**Common keys:**
```bash
agent-browser press Enter
agent-browser press Tab
agent-browser press Escape
agent-browser press Backspace
agent-browser press Delete
agent-browser press ArrowDown
agent-browser press ArrowUp
agent-browser press Space
```

**Key combinations:**
```bash
agent-browser press Control+a          # Select all
agent-browser press Control+c          # Copy
agent-browser press Control+v          # Paste
agent-browser press Shift+Tab          # Reverse tab
agent-browser press Alt+Enter          # Alt+Enter
```

### `scroll`

```bash
agent-browser scroll <direction> <amount>
```

Scroll the page. Direction: `up`, `down`, `left`, `right`. Amount: number of viewport heights/widths.

**Examples:**
```bash
agent-browser scroll down 3            # Scroll down 3 viewport heights
agent-browser scroll up 1              # Scroll up 1 viewport height
agent-browser scroll down 0.5          # Scroll down half a viewport
```

## Screenshots

### `screenshot`

```bash
agent-browser screenshot [--annotate]
```

- Without flag: Capture current viewport as image
- `--annotate`: Overlay numbered labels `[N]` on interactive elements matching refs `@eN`

**Examples:**
```bash
agent-browser screenshot                # Plain screenshot
agent-browser screenshot --annotate     # Screenshot with ref labels overlay
```

## Configuration

### `set headers`

```bash
agent-browser set headers '<json>'
```

Set custom HTTP headers for subsequent requests. Headers persist for the session.

**Examples:**
```bash
agent-browser set headers '{"Authorization": "Bearer eyJ..."}'
agent-browser set headers '{"Cookie": "session=abc123", "X-Custom": "value"}'
```

**Per-command headers:**
```bash
agent-browser open https://api.example.com --headers '{"Authorization": "Bearer token"}'
```

## Browser Configuration

### Custom Browser Executable

```bash
agent-browser open https://example.com --executable-path /path/to/chrome
```

Or set via environment variable:
```bash
export AGENT_BROWSER_EXECUTABLE_PATH=/path/to/chrome
```

## Workflow Examples

### Login Flow

```bash
agent-browser open https://app.example.com/login
agent-browser snapshot -i
# → @e1: textbox "Email"
# → @e2: textbox "Password"
# → @e3: button "Sign In"

agent-browser fill @e1 "user@example.com"
agent-browser fill @e2 "password123"
agent-browser click @e3

agent-browser snapshot -i
# → @e4: heading "Dashboard"
# → @e5: button "Logout"
```

### Form with Dropdown

```bash
agent-browser open https://app.example.com/settings
agent-browser snapshot -i
# → @e1: textbox "Display Name"
# → @e2: combobox "Language"
# → @e3: checkbox "Email notifications"
# → @e4: button "Save"

agent-browser fill @e1 "New Name"
agent-browser select @e2 "English"
agent-browser check @e3
agent-browser click @e4

agent-browser snapshot -i
# Verify: look for success message
```

### Investigating a Missing Element

```bash
agent-browser snapshot -i
# Expected "Delete" button not found

# Try including cursor-interactive elements
agent-browser snapshot -i -C
# Still not found

# Try full snapshot scoped to section
agent-browser snapshot -s ".actions-panel"
# Element found as non-interactive div

# Try scrolling — element might be below fold
agent-browser scroll down 2
agent-browser snapshot -i
```
