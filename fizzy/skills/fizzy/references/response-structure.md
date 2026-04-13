# Fizzy Response Structure

## Standard Response Format

All responses follow this structure:

```json
{
  "ok": true,
  "data": { ... },           // Single object or array
  "summary": "4 boards",     // Human-readable description
  "breadcrumbs": [ ... ],    // Contextual next actions (omitted when empty)
  "context": { ... },        // Location, pagination, and other context (omitted when empty)
  "meta": {}
}
```

## Summary Field Examples

| Command | Example Summary |
|---------|-----------------|
| `board list` | "5 boards" |
| `board show ID` | "Board: Engineering" |
| `card list` | "42 cards (page 1)" or "42 cards (all)" |
| `card show 123` | "Card #123: Fix login bug" |
| `search "bug"` | "7 results for \"bug\"" |
| `notification list` | "8 notifications (3 unread)" |

## Pagination

List responses with pagination:

```json
{
  "ok": true,
  "data": [ ... ],
  "summary": "10 cards (page 1)",
  "context": {
    "pagination": {
      "has_next": true,
      "next_url": "https://..."
    }
  }
}
```

Commands supporting `--all` and `--page`:
`board list`, `board closed`, `board postponed`, `board stream`, `card list`, `search`, `comment list`, `tag list`, `user list`, `notification list`, `webhook list`

## Breadcrumbs

Responses include a `breadcrumbs` array suggesting what you can do next. Each breadcrumb has:
- `action`: Short action name (e.g., "comment", "close", "assign")
- `cmd`: Ready-to-run command with actual values interpolated
- `description`: Human-readable description

```bash
fizzy card show 42 | jq '.breadcrumbs'
```

Use breadcrumbs to discover available actions without memorizing the full CLI. Values like card numbers and board IDs are pre-filled; placeholders like `<column_id>` need to be replaced.

## Create/Update Location

```json
{
  "ok": true,
  "data": { ... },
  "context": {
    "location": "/6102600/cards/579.json"
  }
}
```

## Error Handling

**Error response format:**
```json
{
  "ok": false,
  "error": "Not Found",
  "code": "not_found",
  "hint": "optional context"
}
```

**Exit codes:**

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Usage / invalid arguments |
| 2 | Not found |
| 3 | Authentication failure |
| 4 | Permission denied |
| 5 | Rate limited |
| 6 | Network error |
| 7 | API / server error |
| 8 | Ambiguous match |

**Common remediation:**

- **Exit 3 (auth):** `fizzy auth status` → `fizzy auth login TOKEN` or `fizzy setup`
- **Exit 2 (not found):** Verify the card number or resource ID is correct. Cards use NUMBER, not ID.
- **Exit 4 (permission):** Some operations require admin/owner role.
- **Exit 6 (network):** Check API URL with `fizzy auth status`.
