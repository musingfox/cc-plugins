---
name: Discord Webhook
description: >-
  This skill should be used when the user asks to "send a Discord notification",
  "notify Discord", "post to Discord", "send a message to Discord webhook",
  "alert Discord channel", or when another agent, hook, or skill needs to deliver
  a notification to a Discord channel via webhook. Provides the complete workflow
  for reading webhook configuration, formatting messages (plain text or Embed),
  and sending via HTTP POST.
---

# Discord Webhook Notification

Send messages to Discord channels via webhook HTTP POST. Supports plain text and rich Embed format with multi-webhook routing.

## Overview

Discord webhooks accept JSON payloads via HTTP POST. This skill handles:

1. **Resolve webhook URL** from environment variables or settings file
2. **Format the message** as plain text (`content`) or rich Embed
3. **Send via HTTP POST** using `curl`

## Step 1: Resolve Webhook URL

Check sources in this priority order:

### 1a: Named Webhook (when a target name is specified)

Look for environment variable `DISCORD_WEBHOOK_{NAME}` where `{NAME}` is the uppercase target name:

```bash
# Examples:
# Target "deploy" → DISCORD_WEBHOOK_DEPLOY
# Target "alerts" → DISCORD_WEBHOOK_ALERTS
```

### 1b: Default Webhook

Look for environment variable `DISCORD_WEBHOOK_URL`.

### 1c: Settings File Fallback

If no environment variable is set, read `.claude/discord-webhook.local.md` in the project root. Parse YAML frontmatter for webhook URLs:

```yaml
---
default: https://discord.com/api/webhooks/1234567890/abcdefg
deploy: https://discord.com/api/webhooks/9876543210/hijklmn
alerts: https://discord.com/api/webhooks/1111111111/opqrstu
---
```

Use the named key if a target is specified, otherwise use `default`.

### Error Handling

If no webhook URL is found after checking all sources, inform the user:

> No Discord webhook URL configured. Set one of:
> - Environment variable `DISCORD_WEBHOOK_URL` (or `DISCORD_WEBHOOK_{NAME}` for named targets)
> - `.claude/discord-webhook.local.md` with webhook URLs in YAML frontmatter

Do NOT proceed without a valid webhook URL.

## Step 2: Format the Message

### Plain Text

For simple string messages, use the `content` field:

```json
{
  "content": "Deploy v1.2.3 completed successfully"
}
```

`content` has a 2000 character limit. Truncate with `…` if exceeded.

### Embed Format

For structured information (deploy reports, error alerts, build status), use the `embeds` array:

```json
{
  "embeds": [{
    "title": "Deploy Complete",
    "description": "Version **v1.2.3** deployed to production",
    "color": 3066993,
    "fields": [
      { "name": "Environment", "value": "production", "inline": true },
      { "name": "Duration", "value": "2m 34s", "inline": true }
    ],
    "footer": { "text": "Deployed by Claude Code" },
    "timestamp": "2026-04-10T12:00:00.000Z"
  }]
}
```

### Format Selection Guidelines

| Scenario | Format | Reason |
|----------|--------|--------|
| Simple status update | Plain text | Short, no structure needed |
| Error alert with details | Embed | Structured fields, color coding |
| Build/deploy report | Embed | Multiple data points |
| Quick notification | Plain text | Minimal overhead |
| Multi-field data | Embed | Fields layout is clearer |

### Common Embed Colors

| Purpose | Color (decimal) | Hex |
|---------|----------------|-----|
| Success | `3066993` | `#2ECC71` |
| Error | `15158332` | `#E74C3C` |
| Warning | `15105570` | `#E67E22` |
| Info | `3447003` | `#3498DB` |
| Default | `9807270` | `#959B86` |

## Step 3: Send the Message

Use `curl` to POST the JSON payload:

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello from Claude Code"}' \
  "$WEBHOOK_URL"
```

### Response Handling

| HTTP Status | Meaning | Action |
|-------------|---------|--------|
| `204` | Success (no content) | Message sent successfully |
| `400` | Bad request | Check JSON payload format |
| `401` | Unauthorized | Webhook URL is invalid or revoked |
| `404` | Not found | Webhook has been deleted |
| `429` | Rate limited | Wait and retry (respect `Retry-After` header) |

On success (204), confirm to the caller that the message was sent.
On failure, report the HTTP status code and suggest corrective action.

### Rate Limiting

Discord webhooks have a rate limit of ~30 requests per minute. If sending multiple messages, add a 2-second delay between requests.

## Security Notes

- Never log or echo the full webhook URL — it contains the authentication token
- Store webhook URLs in environment variables or `.local.md` files (gitignored)
- Sanitize user-provided content before embedding in JSON to prevent injection
- Use `jq -Rs .` to safely escape strings for JSON embedding:
  ```bash
  SAFE_MSG=$(echo "$RAW_MSG" | jq -Rs .)
  ```

## Tool Selection

- Use **Bash** with `curl` for sending webhook requests (most reliable for JSON payloads)
- Use **Read** to parse `.claude/discord-webhook.local.md` settings file
- Use **Bash** with `jq` for JSON construction with dynamic values
