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
- **5 Core Agents**: @pm (requirements), @arch (architecture), @coord-exec (coordination), @dev (TDD implementation), @reviewer (code review + commit)
- **Contract-First Design**: Defined input/output contracts between agents (`pm.json`, `arch.json`, `dev.json`)
- **Triangle Consensus**: Human ↔ @pm ↔ @arch must agree before autonomous execution
- **Quality Assurance**: Automated code review and git commit workflows
- **State Synchronization**: PostToolUse hooks for automatic state tracking

**Installation:**
```bash
/plugin install omt
```

### Thinking

Thinking frameworks for better decision-making:
- **Scenario-Driven Design**: Always start with future usage scenarios before proposing solutions
- **Dimensional Analysis**: Evaluate performance, maintainability, scalability, cost, and more
- **Explicit Trade-offs**: Clearly communicate what each solution optimizes and sacrifices

**Installation:**
```bash
/plugin install thinking
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

### Readability

Enhances AI-generated text readability:
- **Markdown Tables**: Properly aligned columns for terminal display
- **ASCII Art**: Well-formatted text-based diagrams
- **Text Diagrams**: Consistent formatting for visual elements

**Installation:**
```bash
/plugin install readability
```

### Plan Visualizer

Transform Claude Code plan files into beautifully formatted HTML:
- **Instant Visualization**: `/view-plan` command opens plans in browser
- **Markdown Rendering**: Full support for headers, tables, code blocks, and lists
- **Mermaid Diagrams**: Inline diagram rendering with auto dark mode
- **UTF-8 Support**: Perfect handling of Chinese and other Unicode characters
- **Zero Dependencies**: All libraries loaded from CDN
- **Secure**: XSS protection via DOMPurify sanitization

**Installation:**
```bash
/plugin install plan-viz
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
│   ├── agents/                   # 5 core agents (pm, arch, coord-exec, dev, reviewer)
│   ├── commands/                 # init-agents, approve, git-commit, help
│   ├── contracts/                # Agent contract definitions (pm, arch, dev)
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
├── plan-viz/                     # Plan Visualizer plugin
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── commands/
│   │   └── view-plan.md
│   └── README.md
├── readability/                  # Text formatting plugin
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── skills/                   # readable-text-formatting
│   └── README.md
├── thinking/                     # Thinking frameworks plugin
│   ├── .claude-plugin/
│   │   └── plugin.json
│   └── skills/                   # scenario-thinking
└── README.md
```

## License

MIT License - Personal use and modification encouraged
