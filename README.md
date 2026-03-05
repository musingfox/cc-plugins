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
/plugin install mermaid-viz
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
├── readability/                  # Text formatting plugin
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── skills/                   # readable-text-formatting
│   └── README.md
└── README.md
```

## License

MIT License - Personal use and modification encouraged
