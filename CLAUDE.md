# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a **Claude Code Plugin Marketplace** containing multiple independent plugins. Each plugin follows the Claude Code plugin architecture with standardized component types.

## Architecture Principles

### Plugin Structure Pattern

Every plugin follows this canonical structure:

```
plugin-name/
├── .claude-plugin/
│   └── plugin.json          # Manifest: metadata, entry points
├── commands/                # User-invocable slash commands (/command-name)
│   └── *.md                 # YAML frontmatter + markdown instructions
├── skills/                  # Natural language triggered capabilities
│   └── skill-name/
│       └── SKILL.md         # YAML frontmatter + skill logic
├── agents/                  # Autonomous sub-agents
│   └── *.md                 # YAML frontmatter + agent system prompt
├── hooks/                   # Event-driven automation
│   └── hooks.json           # Hook definitions
└── README.md                # User documentation
```

### Component Types

- **Commands** (`/command-name`): Direct user invocation via slash syntax
- **Skills**: Automatically triggered by natural language patterns
- **Agents**: Autonomous sub-agents spawned via Task tool
- **Hooks**: Event listeners (PreToolUse, PostToolUse, SessionStart, etc.)

### Marketplace Architecture

The root `.claude-plugin/marketplace.json` defines the marketplace catalog. Plugins are discovered via the `plugins` array, where each entry specifies:
- `name`: Plugin identifier
- `source`: Relative path to plugin directory
- `description`: One-line summary

## Plugin Categories

### 1. OMT (One Man Team)
**Location**: `omt/`
**Purpose**: Agent-First development workflow with Contract-First design and autonomous execution

**Key Components**:
- **5 Core Agents** (`agents/`):
  - `hive.md` - Consensus builder and analysis (Sonnet) — dispatched by `/omt`
  - `pm.md` - Requirements management (Haiku)
  - `arch.md` - API-First architecture design (Sonnet)
  - `dev.md` - TDD implementation (Sonnet)
  - `reviewer.md` - Code review and quality validation (Sonnet)

- **Commands** (`commands/`):
  - `/omt` - Full orchestration — dispatches all agents, presents consensus, executes lifecycle (primary entry point)
  - `/init-agents` - Initialize agent workspace
  - `/git-commit` - Emergency manual commit
  - `/help` - Command reference

- **Skills** (`skills/`):
  - `contract-validation` - Validate agent input/output contracts

- **Contracts** (`contracts/`):
  - `hive.json`, `pm.json`, `arch.json`, `dev.json`, `reviewer.json` - Agent contract definitions

- **Library** (`lib/`):
  - `contract-validator.ts`, `state-manager.ts` - Runtime utilities

- **CLI** (`bin/`):
  - `cli.ts` - Bun CLI for workspace management (init, validate, status)

**Workflow**: `/omt "goal"` → @pm (requirements) → @arch (architecture) → @hive (consensus analysis) → Human approves → @dev/@reviewer execution loop → Completion/Escalation

### 2. Viz (Markdown & Mermaid Renderer)
**Location**: `viz/`
**Purpose**: Render markdown documents and Mermaid diagrams as formatted HTML pages

**Key Components**:
- `/view-doc [file]` command — render any markdown file as HTML with syntax highlighting, math, diagrams
- `/diagram` command — interactive diagram generator, outputs HTML by default
- `doc-render` skill — auto-triggers when content needs HTML rendering
- `mermaid-display` skill — auto-triggers when diagrams requested (HTML default, PNG/SVG on explicit request)
- `mermaid-theme` skill — configure diagram color schemes (8 built-in: Tokyo Night, Nord, Catppuccin, etc.)
- `viz-router` skill — routes editing requests to optimal method based on terminal environment
- `collab-edit` skill — internal skill for Ghostty terminal split editing (invoked by viz-router)
- Zero runtime dependencies for HTML output (CDN libraries: marked.js, DOMPurify, Mermaid.js, Highlight.js, KaTeX, AOS)
- PNG/SVG fallback via `mmdc` or `bunx @mermaid-js/mermaid-cli`

### 3. Jujutsu (jj) VCS Helper
**Location**: `jj/`
**Purpose**: Workflow commands, natural language VCS operations, and Git-to-jj mental model translation

**Key Components**:
- **Commands** (`commands/`):
  - `/jj-status` - Rich status overview — working copy, log, bookmarks, conflicts
  - `/jj-sync` - Sync workflow — fetch all remotes, rebase onto trunk, report conflicts
  - `/jj-submit [message]` - Submit workflow — describe, new, bookmark, push
  - `/jj-clean` - Clean up empty/abandoned changes with confirmation
  - `/jj-undo` - Undo with preview — browse operation log, undo or restore

- **Skills** (`skills/`):
  - `jj-workflow` - Natural language VCS operations (split, squash, rebase, etc.)
  - `git-to-jj` - Translates Git terminology to jj equivalents in jj repos

**Auto-Detection**: Detects colocated (`.jj` + `.git`) vs native jj (`.jj` only) repositories automatically.

### 4. Apple Podcasts
**Location**: `apple-podcasts/`
**Purpose**: Fetch Apple Podcasts episode audio download URLs via iTunes API and RSS feeds

**Key Components**:
- `apple-podcasts-fetch` skill — Auto-triggered on Apple Podcasts URLs or download requests
- Three-step pipeline: Parse URL → iTunes Lookup API → RSS feed `<enclosure>` extraction
- No browser or scraping required — pure HTTP API workflow

### 5. Context Flow (Experimental)
**Location**: `context-flow/`
**Purpose**: Experimental agentic workflow based on the Context + Goal + Tools principle

**Design Philosophy**: Agents are NOT defined by roles (architect, PM, developer). Each agent is defined by three things:
- **Context**: What information it receives (and what it does NOT receive)
- **Goal**: What output it must produce (one clear sentence)
- **Tools**: What actions it can take (structural boundary via frontmatter)

**Key Components**:
- **Command** (`commands/`):
  - `/cf "goal"` - Orchestrator that manages the pipeline with Agent Teams default for research & review
  - Supports `--fast` (speed-optimized), `--deep` (maximum quality), and per-stage overrides (`--plan=pro`)

- **12 Agents** (`agents/`), 4 stages × 3 model tiers (lite/standard/pro):
  - `research[-lite|-pro].md` - Context: goal + working directory → Output: capability inventory
  - `plan[-lite|-pro].md` - Context: compressed goal + research output + optional direction → Output: contracts + test cases
  - `implement[-lite|-pro].md` - Context: contracts + test cases only → Output: passing implementation
  - `review[-lite|-pro].md` - Context: contracts + git diff → Output: pass/fail verdict

**Model Tier System**:
- `lite` = Haiku (speed), `standard` = Sonnet (balanced, default), `pro` = Opus (deep reasoning)
- Three modes with preset tier mappings per stage:

| Stage | fast | default | deep |
|-------|------|---------|------|
| research | lite | standard | pro |
| plan | standard | pro | pro |
| implement | lite | standard | standard |
| review | lite | standard | standard |

- Per-stage overrides: `/cf --fast --plan=pro "goal"` (fast mode but plan uses opus)
- Orchestrator may auto-upgrade to `deep` when goal complexity warrants it

**Workflow**: `/cf "goal"` → [research — Agent Teams] → validate → [plan] → validate → HUMAN GATE → [implement] (parallel if independent) → validate → [review — Agent Teams] → verdict

**Key Features**:
- **Dynamic model selection**: Orchestrator selects agent model tier per stage based on mode, overrides, and complexity assessment
- **Agent Teams by default**: Research and Review phases use multi-perspective Agent Teams by default; skip to single agent only for trivially simple goals or `--fast` mode
- **Agent Teams model mixing**: Lead teammate uses resolved tier, additional teammates use one tier lower (minimum standard)
- **Native + fallback**: native Agent Teams when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is set; subagent parallel exploration as fallback
- **Parallel implement**: independent contracts dispatched to separate agents with worktree isolation
- Orchestrator controls context flow: what each agent sees is explicitly specified, not implicit
- Contract validation between phases: each phase's output must meet structural requirements before flowing to the next
- Contracts are passed AS context to agents (binding constraint), not described in prompts (suggestion)

### 6. gog (Google Workspace)
**Location**: `gog/`
**Purpose**: Skills for interacting with Google Workspace services via the `gog` CLI (gogcli)

**Key Components**:
- **Skills** (`skills/`):
  - `gog-gmail` - Gmail operations: search, send, reply, threads, labels, drafts, attachments
  - `gog-calendar` - Calendar operations: events, create, update, delete, freebusy, conflicts, RSVP, focus-time
  - `gog-drive` - Drive operations: list, search, upload, download, share, copy, move, permissions

**Prerequisites**: `gog` CLI installed (`brew install gogcli`) and authenticated (`gog auth add <email>`)

**Safety Pattern**: All destructive operations (send, delete, share) require `--dry-run` preview before execution.

### 7. MarkItDown
**Location**: `markitdown/`
**Purpose**: Convert non-plain-text files to Markdown using Microsoft's MarkItDown

**Key Components**:
- **Skills** (`skills/`):
  - `markitdown-read` - Auto-triggered when reading PDF, Word, PowerPoint, Excel, images, audio, HTML, EPUB, CSV, JSON, XML, ZIP files
- **Commands** (`commands/`):
  - `convert` - Explicit file-to-markdown conversion with output file support

**Prerequisites**: `pip install markitdown` or `uv tool install markitdown`

### 8. Readability
**Location**: `readability/`
**Purpose**: Terminal text formatting enhancement

**Key Components**:
- `readable-text-formatting` skill - Automatic markdown table/ASCII art alignment

### 9. ADR (Architecture Decision Records)
**Location**: `adr/`
**Purpose**: ADR lifecycle management with MADR 4.0 format and cross-reference consistency enforcement

**Key Components**:
- **Skills** (`skills/`):
  - `adr` - Full lifecycle management: create, list, supersede, deprecate, check consistency. Auto-detects ADR directory, auto-numbers with 4-digit zero-padding, uses MADR 4.0 template. Core feature: supersession with 4-layer repo-wide cross-reference scan and categorized update strategy.
  - `adr-ref-guard` - Manual check skill to audit markdown files for references to superseded or deprecated ADRs. Never auto-replaces.

**Supersession 4-Layer Search**: filename reference, ADR-N marker, markdown link, title substring — with per-category update strategy (auto-update ADRs/docs, add marker to source code, skip config).

**No External Dependencies**: Pure markdown instruction files.

### 10. Hook Guard
**Location**: `hook-guard/`
**Purpose**: One-stop hook setup assistant — detect project environment, generate Claude Code hooks and git pre-commit scripts

**Key Components**:
- **Skills** (`skills/`):
  - `setup` - Main workflow: detect language/toolchain/VCS → recommend configuration → generate all hook files (`.githooks/`, `.claude/settings.local.json`)
  - `doctor` - Health check: verify hook files, permissions, tool availability, configuration integrity
  - `update` - Update installed hooks: re-detect environment, diff with existing, apply changes

**Generated Output**:
- `.githooks/pre-commit` — Shell script with security checks (secrets, large files, merge conflicts, etc.), file integrity checks, structure/convention checks, and CLAUDECODE skip logic for lint/format/test
- `.githooks/commit-msg` — Conventional commits format validation
- `.claude/settings.local.json` — Claude Code hooks (PostToolUse lint/format, PreToolUse test gate) + `CLAUDECODE=1` env var

**Supported Languages**: Python (ruff/flake8/pytest), JS/TS (eslint/prettier/vitest), Rust (clippy/rustfmt/cargo test), Go (golangci-lint/gofmt/go test)

**Key Design**: Uses `core.hooksPath` pointing to `.githooks/` for team-shareable hooks. CLAUDECODE env var enables skip logic so pre-commit doesn't duplicate what Claude Code hooks already handle.

### 11. Fizzy
**Location**: `fizzy/`
**Purpose**: Interact with Fizzy via the Fizzy CLI for project management

**Key Components**:
- **Skills** (`skills/`):
  - `fizzy` - Full CLI wrapper: boards, cards (20 subcommands), columns, comments, steps, reactions, tags, users, notifications, pins, webhooks, account settings, search, file uploads, board migration

**Prerequisites**: `fizzy` CLI installed and authenticated (`fizzy setup`)

### 12. Obsidian Workspace
**Location**: `obsidian-workspace/`
**Purpose**: Personal Obsidian vault productivity — quick capture, long-form notes, and project management through Obsidian CLI

**Plugin identifier**: `obw` (drives `/obw:*` commands and `obw:*` skill namespaces)

**Key Components**:
- **Commands** (`commands/`):
  - `/obw:init` - Interactive `.obsidian.yaml` setup (vault picker, journal/note/pm sections)
  - `/obw:cap <text>` - Quick capture to today's journal with timestamp; `#tag` extraction
  - `/obw:note <title>` - Create long-form note; `--folder` override, filename strategies, `--tag` frontmatter
  - `/obw:pm [action]` - Task/doc/ADR lifecycle (replaces legacy `/obm`)
- **Skills** (`skills/`):
  - `cap` - Quick journal capture logic; natural-language triggered
  - `note` - Long-form note creation; natural-language triggered
  - `pm` - Task/doc/ADR lifecycle and Dataview dashboards

**Prerequisites**: Obsidian app running + CLI enabled, `.obsidian.yaml` config in project root

**Configuration**: `.obsidian.yaml` unified schema:
- Top-level `vault` (vault name, shared across all /obw commands)
- `journal`: folder, filename pattern, section heading, timestamp, tag_frontmatter
- `note`: default_folder, filename_strategy (`title` | `slug` | `timestamp-title`)
- `pm`: project identifier (optional; omit to disable `/obw:pm`)

**Vault Structure** (PM only): `pm/{project}/{tasks,archive,docs}/` with dashboards (Dataview) and templates at `pm/templates/`

### 13. Discord Webhook
**Location**: `discord-webhook/`
**Purpose**: Send Discord webhook notifications with plain text or rich Embed format

**Key Components**:
- **Skills** (`skills/`):
  - `discord-webhook` - Core sending capability: sources `.env`, resolves webhook URL from env vars, formats message (plain text or Embed), HTTP POST via curl. Auto-triggered on Discord notification requests.
- **Commands** (`commands/`):
  - `dc-ntfy` - Slash command (`/dc-ntfy "message"`) for direct usage. Supports `--embed`, `--to`, `--color`, `--field` flags.

**Configuration**: `.env` file with `DISCORD_WEBHOOK_URL` (default) and/or `DISCORD_WEBHOOK_{NAME}` (named targets)

**Prerequisites**: `curl`, `jq`

### 14. Agent Browser
**Location**: `agent-browser/`
**Purpose**: Browser automation, Playwright test writing, and debug-to-test workflows

**Key Components**:
- **Skills** (`skills/`):
  - `agent-browser` - Ref-based browser automation for AI agents via agent-browser CLI (browse, click, fill, screenshot)
  - `playwright` - Write and structure Playwright E2E tests with high-precision locator strategies
  - `web-test` - Debug-to-test workflow: explore pages with agent-browser, diagnose issues, generate Playwright regression tests

**Prerequisites**: `agent-browser` CLI (`npm install -g agent-browser`), `@playwright/test` for test generation

## Development Workflows

### Documentation Sync Rule

When adding or modifying any plugin, always check whether the following files need updating:
- **`README.md`** (root) — Plugin listing, features, installation, structure tree
- **`CLAUDE.md`** (root) — Plugin Categories section, install commands, file locations

Both files must stay in sync with actual plugin state. This applies to new plugins, renamed/removed components, and significant feature changes.

### Adding a New Plugin

1. Create plugin directory with canonical structure (see "Plugin Structure Pattern")
2. Write `plugin.json` manifest with metadata
3. Add entry to `.claude-plugin/marketplace.json`
4. Document in root `README.md` (following existing format)
5. Add plugin section to `CLAUDE.md` under "Plugin Categories"
6. Test installation: `/plugin install plugin-name`

### Modifying Plugin Components

**Commands** (`.md` files in `commands/`):
- YAML frontmatter: `description`, `argument-hint`, `allowed-tools`
- Body: Markdown instructions for Claude to execute

**Skills** (`SKILL.md` in `skills/`):
- YAML frontmatter: `description`, `when-to-use`, `name`
- Body: System prompt for skill execution

**Agents** (`.md` files in `agents/`):
- YAML frontmatter: `description`, `model`, `color`
- Body: Agent system prompt and behavior definition

### Testing Plugins

Commands are tested by direct invocation:
```
/command-name [args]
```

Skills are tested via natural language:
```
"Create a flowchart showing..." (triggers mermaid-display)
```

Agents are tested via Task tool or agent-specific workflows (e.g., OMT's `/init-agents`).

## File Locations

- **Plan files**: `~/.claude/plans/*.md` (read by viz)
- **Viz HTML output**: `/tmp/viz/{project-name}/{name}-{timestamp}.html` (per-project subdirectory)
- **Agent workspace** (OMT): `.agents/` directory
- **Context-flow session**: `/tmp/context-flow-{timestamp}/` (goal.md, research.md, plan.md, review.md)

### Remote Access (Viz)

All viz output goes to `/tmp/viz/`, organized by project name. For remote access from Tailnet devices:

```bash
python3 -m http.server 18080 -d /tmp/viz/ -b 0.0.0.0 &
```

Access at `http://{tailscale-ip}:18080/{project-name}/{file}.html`.

## Critical Implementation Details

### viz UTF-8 Handling
Uses Base64 encoding + TextDecoder to handle multi-byte characters (Chinese, etc.):
```javascript
function base64DecodeUTF8(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
}
```

### viz Mermaid CLI Detection (PNG/SVG)
Priority order: `mmdc` (global) → `bunx @mermaid-js/mermaid-cli` (fallback)

### OMT Agent Workspace
`.agents/` is the clean development workspace. Infrastructure lives in `.agents/.state/` (gitignored):
- `goal.md` — Human goal
- `outputs/` — Agent output files (pm.md, arch.md, hive-consensus.md, hive.md, dev/, reviews/)
- `.state/` — config.json, workflow-state.json, tasks/

CLI management: `bun run omt/bin/cli.ts <init|validate|status>`

### OMT Contract-First Design
Agent contracts are defined in `omt/contracts/`:
- `pm.json` - @pm input/output contract
- `arch.json` - @arch input/output contract
- `dev.json` - @dev → @reviewer execution contract
- `hive.json` - @hive consensus analysis contract

State synchronization is managed by the `/omt` orchestrator during workflow execution.

## Marketplace Installation

Users install the marketplace via:
```bash
/plugin marketplace add musingfox/cc-plugins
```

Then install individual plugins:
```bash
/plugin install omt
/plugin install viz
/plugin install readability
/plugin install jj
/plugin install apple-podcasts
/plugin install context-flow
/plugin install gog
/plugin install markitdown
/plugin install adr
/plugin install hook-guard
/plugin install fizzy
/plugin install obsidian-workspace
/plugin install discord-webhook
```

## Version Management

Claude Code uses the `version` field in each plugin's `plugin.json` to determine whether updates are available. **If the version doesn't change, users' cached copies won't update.**

### Auto-Bump Pre-Commit Hook

A pre-commit hook at `.githooks/pre-commit` automatically bumps the **patch** version of any plugin whose files are staged for commit.

**Setup** (required once per clone):
```bash
git config core.hooksPath .githooks
```

**Behavior**:
- Detects which plugin directories have staged changes
- Bumps `X.Y.Z` → `X.Y.(Z+1)` in `plugin.json`
- Re-stages the modified `plugin.json`
- Skips if `plugin.json` is already staged (manual bump takes priority)

**Manual version bumps** (for minor/major changes):
- Edit `plugin.json` version directly and stage it — the hook will skip auto-bump
- Use **minor** bump (`X.Y+1.0`) for new features
- Use **major** bump (`X+1.0.0`) for breaking changes

## Design Philosophy

- **Single Responsibility**: Each plugin focuses on one specific capability
- **Zero Dependencies**: Prefer CDN libraries (viz) or universal tools (bunx for mermaid-cli)
- **Composability**: Plugins work independently but complement each other
- **Minimal Friction**: Commands and skills integrate seamlessly into natural workflows
