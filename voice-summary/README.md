# Voice Summary Hook

Get audio feedback when Claude Code finishes tasks. Simple, fast, minimal setup.

## Quick Start (30 seconds)

### 1. Install the hook

```bash
# Copy to your project
mkdir -p .claude/hooks
cp voice-summary/hooks/voice_summary.py .claude/hooks/
chmod +x .claude/hooks/voice_summary.py
```

### 2. Configure Claude Code

Add to `.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [{
      "type": "command",
      "command": "python3 .claude/hooks/voice_summary.py"
    }]
  }
}
```

### 3. Done!

On macOS, it works immediately - just says "Done" after each task.

## Modes

### Simple Mode (Default)
No setup needed. Just says "Done" using macOS `say`.

```bash
# Already enabled by default!
```

### Gemini Mode (Recommended)
AI summary + voice in **one API call**. Best quality.

```bash
# 1. Get free API key: https://aistudio.google.com/apikey
export GOOGLE_API_KEY=your_key_here
export VOICE_MODE=gemini

# 2. Install
pip install google-generativeai
```

**Example output:** "Created voice summary hook with Gemini support. What's next?"

### Custom Mode (Advanced)
Mix your own AI + TTS providers.

```bash
export VOICE_MODE=custom
export AI_PROVIDER=openai      # openai, anthropic, ollama, none
export TTS_PROVIDER=macos      # macos, elevenlabs, none
export OPENAI_API_KEY=sk-...
```

## Configuration

All settings via environment variables:

| Variable | Default | Options |
|----------|---------|---------|
| `VOICE_MODE` | `simple` | `simple`, `gemini`, `custom` |
| `VOICE_LANG` | `en` | `en`, `zh` |
| `GOOGLE_API_KEY` | - | For Gemini mode |
| `AI_PROVIDER` | `none` | For custom mode: `none`, `openai`, `anthropic`, `ollama` |
| `TTS_PROVIDER` | `macos` | For custom mode: `macos`, `elevenlabs`, `none` |

## Examples

### Chinese with Gemini
```bash
export VOICE_MODE=gemini
export VOICE_LANG=zh
export GOOGLE_API_KEY=your_key
```

### Local AI (Ollama) + macOS voice
```bash
export VOICE_MODE=custom
export AI_PROVIDER=ollama
export TTS_PROVIDER=macos
export OLLAMA_MODEL=llama3.2
```

### OpenAI + ElevenLabs
```bash
export VOICE_MODE=custom
export AI_PROVIDER=openai
export TTS_PROVIDER=elevenlabs
export OPENAI_API_KEY=sk-...
export ELEVENLABS_API_KEY=...
```

## Why Gemini Mode?

- **One API call** does both AI summary + voice generation
- **Native audio** - no separate TTS service needed
- **Cost effective** - Gemini 2.0 Flash is very cheap
- **High quality** - natural-sounding AI voices
- **Simple setup** - just one API key

## Installation via Plugin (Alternative)

```bash
/plugin marketplace add musingfox/cc-plugins
/plugin install voice-summary
```

## Troubleshooting

**"say: command not found"**
- Simple mode requires macOS
- Use `VOICE_MODE=gemini` for cross-platform support

**"No module named 'google.generativeai'"**
```bash
pip install google-generativeai
```

**Hook not running**
- Check `.claude/settings.json` is in your project root
- Make script executable: `chmod +x .claude/hooks/voice_summary.py`
- Test manually: `python3 .claude/hooks/voice_summary.py`

## Cost Comparison

| Mode | Cost per summary | Setup time |
|------|------------------|------------|
| Simple | Free | 0 min |
| Gemini | ~$0.001 | 2 min |
| Custom (OpenAI + macOS) | ~$0.001 | 5 min |
| Custom (OpenAI + ElevenLabs) | ~$0.015 | 10 min |

## License

MIT License

## Author

**Nick Huang**
- GitHub: [@musingfox](https://github.com/musingfox)
