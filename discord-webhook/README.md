# Discord Webhook

Send Discord webhook notifications from Claude Code. Supports plain text and rich Embed format with multi-webhook routing.

## Features

- **Plain text & Embed** — auto-select or explicit format choice
- **Multi-webhook** — route to named channels via `DISCORD_WEBHOOK_{NAME}` env vars
- **Flexible config** — environment variables or `.claude/discord-webhook.local.md` settings file
- **Composable** — designed as a tool for other plugins, hooks, and agents to call

## Installation

```bash
/plugin install discord-webhook
```

## Configuration

### Option 1: Environment Variables (Recommended)

```bash
# Default webhook
export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."

# Named webhooks for specific channels
export DISCORD_WEBHOOK_DEPLOY="https://discord.com/api/webhooks/..."
export DISCORD_WEBHOOK_ALERTS="https://discord.com/api/webhooks/..."
```

### Option 2: Settings File

Create `.claude/discord-webhook.local.md` in your project root:

```yaml
---
default: https://discord.com/api/webhooks/1234567890/abcdefg
deploy: https://discord.com/api/webhooks/9876543210/hijklmn
alerts: https://discord.com/api/webhooks/1111111111/opqrstu
---
```

Add `.claude/*.local.md` to `.gitignore` to keep webhook URLs out of version control.

## Usage

### Slash Command

```
/discord-notify "Deploy v1.2.3 completed"
/discord-notify --embed "Deploy Complete" "Version v1.2.3 deployed to production"
/discord-notify --to deploy "Build finished"
/discord-notify --embed "Error" "Build failed" --color error --field "Exit Code" "1"
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
| `discord-notify` | Skill (user-invoked) | `/discord-notify` slash command for direct usage |

## Prerequisites

- `curl` (pre-installed on macOS/Linux)
- `jq` (for safe JSON construction)
