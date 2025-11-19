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

### Voice Summary Hook

Audio feedback after Claude Code completes tasks:
- **AI Summarization**: Optional summaries using OpenAI, Anthropic, or Ollama
- **Voice Output**: Text-to-speech via ElevenLabs (cloud) or macOS say (local)
- **Multi-language**: Support for English and Chinese
- **Zero Dependencies**: Works with just Python 3 in basic mode
- **Highly Configurable**: Environment variables for all settings

**Installation:**
```bash
/plugin install voice-summary
```

**Quick Start:**
```bash
# Copy hook to your project
mkdir -p .claude/hooks
cp voice-summary/hooks/voice_summary.py .claude/hooks/

# Configure in .claude/settings.json
{
  "hooks": {
    "Stop": [{
      "type": "command",
      "command": "python3 .claude/hooks/voice_summary.py"
    }]
  }
}
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
├── voice-summary/                # Voice Summary Hook plugin
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── hooks/
│   │   └── voice_summary.py
│   ├── .env.example
│   ├── requirements.txt
│   ├── settings.json.example
│   └── README.md
└── README.md
```

## License

MIT License - Personal use and modification encouraged
