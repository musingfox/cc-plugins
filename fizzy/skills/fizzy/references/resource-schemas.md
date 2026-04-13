# Fizzy Resource Schemas

Complete field reference for all resources. Use these exact field paths in jq queries.

## Card Schema

**IMPORTANT:** `card list` and `card show` return different fields. `steps` only in `card show`.

| Field | Type | Description |
|-------|------|-------------|
| `number` | integer | **Use this for CLI commands** |
| `id` | string | Internal ID (in responses only) |
| `title` | string | Card title |
| `description` | string | Plain text content (**NOT an object**) |
| `description_html` | string | HTML version with attachments |
| `status` | string | Usually "published" for active cards |
| `closed` | boolean | true = card is closed |
| `golden` | boolean | true = starred/important |
| `image_url` | string/null | Header/background image URL |
| `has_attachments` | boolean | true = card has file attachments |
| `created_at` | timestamp | ISO 8601 |
| `last_active_at` | timestamp | ISO 8601 |
| `url` | string | Web URL |
| `comments_url` | string | Comments endpoint URL |
| `board` | object | Nested Board |
| `creator` | object | Nested User |
| `assignees` | array | Array of User objects |
| `tags` | array | Array of Tag objects |
| `steps` | array | **Only in `card show`**, not in list |

## Board Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Board ID (use for CLI commands) |
| `name` | string | Board name |
| `all_access` | boolean | All users have access |
| `auto_postpone_period_in_days` | integer | Days before cards are auto-postponed |
| `created_at` | timestamp | ISO 8601 |
| `url` | string | Web URL |
| `creator` | object | Nested User |

## Account Settings Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Account ID |
| `name` | string | Account name |
| `cards_count` | integer | Total cards in account |
| `auto_postpone_period_in_days` | integer | Account-level default auto-postpone period |
| `created_at` | timestamp | ISO 8601 |

## User Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | User ID (use for CLI commands) |
| `name` | string | Display name |
| `email_address` | string | Email |
| `role` | string | "owner", "admin", or "member" |
| `active` | boolean | Account is active |
| `created_at` | timestamp | ISO 8601 |
| `url` | string | Web URL |

## Comment Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Comment ID (use for CLI commands) |
| `body` | object | **Nested object with html and plain_text** |
| `body.html` | string | HTML content |
| `body.plain_text` | string | Plain text content |
| `created_at` | timestamp | ISO 8601 |
| `updated_at` | timestamp | ISO 8601 |
| `url` | string | Web URL |
| `creator` | object | Nested User |
| `card` | object | Nested {id, url} |

## Step Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Step ID (use for CLI commands) |
| `content` | string | Step text |
| `completed` | boolean | Completion status |

## Column Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Column ID or pseudo ID ("not-now", "maybe", "done") |
| `name` | string | Display name |
| `kind` | string | "not_now", "triage", "closed", or custom |
| `pseudo` | boolean | true = built-in column |

## Tag Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Tag ID |
| `title` | string | Tag name |
| `created_at` | timestamp | ISO 8601 |

## Reaction Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Reaction ID (use for CLI commands) |
| `content` | string | Emoji |
| `reacter` | object | Nested User |

## Webhook Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Webhook ID |
| `name` | string | Webhook name |
| `payload_url` | string | Destination URL |
| `active` | boolean | Whether webhook is active |
| `signing_secret` | string | Secret for verifying payloads |
| `subscribed_actions` | array | List of subscribed event actions |
| `created_at` | timestamp | ISO 8601 |

## Identity Schema

| Field | Type | Description |
|-------|------|-------------|
| `accounts` | array | Array of Account objects |
| `accounts[].id` | string | Account ID |
| `accounts[].name` | string | Account name |
| `accounts[].slug` | string | Account slug |
| `accounts[].user` | object | Your User in this account |

## Key Schema Differences

| Resource | Text Field | HTML Field |
|----------|------------|------------|
| Card | `.description` (string) | `.description_html` (string) |
| Comment | `.body.plain_text` (nested) | `.body.html` (nested) |
