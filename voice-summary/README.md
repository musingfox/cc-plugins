# Voice Summary Hook

A Claude Code hook that provides audio summaries after task completion with AI-powered summarization and multi-language support.

## Features

- 🎯 **Smart Summarization**: Optional AI-powered task summaries using OpenAI, Anthropic, or Ollama
- 🔊 **Voice Output**: Text-to-speech using ElevenLabs (cloud) or macOS `say` (local)
- 🌍 **Multi-language**: Support for English and Chinese (簡體中文)
- ⚡ **Minimal Dependencies**: Works with just Python 3, optional packages for advanced features
- 🔧 **Highly Configurable**: Environment variables for all settings

## Installation

### Option 1: Via Claude Code Plugin Marketplace

```bash
/plugin marketplace add musingfox/cc-plugins
/plugin install voice-summary
```

### Option 2: Manual Installation

1. Clone this repository or download the `voice-summary` folder

2. Copy the hook script to your project:
```bash
mkdir -p .claude/hooks
cp voice-summary/hooks/voice_summary.py .claude/hooks/
chmod +x .claude/hooks/voice_summary.py
```

3. Install optional Python dependencies (as needed):
```bash
# For OpenAI summarization
pip install openai

# For Anthropic summarization
pip install anthropic

# For Ollama summarization or ElevenLabs TTS
pip install requests
```

## Configuration

### 1. Configure the Stop Hook

Create or edit `.claude/settings.json` in your project:

```json
{
  "hooks": {
    "Stop": [
      {
        "type": "command",
        "command": "python3 .claude/hooks/voice_summary.py"
      }
    ]
  }
}
```

### 2. Set Environment Variables

Create a `.env` file or set environment variables:

```bash
# Basic settings
export VOICE_SUMMARY_ENABLED=true
export VOICE_SUMMARY_LANGUAGE=en  # or 'zh' for Chinese

# AI Summarization (optional, default: none)
export VOICE_SUMMARY_AI_PROVIDER=none  # Options: none, openai, anthropic, ollama

# TTS Provider (default: macos)
export VOICE_SUMMARY_TTS_PROVIDER=macos  # Options: macos, elevenlabs, none

# API Keys (if using cloud providers)
export OPENAI_API_KEY=your_openai_key
export ANTHROPIC_API_KEY=your_anthropic_key
export ELEVENLABS_API_KEY=your_elevenlabs_key

# Ollama settings (if using local AI)
export OLLAMA_API_URL=http://localhost:11434
export OLLAMA_MODEL=llama3.2

# ElevenLabs settings (optional)
export ELEVENLABS_VOICE_ID=your_voice_id
```

## Usage Examples

### Example 1: Basic Usage (No AI, macOS say)

**Configuration:**
```bash
export VOICE_SUMMARY_ENABLED=true
export VOICE_SUMMARY_AI_PROVIDER=none
export VOICE_SUMMARY_TTS_PROVIDER=macos
export VOICE_SUMMARY_LANGUAGE=en
```

**Behavior:**
- After each task completion, you'll hear: "Task completed. What would you like me to do next?"
- Uses macOS built-in voices (Samantha for English, Ting-Ting for Chinese)

### Example 2: AI Summary with OpenAI + macOS say

**Configuration:**
```bash
export VOICE_SUMMARY_ENABLED=true
export VOICE_SUMMARY_AI_PROVIDER=openai
export VOICE_SUMMARY_TTS_PROVIDER=macos
export VOICE_SUMMARY_LANGUAGE=en
export OPENAI_API_KEY=sk-...
```

**Behavior:**
- Analyzes recent git activity and last commit
- Generates a concise summary using GPT-4
- Speaks the summary using macOS say

### Example 3: Local AI with Ollama + macOS say

**Configuration:**
```bash
export VOICE_SUMMARY_ENABLED=true
export VOICE_SUMMARY_AI_PROVIDER=ollama
export VOICE_SUMMARY_TTS_PROVIDER=macos
export VOICE_SUMMARY_LANGUAGE=zh
export OLLAMA_MODEL=llama3.2
```

**Behavior:**
- Uses local Ollama model for privacy
- Generates Chinese language summary
- Speaks using macOS Chinese voice

### Example 4: Cloud AI + Cloud TTS

**Configuration:**
```bash
export VOICE_SUMMARY_ENABLED=true
export VOICE_SUMMARY_AI_PROVIDER=anthropic
export VOICE_SUMMARY_TTS_PROVIDER=elevenlabs
export VOICE_SUMMARY_LANGUAGE=en
export ANTHROPIC_API_KEY=sk-ant-...
export ELEVENLABS_API_KEY=...
```

**Behavior:**
- Uses Claude for summarization
- Uses ElevenLabs for high-quality voice output

## Configuration Reference

| Variable | Default | Options | Description |
|----------|---------|---------|-------------|
| `VOICE_SUMMARY_ENABLED` | `true` | `true`, `false` | Enable/disable the hook |
| `VOICE_SUMMARY_AI_PROVIDER` | `none` | `none`, `openai`, `anthropic`, `ollama` | AI provider for summarization |
| `VOICE_SUMMARY_TTS_PROVIDER` | `macos` | `macos`, `elevenlabs`, `none` | Text-to-speech provider |
| `VOICE_SUMMARY_LANGUAGE` | `en` | `en`, `zh` | Language for summary |
| `OPENAI_API_KEY` | - | - | OpenAI API key |
| `ANTHROPIC_API_KEY` | - | - | Anthropic API key |
| `ELEVENLABS_API_KEY` | - | - | ElevenLabs API key |
| `OLLAMA_API_URL` | `http://localhost:11434` | - | Ollama server URL |
| `OLLAMA_MODEL` | `llama3.2` | - | Ollama model name |
| `ELEVENLABS_VOICE_ID` | Auto-selected | - | ElevenLabs voice ID |

## Troubleshooting

### "say: command not found"
This hook is designed primarily for macOS. On Linux, you can:
- Use `VOICE_SUMMARY_TTS_PROVIDER=none` to disable voice
- Use `VOICE_SUMMARY_TTS_PROVIDER=elevenlabs` for cloud TTS
- Install `espeak` and modify the script to use it

### "No module named 'openai'"
Install the required package:
```bash
pip install openai
```

### Hook not triggering
1. Check that `.claude/settings.json` is properly configured
2. Verify the script is executable: `chmod +x .claude/hooks/voice_summary.py`
3. Test the script manually: `python3 .claude/hooks/voice_summary.py`

### Voice is too fast/slow
For macOS `say`, you can modify the script to add rate control:
```python
subprocess.run(["say", "-v", voice, "-r", "180", text])  # 180 words per minute
```

## Architecture

The hook works by:

1. **Trigger**: Activated by Claude Code's `Stop` hook when a task completes
2. **Context Gathering**: Reads recent git status and last commit message
3. **AI Summarization** (optional): Sends context to AI provider for concise summary
4. **TTS Output**: Converts summary to speech and plays it
5. **Prompt**: Asks user for next steps

## Privacy & Cost

- **No AI (default)**: Completely free, local, private
- **Ollama**: Free, local, private (requires local installation)
- **OpenAI**: ~$0.001 per summary (GPT-4o-mini)
- **Anthropic**: ~$0.001 per summary (Claude 3.5 Haiku)
- **ElevenLabs**: Based on character count, ~$0.01 per summary

## Contributing

Contributions are welcome! Feel free to:
- Add support for more TTS providers
- Add support for more AI providers
- Improve summarization prompts
- Add more languages

## License

MIT License - See LICENSE file for details

## Author

**Nick Huang**
- Email: nick12703990@gmail.com
- GitHub: [@musingfox](https://github.com/musingfox)
