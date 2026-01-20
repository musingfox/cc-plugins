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

### Thinking

Thinking frameworks for better decision-making:
- **Scenario-Driven Design**: Always start with future usage scenarios before proposing solutions
- **Dimensional Analysis**: Evaluate performance, maintainability, scalability, cost, and more
- **Explicit Trade-offs**: Clearly communicate what each solution optimizes and sacrifices

**Installation:**
```bash
/plugin install thinking
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
│   └── skills/
├── thinking/                     # Thinking frameworks plugin
│   ├── .claude-plugin/
│   │   └── plugin.json
│   └── skills/
├── readability/                  # Text formatting plugin
│   ├── .claude-plugin/
│   │   └── plugin.json
│   └── skills/
└── README.md
```

## License

MIT License - Personal use and modification encouraged
