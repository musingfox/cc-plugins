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
  - `pm.md` - Requirements management (Haiku)
  - `arch.md` - API-First architecture design (Sonnet)
  - `coord-exec.md` - Agent coordination and dispatch (Sonnet)
  - `dev.md` - TDD implementation (Sonnet)
  - `reviewer.md` - Code review + git commit authority (Sonnet)

- **Commands** (`commands/`):
  - `/init-agents` - Initialize agent workspace
  - `/approve` - Review important changes
  - `/git-commit` - Emergency manual commit
  - `/help` - Command reference

- **Skills** (`skills/`):
  - `contract-validation` - Validate agent input/output contracts

- **Contracts** (`contracts/`):
  - `pm.json`, `arch.json`, `dev.json` - Agent contract definitions

- **Hooks** (`hooks/`):
  - `hooks.json` - PostToolUse hook on Write/Edit triggers `state-sync.sh`

- **Library** (`lib/`):
  - `contract-validator.ts`, `state-manager.ts` - Runtime utilities

**Workflow**: Triangle Consensus (Human ↔ @pm ↔ @arch) → Autonomous Execution (@coord-exec dispatches @dev/@reviewer) → Completion/Escalation

### 2. Mermaid Visualization
**Location**: `mermaid-viz/`
**Purpose**: Interactive diagram generation as PNG/SVG images with theme support

**Key Components**:
- `/diagram` command - Interactive diagram creation wizard
- `mermaid-display` skill - Automatic rendering when diagrams requested
- `mermaid-theme` skill - Configure color themes (8 built-in schemes: Tokyo Night, Nord, Catppuccin, Dracula, etc.)
- Uses `mmdc` (if installed) or `npx @mermaid-js/mermaid-cli` as fallback
- Environment variables: `MERMAID_THEME`, `MERMAID_BG`, `MERMAID_WIDTH`, `MERMAID_COLOR_SCHEME`, etc.

### 3. Plan Visualizer
**Location**: `plan-viz/`
**Purpose**: Render plan files (`~/.claude/plans/*.md`) as HTML

**Key Components**:
- `/view-plan [filename]` command
- Zero dependencies (CDN libraries: marked.js, DOMPurify, Mermaid.js)
- Base64 encoding for content safety
- UTF-8 support via TextDecoder API

### 4. Readability
**Location**: `readability/`
**Purpose**: Terminal text formatting enhancement

**Key Components**:
- `readable-text-formatting` skill - Automatic markdown table/ASCII art alignment

### 5. Thinking
**Location**: `thinking/`
**Purpose**: Decision-making frameworks

**Key Components**:
- `scenario-thinking` skill - Scenario-driven design methodology

## Development Workflows

### Adding a New Plugin

1. Create plugin directory with canonical structure (see "Plugin Structure Pattern")
2. Write `plugin.json` manifest with metadata
3. Add entry to `.claude-plugin/marketplace.json`
4. Document in root `README.md` (following existing format)
5. Test installation: `/plugin install plugin-name`

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

- **Plan files**: `~/.claude/plans/*.md` (read by plan-viz)
- **Mermaid output**: `/tmp/mermaid-diagram-{timestamp}.png`
- **Plan HTML output**: `/tmp/plan-{name}-{timestamp}.html`
- **Agent workspace** (OMT): `.agents/` directory

## Critical Implementation Details

### plan-viz UTF-8 Handling
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

### mermaid-viz Tool Detection
Priority order: `mmdc` (global) → `npx -y @mermaid-js/mermaid-cli` (fallback)

### OMT Agent Communication
Agents use contract files in `.agents/` directory:
- `goal.md` (Human)
- `requirements.md` (@pm)
- `implementation.md` (@arch)

Triangle consensus requires all three parties to agree before execution phase.

### OMT Contract-First Design
Agent contracts are defined in `omt/contracts/`:
- `pm.json` - @pm input/output contract
- `arch.json` - @arch input/output contract
- `dev.json` - @dev → @reviewer execution contract

State synchronization is handled by `hooks/state-sync.sh` triggered on Write/Edit operations.

## Marketplace Installation

Users install the marketplace via:
```bash
/plugin marketplace add musingfox/cc-plugins
```

Then install individual plugins:
```bash
/plugin install omt
/plugin install mermaid-viz
/plugin install plan-viz
/plugin install readability
/plugin install thinking
```

## Design Philosophy

- **Single Responsibility**: Each plugin focuses on one specific capability
- **Zero Dependencies**: Prefer CDN libraries (plan-viz) or universal tools (npx for mermaid-viz)
- **Composability**: Plugins work independently but complement each other
- **Minimal Friction**: Commands and skills integrate seamlessly into natural workflows
