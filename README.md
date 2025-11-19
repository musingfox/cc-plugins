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

Get audio feedback when Claude Code finishes tasks. **30-second setup**, works immediately on macOS.

**3 Modes:**
- **Simple** (default): Just says "Done" - zero setup, no API needed
- **Gemini** (recommended): AI summary + voice in one API call - best quality
- **Custom**: Mix your own AI + TTS providers - maximum flexibility

**Quick Start:**
```bash
# 1. Copy hook
mkdir -p .claude/hooks
cp voice-summary/hooks/voice_summary.py .claude/hooks/

# 2. Configure .claude/settings.json
{
  "hooks": {
    "Stop": [{
      "type": "command",
      "command": "python3 .claude/hooks/voice_summary.py"
    }]
  }
}

# 3. Done! Works immediately on macOS

# Optional: Enable Gemini mode for AI summaries
export GOOGLE_API_KEY=your_key
export VOICE_MODE=gemini
pip install google-generativeai
```

**Features:**
- Gemini 2.0 native audio support (AI + voice in one call!)
- Multi-language (English, Chinese)
- Zero dependencies in simple mode
- Fallback support: OpenAI, Anthropic, Ollama, ElevenLabs

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
