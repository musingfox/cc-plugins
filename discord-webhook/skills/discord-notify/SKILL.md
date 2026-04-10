---
name: discord-notify
description: Send a plain text or rich Embed message to a Discord channel via webhook. Supports named webhook targets and color presets.
argument-hint: "<message>" or --embed "<title>" "<description>"
allowed-tools:
  - Bash
  - Read
---

# Discord Notify

Send a notification to a Discord channel via webhook.

## Arguments

Parse the user's arguments to determine message format:

- **Plain text**: `/discord-notify "Deploy complete"` → send as `content`
- **Embed with title**: `/discord-notify --embed "Title" "Description"` → send as Embed
- **Named target**: `/discord-notify --to deploy "message"` → send to `DISCORD_WEBHOOK_DEPLOY`
- **Embed with fields**: `/discord-notify --embed "Title" "Desc" --field "Key" "Value"` → Embed with fields
- **Color override**: `/discord-notify --color success "message"` → apply color preset

If no arguments are provided, ask the user what message to send.

## Execution

Follow the **discord-webhook** skill workflow for webhook URL resolution, payload formatting, and sending:

1. **Resolve webhook URL** — if `--to {name}` is specified, resolve the named webhook; otherwise use default. See the discord-webhook skill for the full priority chain (env var → settings file).

2. **Build payload** — based on parsed arguments:
   - No `--embed` flag → plain text `content` payload
   - With `--embed` → Embed payload with title, description, optional fields
   - Apply `--color` preset if specified: `success` → `3066993`, `error` → `15158332`, `warning` → `15105570`, `info` → `3447003` (default)
   - Use `jq` for safe JSON construction (see discord-webhook skill for details)

3. **Send** — POST to the resolved webhook URL using `curl`. Handle response per discord-webhook skill guidance.

4. **Report result** — keep output concise:
   - `204` → "Discord notification sent."
   - `4xx` → report error with status code and guidance
   - `429` → report rate limit, suggest waiting
