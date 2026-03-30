# Nick's Claude Code Plugin Marketplace

Personal marketplace for Claude Code plugins focused on developer productivity and Agent-First workflows.

## Installation

Add this marketplace to your Claude Code:

```bash
/plugin marketplace add musingfox/cc-plugins
```

## Available Plugins

### OMT - One Man Team

Your personal development squad powered by Agent-First workflow:
- **5 Core Agents**: @hive (lifecycle coordinator), @pm (requirements), @arch (architecture), @dev (TDD implementation), @reviewer (code review + commit)
- **Contract-First Design**: Defined input/output contracts between agents (`hive.json`, `pm.json`, `arch.json`, `dev.json`)
- **One Command**: `/omt "goal"` → autonomous planning → consensus gate → execution
- **Quality Assurance**: Automated code review and git commit workflows
- **State Synchronization**: PostToolUse hooks for automatic state tracking

**Installation:**
```bash
/plugin install omt
```

### Mermaid Visualization

Generate and display high-quality diagrams instantly:
- **Interactive Command**: `/diagram` asks what to visualize and creates it
- **Universal Support**: Flowcharts, sequence diagrams, class diagrams, state machines, ER diagrams, Gantt charts, pie charts
- **8 Color Schemes**: Tokyo Night, Nord, Catppuccin, Dracula, and more via `mermaid-theme` skill
- **Zero Friction**: Automatically opens PNG/SVG in your viewer
- **Configurable**: Environment variables for themes, background, resolution, color scheme
- **Smart Detection**: Uses `mmdc` if installed, falls back to `npx` automatically

**Installation:**
```bash
/plugin install viz
```

**Sandbox configuration:** The viz plugin writes HTML output to `/tmp/viz/`. If you have sandbox enabled, add this to your `.claude/settings.json` or `~/.claude/settings.json`:
```json
{
  "sandbox": {
    "filesystem": {
      "allowWrite": ["//tmp/viz"]
    }
  }
}
```

### Jujutsu (jj) VCS Helper

Workflow commands and Git-to-jj translation for [Jujutsu](https://github.com/martinvonz/jj):
- **5 Workflow Commands**: `/jj-status`, `/jj-sync`, `/jj-submit`, `/jj-clean`, `/jj-undo`
- **Natural Language VCS**: Describe operations like "split this change" or "squash the last two changes"
- **Git Translation**: Automatically translates Git terminology to jj equivalents in jj repos
- **Auto-Detection**: Supports both colocated (jj + git) and native jj repositories

**Installation:**
```bash
/plugin install jj
```

### Apple Podcasts

Fetch Apple Podcasts episode audio download URLs:
- **iTunes API Pipeline**: Resolves episode audio URLs via iTunes Lookup API + RSS feed parsing
- **Zero Browser**: No scraping needed — pure HTTP API workflow
- **Auto-Triggered**: Activated when you share an Apple Podcasts URL or ask to download podcast audio

**Installation:**
```bash
/plugin install apple-podcasts
```

### Context Flow (Experimental)

Experimental agentic workflow based on the **Context + Goal + Tools** principle:
- **Core Idea**: Agents are defined by what context they see and what tools they have — not by role-based personas
- **4-Phase Pipeline**: Research → Plan → Implement → Review, with contract validation between phases
- **Contract as Context**: Each phase's output schema serves as binding constraints for the next phase, enforced structurally (not via prompt)
- **Minimal Agent Definitions**: Agent prompts are 1-16 lines; constraints come from context isolation and tool restrictions
- **Human Gate**: Plan review before implementation — the highest-leverage review point
- **Single Command**: `/cf "goal"` runs the full pipeline

**Installation:**
```bash
/plugin install context-flow
```

### gog (Google Workspace)

Interact with Google Workspace services via the [gogcli](https://github.com/steipete/gogcli) CLI:
- **3 Specialized Skills**: Gmail, Calendar, Drive — each triggered by natural language
- **Gmail**: Search, send, reply, threads, labels, drafts, attachments
- **Calendar**: Events, create, update, delete, freebusy, conflicts, RSVP, focus-time, OOO
- **Drive**: List, search, upload, download, export, share, copy, move, permissions
- **Safety-First**: All destructive operations require `--dry-run` preview before execution
- **Prerequisites**: `brew install gogcli` + `gog auth add <email>`

**Installation:**
```bash
/plugin install gog
```

### MarkItDown

Convert non-plain-text files to Markdown using [MarkItDown](https://github.com/microsoft/markitdown):
- **Wide Format Support**: PDF, Word, PowerPoint, Excel, images, audio, HTML, EPUB, CSV, JSON, XML, ZIP
- **Auto-Triggered**: Activates when you ask to read, analyze, or summarize non-text files
- **Explicit Conversion**: `/convert` skill for direct file-to-markdown conversion
- **Prerequisite**: `pip install markitdown` or `uv tool install markitdown`

**Installation:**
```bash
/plugin install markitdown
```

### ADR (Architecture Decision Records)

Lifecycle management for [MADR 4.0](https://adr.github.io/madr/) Architecture Decision Records with cross-reference consistency enforcement:
- **Full Lifecycle**: Create, list, supersede, deprecate, check — all via natural language
- **Core Differentiator**: Supersession updates ALL cross-references across the entire repo, not just the old-new ADR pair
- **4-Layer Search**: Filename, ADR-N marker, markdown link, title substring — catches every reference
- **Categorized Updates**: Auto-update ADR/doc files, add markers to source code, skip config (user choice per category)
- **Reference Guard**: Advisory skill warns when editing `.md` files that reference superseded ADRs
- **Zero Dependencies**: Pure markdown instruction files, no CLI tools to install

**Installation:**
```bash
/plugin install adr
```

### Hook Guard

One-stop hook setup assistant for Claude Code projects:
- **Auto-Detection**: Detects project language, toolchain (ruff/eslint/clippy/prettier/rustfmt/pytest/vitest...), VCS type, and existing hooks
- **Claude Code Hooks**: Generates PostToolUse lint/format (soft feedback) and PreToolUse test gate (hard gate) into `.claude/settings.local.json`
- **Pre-commit Scripts**: Generates `.githooks/pre-commit` with security checks (secrets, private keys, sensitive files), file integrity checks (large files, merge conflicts, line endings), and structure checks (no-commit markers, syntax validation, lock sync)
- **CLAUDECODE Skip Logic**: Pre-commit skips lint/format/test when Claude Code is running (already handled by CC hooks)
- **Conventional Commits**: Optional `.githooks/commit-msg` validation
- **Team-Shareable**: Uses `core.hooksPath` pointing to `.githooks/` (committed to repo)
- **3 Skills**: `setup` (detect + generate), `doctor` (health check), `update` (diff + refresh)

**Installation:**
```bash
/plugin install hook-guard
```

### Fizzy

Interact with [Fizzy](https://fizzy.do) via the Fizzy CLI for project management:
- **Full CLI Coverage**: Boards, cards (20 subcommands), columns, comments, steps, reactions, tags, users, notifications, pins, webhooks, account settings
- **Search & Filter**: Full-text search, time-based filters, assignee/tag/column filtering
- **File Uploads**: Inline images and background images via signed uploads
- **Board Migration**: Copy boards across accounts with `--dry-run` support
- **Prerequisites**: `fizzy` CLI installed and authenticated (`fizzy setup`)

**Installation:**
```bash
/plugin install fizzy
```

### Readability

Enhances AI-generated text readability:
- **Markdown Tables**: Properly aligned columns for terminal display
- **ASCII Art**: Well-formatted text-based diagrams
- **Text Diagrams**: Consistent formatting for visual elements

**Installation:**
```bash
/plugin install readability
```

### Document Visualizer

Render any markdown document as beautifully formatted HTML:
- **Any File**: `/view-doc` accepts any markdown file path, not just plan files
- **Syntax Highlighting**: Language-aware code coloring via highlight.js
- **Math Formulas**: Inline and block KaTeX rendering (`$E=mc^2$`, `$$\int_0^1$$`)
- **Mermaid Diagrams**: Inline diagram rendering with auto dark mode
- **Animations**: Page-load fade-in + scroll-triggered section reveals (AOS)
- **Auto-Trigger**: `doc-render` skill activates when content needs HTML rendering
- **UTF-8 Support**: Perfect handling of Chinese and other Unicode characters
- **Secure**: XSS protection via DOMPurify sanitization

**Installation:**
```bash
/plugin install doc-viz
```

## Plugin Development

This repository serves as both a marketplace and a development workspace for custom Claude Code plugins.

### Structure

```
cc-plugins/
├── .claude-plugin/
│   └── marketplace.json          # Marketplace configuration
├── omt/                          # OMT - One Man Team plugin
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── agents/                   # 5 core agents (hive, pm, arch, dev, reviewer)
│   ├── commands/                 # omt, init-agents, approve, git-commit, help
│   ├── contracts/                # Agent contract definitions (hive, pm, arch, dev)
│   ├── docs/                     # Workflow, quick-start, contract-validation docs
│   ├── hooks/                    # PostToolUse state-sync hook
│   ├── lib/                      # contract-validator, state-manager
│   ├── skills/                   # contract-validation skill
│   └── README.md
├── mermaid-viz/                  # Mermaid Visualization plugin
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── commands/
│   │   └── diagram.md
│   ├── skills/                   # mermaid-display, mermaid-theme
│   └── README.md
├── doc-viz/                     # Document Visualizer plugin
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── commands/
│   │   └── view-doc.md
│   ├── skills/
│   │   └── doc-render/
│   │       └── SKILL.md
│   └── README.md
├── jj/                           # Jujutsu VCS plugin
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── commands/                 # jj-status, jj-sync, jj-submit, jj-clean, jj-undo
│   ├── skills/                   # jj-workflow, git-to-jj
│   └── README.md
├── apple-podcasts/               # Apple Podcasts audio fetcher
│   ├── .claude-plugin/
│   │   └── plugin.json
│   └── skills/                   # apple-podcasts-fetch
├── context-flow/                 # [Experimental] Context-flow pipeline
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── commands/
│   │   └── cf.md                 # Orchestrator — context flow + contract validation
│   └── agents/                   # research, plan, implement, review
├── gog/                          # Google Workspace CLI skills
│   ├── .claude-plugin/
│   │   └── plugin.json
│   └── skills/                   # gog-gmail, gog-calendar, gog-drive
├── markitdown/                   # File-to-Markdown converter
│   ├── .claude-plugin/
│   │   └── plugin.json
│   └── skills/                   # markitdown-read, convert
├── hook-guard/                   # Hook setup assistant
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── skills/                   # setup, doctor, update
│   └── README.md
├── readability/                  # Text formatting plugin
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── skills/                   # readable-text-formatting
│   └── README.md
├── adr/                          # ADR lifecycle management
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── skills/                   # adr (lifecycle), adr-ref-guard (advisory)
│   └── README.md
├── fizzy/                        # Fizzy project management
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── skills/                   # fizzy CLI wrapper
│   └── README.md
└── README.md
```

## License

MIT License - Personal use and modification encouraged
