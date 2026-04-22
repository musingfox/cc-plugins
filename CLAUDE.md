# CLAUDE.md

Guidance for Claude Code when working in this repo.

## Overview

**Claude Code Plugin Marketplace** — multiple independent plugins following the Claude Code plugin architecture.

## Plugin Structure

```
plugin-name/
├── .claude-plugin/plugin.json    # Manifest
├── commands/*.md                 # /command-name (YAML frontmatter + instructions)
├── skills/<name>/SKILL.md        # Natural-language triggered
├── agents/*.md                   # Task-tool sub-agents
├── hooks/hooks.json              # Event hooks
└── README.md
```

**Component frontmatter**:
- Commands: `description`, `argument-hint`, `allowed-tools`
- Skills: `description`, `when-to-use`, `name`
- Agents: `description`, `model`, `color`

**Marketplace catalog**: root `.claude-plugin/marketplace.json` lists each plugin with `name`, `source`, `description`.

## Plugins

| Plugin | Purpose |
|--------|---------|
| `omt/` | Agent-First workflow with Contract-First design (`/omt`, 5 agents) |
| `viz/` | Render markdown/Mermaid/plans as HTML |
| `jj/` | Jujutsu VCS workflow + Git→jj translation |
| `apple-podcasts/` | Fetch episode audio URLs via iTunes API |
| `context-flow/` | Experimental Context+Goal+Tools pipeline (`/cf`) |
| `gog/` | Google Workspace (Gmail, Calendar, Drive) via `gog` CLI |
| `markitdown/` | Convert non-text files to Markdown |
| `readability/` | Terminal text/table formatting |
| `adr/` | ADR lifecycle (MADR 4.0) + cross-ref consistency |
| `hook-guard/` | Generate Claude Code hooks + git pre-commit scripts |
| `fizzy/` | Fizzy CLI wrapper for project management |
| `obsidian-workspace/` | Obsidian vault productivity (`/obw:*`) |
| `discord-webhook/` | Discord webhook notifications |
| `agent-browser/` | Browser automation + Playwright test generation |

Details live in each plugin's `README.md` and `plugin.json`.

## Workflows

### Documentation Sync

When adding/modifying a plugin, keep in sync:
- Root `README.md` — plugin listing, installation
- Root `CLAUDE.md` — plugin table above

### Adding a Plugin

1. Create dir with canonical structure
2. Write `plugin.json`
3. Add entry to `.claude-plugin/marketplace.json`
4. Update root `README.md` and this file
5. Test: `/plugin install <name>`

## Version Management

Claude Code uses `plugin.json` `version` to detect updates. **No version bump → no cache refresh.**

**Auto-bump pre-commit hook** (`.githooks/pre-commit`) bumps patch version for any plugin with staged changes.

Setup once per clone:
```bash
git config core.hooksPath .githooks
```

For manual minor/major bumps, edit `plugin.json` and stage it — the hook skips auto-bump.

## Marketplace Install

```bash
/plugin marketplace add musingfox/cc-plugins
/plugin install <plugin-name>
```

## Design Philosophy

- **Single Responsibility** — one capability per plugin
- **Zero Dependencies** — prefer CDN libraries
- **Composability** — plugins independent but complementary
