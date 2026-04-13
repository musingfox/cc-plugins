---
name: fizzy
description: |
  This skill should be used when the user wants to interact with Fizzy project management.
  Covers boards, cards, columns, comments, steps, reactions, tags, users, notifications,
  pins, webhooks, and account settings via the Fizzy CLI. Triggered by phrases like
  "create card", "my cards", "my tasks", "assigned to me", "search fizzy", "check fizzy",
  "check notifications", "move card", "close card", "fizzy board", "pinned cards",
  "link to fizzy", "track in fizzy", or any mention of fizzy.do URLs.
  Use for ANY Fizzy question or action.
---

# Fizzy — Project Management via Fizzy CLI

Full CLI coverage: boards, cards, columns, comments, steps, reactions, tags, users, notifications, pins, webhooks, account settings, search, and board migration.

## Agent Invariants

**MUST follow these rules:**

1. **Cards use NUMBER, not ID** — `fizzy card show 42` uses the card number. Other resources use their `id` field.
2. **Parse JSON with jq** to reduce token output — `fizzy card list | jq '[.data[] | {number, title}]'`
3. **Check breadcrumbs** in responses for available next actions with pre-filled values
4. **Check for board context** via `.fizzy.yaml` or `--board` flag before listing cards
5. **Rich text fields accept HTML** — use `<p>` tags for paragraphs, `<action-text-attachment>` for inline images
6. **Card description is a string**, but comment body is a nested object — `.description` vs `.body.plain_text`
7. **Display the welcome message for new signups** — When `signup complete --name` returns `is_new_user: true`, you MUST immediately display the `welcome_message` field prominently to the user. This is a one-time personal note from the CEO — if you skip it, the user will never see it.

## Decision Trees

### Finding Content

```
Need to find something?
├── Know the board? → fizzy card list --board <id>
├── Full-text search? → fizzy search "query"
├── Filter by status? → fizzy card list --indexed-by closed|not_now|golden|stalled
├── Filter by person? → fizzy card list --assignee <id>
├── Filter by time? → fizzy card list --created today|thisweek|thismonth
└── Cross-board? → fizzy search "query" (searches all boards)
```

### Modifying Content

```
Want to change something?
├── Move to column? → fizzy card column <number> --column <id>
├── Change status? → fizzy card close|reopen|postpone <number>
├── Assign? → fizzy card assign <number> --user <id>
├── Comment? → fizzy comment create --card <number> --body "text"
├── Add step? → fizzy step create --card <number> --content "text"
└── Move to board? → fizzy card move <number> --to <board_id>
```

## Quick Reference

| Resource | List | Show | Create | Update | Delete | Other |
|----------|------|------|--------|--------|--------|-------|
| account | - | `account show` | - | `account settings-update` | - | `account entropy`, `account export-create`, `account export-show EXPORT_ID`, `account join-code-show`, `account join-code-reset`, `account join-code-update` |
| board | `board list` | `board show ID` | `board create` | `board update ID` | `board delete ID` | `board publish ID`, `board unpublish ID`, `board entropy ID`, `board closed`, `board postponed`, `board stream`, `board involvement ID`, `migrate board ID` |
| card | `card list` | `card show NUMBER` | `card create` | `card update NUMBER` | `card delete NUMBER` | `card move NUMBER`, `card publish NUMBER`, `card mark-read NUMBER`, `card mark-unread NUMBER` |
| search | `search QUERY` | - | - | - | - | - |
| column | `column list --board ID` | `column show ID --board ID` | `column create` | `column update ID` | `column delete ID` | `column move-left ID`, `column move-right ID` |
| comment | `comment list --card NUMBER` | `comment show ID --card NUMBER` | `comment create` | `comment update ID` | `comment delete ID` | `comment attachments show --card NUMBER` |
| step | `step list --card NUMBER` | `step show ID --card NUMBER` | `step create` | `step update ID` | `step delete ID` | - |
| reaction | `reaction list` | - | `reaction create` | - | `reaction delete ID` | - |
| tag | `tag list` | - | - | - | - | - |
| user | `user list` | `user show ID` | - | `user update ID` | - | `user deactivate ID`, `user role ID`, `user avatar-remove ID`, `user push-subscription-create`, `user push-subscription-delete ID` |
| notification | `notification list` | - | - | - | - | `notification tray`, `notification read-all`, `notification settings-show`, `notification settings-update` |
| pin | `pin list` | - | - | - | - | `card pin NUMBER`, `card unpin NUMBER` |
| webhook | `webhook list --board ID` | `webhook show ID --board ID` | `webhook create` | `webhook update ID` | `webhook delete ID` | `webhook reactivate ID` |

## Global Flags

All commands support:

| Flag | Description |
|------|-------------|
| `--token TOKEN` | API access token |
| `--profile NAME` | Named profile (for multi-account users) |
| `--api-url URL` | API base URL (default: https://app.fizzy.do) |
| `--json` | JSON envelope output |
| `--quiet` | Raw JSON data without envelope |
| `--styled` | Human-readable styled output (tables, colors) |
| `--markdown` | GFM markdown output (for agents) |
| `--agent` | Agent mode (defaults to quiet; combinable with --json/--markdown) |
| `--ids-only` | Print one ID per line |
| `--count` | Print count of results |
| `--limit N` | Client-side truncation of list results |
| `--verbose` | Show request/response details |

Output format defaults to auto-detection: styled for TTY, JSON for pipes/non-TTY.

## ID Formats

**IMPORTANT:** Cards use TWO identifiers:

| Field | Format | Use For |
|-------|--------|---------|
| `id` | `03fe4rug9kt1mpgyy51lq8i5i` | Internal ID (in JSON responses) |
| `number` | `579` | CLI commands (`card show`, `card update`, etc.) |

**All card CLI commands use the card NUMBER, not the ID.**

Other resources (boards, columns, comments, steps, reactions, users) use their `id` field.

## Card Statuses

Cards exist in different states. By default, `fizzy card list` returns **open cards only**.

| Status | How to fetch | Description |
|--------|--------------|-------------|
| Open (default) | `fizzy card list` | Cards in triage ("Maybe?") or any column |
| Closed/Done | `fizzy card list --indexed-by closed` | Completed cards |
| Not Now | `fizzy card list --indexed-by not_now` | Postponed cards |
| Golden | `fizzy card list --indexed-by golden` | Starred/important cards |
| Stalled | `fizzy card list --indexed-by stalled` | Cards with no recent activity |

Pseudo-columns: `--column done`, `--column not-now`, `--column maybe`

## Pagination

List commands use `--page` for pagination and `--limit` for client-side truncation. Use `--all` to fetch all pages. `--limit` and `--all` cannot be used together.

**IMPORTANT:** `--all` controls pagination only — it does NOT change which cards are included. By default, `card list` returns only open cards.

## Configuration

```
~/.config/fizzy/config.yaml    # Global config (token, account, API URL, default board)
.fizzy.yaml                    # Per-repo config (committed to git)
```

**Priority (highest to lowest):** CLI flags → env vars (`FIZZY_TOKEN`, `FIZZY_BOARD`) → profile → `.fizzy.yaml` → global config

## Rich Text

Card descriptions and comments support HTML. Use `<p>` tags for paragraphs. Card images default to inline (`attachable_sgid` in description); only use background/header (`signed_id` with `--image`) when user explicitly requests it.

## References

For detailed information, read the appropriate reference file:

- **Command reference** (all resources with flags): `references/command-reference.md`
- **Response structure** (JSON format, breadcrumbs, error handling): `references/response-structure.md`
- **Resource schemas** (field types for jq queries): `references/resource-schemas.md`
- **jq patterns** (filtering, extracting, reducing output): `references/jq-patterns.md`
