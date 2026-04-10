# Discord Webhook

Send Discord webhook notifications from Claude Code. Supports plain text and rich Embed format with multi-webhook routing.

## Features

- **Plain text & Embed** — auto-select or explicit format choice
- **Multi-webhook** — route to named channels via `DISCORD_WEBHOOK_{NAME}` env vars
- **Flexible config** — environment variables via `.env` file
- **Composable** — designed as a tool for other plugins, hooks, and agents to call

## Installation

```bash
/plugin install discord-webhook
```

## Configuration

Add webhook URLs to your project's `.env` file:

```bash
# Default webhook
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."

# Named webhooks for specific channels
DISCORD_WEBHOOK_DEPLOY="https://discord.com/api/webhooks/..."
DISCORD_WEBHOOK_ALERTS="https://discord.com/api/webhooks/..."
```

Make sure `.env` is in your `.gitignore` to keep webhook URLs out of version control.

## Usage

### Slash Command

```
/dc-ntfy "Deploy v1.2.3 completed"
/dc-ntfy --embed "Deploy Complete" "Version v1.2.3 deployed to production"
/dc-ntfy --to deploy "Build finished"
/dc-ntfy --embed "Error" "Build failed" --color error --field "Exit Code" "1"
```

### Natural Language (Auto-triggered)

```
"Send a Discord notification that the deploy is done"
"Notify the alerts Discord channel about this error"
"Post the build results to Discord"
```

### From Other Plugins

Other plugins, hooks, or agents can trigger the skill by including Discord notification language in their prompts or instructions.

## Components

| Component | Type | Description |
|-----------|------|-------------|
| `discord-webhook` | Skill (auto) | Core sending capability — webhook resolution, formatting, HTTP POST |
| `dc-ntfy` | Command | `/dc-ntfy` slash command for direct usage |

## Prerequisites

- `curl` (pre-installed on macOS/Linux)
- `jq` (for safe JSON construction)
