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
- **Autonomous Agents**: 9 specialized agents for planning, coding, reviewing, debugging, and optimization
- **Task Management**: Integrated with Linear, GitHub Issues, Jira, or local files
- **Quality Assurance**: Automated code review and git commit workflows
- **Fibonacci Complexity**: Token-based complexity estimation
- **Retrospective Analysis**: Continuous improvement through agent learning

**Installation:**
```bash
/plugin install omt
```

### CLI Tools - Modern Command-Line Productivity

Master powerful CLI tools for lightning-fast development workflows:
- **fd**: Fast file finder (3-10x faster than `find`)
- **ripgrep (rg)**: Blazing fast text search
- **ast-grep**: Structural code search by AST patterns
- **fzf**: Interactive fuzzy finder for selection workflows
- **jq**: JSON processing and transformation
- **yq**: YAML/XML processing for configs

**Installation:**
```bash
/plugin install cli-tools
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
│   ├── commands/
│   ├── agents/
│   └── templates/
└── README.md
```

## License

MIT License - Personal use and modification encouraged
