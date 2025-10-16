# Nick's Claude Code Plugin Marketplace

Personal marketplace for Claude Code plugins focused on developer productivity and Agent-First workflows.

## Installation

Add this marketplace to your Claude Code:

```bash
/plugin marketplace add nickhuang/cc-plugins
```

## Available Plugins

### Agent-First Workflow

Complete Agent-First development system featuring:
- **Autonomous Agents**: 9 specialized agents for planning, coding, reviewing, debugging, and optimization
- **Task Management**: Integrated with Linear, GitHub Issues, Jira, or local files
- **Quality Assurance**: Automated code review and git commit workflows
- **Fibonacci Complexity**: Token-based complexity estimation
- **Retrospective Analysis**: Continuous improvement through agent learning

**Installation:**
```bash
/plugin install agent-first
```

## Plugin Development

This repository serves as both a marketplace and a development workspace for custom Claude Code plugins.

### Structure

```
cc-plugins/
├── .claude-plugin/
│   └── marketplace.json          # Marketplace configuration
├── agent-first/                   # Agent-First workflow plugin
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── commands/
│   ├── agents/
│   └── templates/
└── README.md
```

## License

MIT License - Personal use and modification encouraged
