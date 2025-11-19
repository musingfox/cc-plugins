#!/usr/bin/env python3
"""
Voice Summary Hook for Claude Code - Minimal & Simple

Modes:
  simple (default) - Just say "Done" using macOS say, no AI needed
  gemini          - AI summary + native audio via Gemini (one API call!)
  custom          - Mix your own AI + TTS providers

Quick Start:
  1. Just run it - works out of the box on macOS
  2. For Gemini: export GOOGLE_API_KEY=your_key && export VOICE_MODE=gemini
"""

import os
import sys
import subprocess


def get_git_context():
    """Get quick context from git."""
    try:
        status = subprocess.run(
            ["git", "status", "--short"],
            capture_output=True,
            text=True,
            timeout=3
        )
        commit = subprocess.run(
            ["git", "log", "-1", "--oneline"],
            capture_output=True,
            text=True,
            timeout=3
        )
        parts = []
        if status.stdout.strip():
            parts.append(f"Changes: {status.stdout.strip()[:50]}")
        if commit.stdout.strip():
            parts.append(f"Last: {commit.stdout.strip()[:50]}")
        return " | ".join(parts) if parts else ""
    except:
        return ""


def simple_mode(lang="en"):
    """Simple mode - just say done."""
    msg = "任務完成" if lang == "zh" else "Done"
    try:
        voice = "Ting-Ting" if lang == "zh" else "Samantha"
        subprocess.run(["say", "-v", voice, msg], timeout=10)
    except:
        print(msg)


def gemini_mode(context="", lang="en"):
    """Gemini mode - AI summary with native audio output."""
    try:
        import google.generativeai as genai
    except ImportError:
        print("Install google-generativeai: pip install google-generativeai", file=sys.stderr)
        simple_mode(lang)
        return

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        print("Set GOOGLE_API_KEY for Gemini mode", file=sys.stderr)
        simple_mode(lang)
        return

    try:
        genai.configure(api_key=api_key)

        # Prompt based on language
        if lang == "zh":
            prompt = f"用一句話總結任務完成情況並詢問下一步。上下文：{context[:300]}" if context else "說「任務完成，下一步要做什麼？」"
        else:
            prompt = f"Summarize the task briefly and ask what's next. Context: {context[:300]}" if context else "Say 'Task done. What's next?'"

        # Use Gemini with native audio output
        model = genai.GenerativeModel("gemini-2.0-flash-exp")
        response = model.generate_content(
            prompt,
            generation_config={
                "response_modalities": ["AUDIO"],
                "speech_config": {
                    "voice_config": {
                        "prebuilt_voice_config": {
                            "voice_name": "Puck" if lang == "en" else "Kore"
                        }
                    }
                }
            }
        )

        # Play audio
        if hasattr(response.candidates[0].content.parts[0], 'inline_data'):
            audio_data = response.candidates[0].content.parts[0].inline_data.data
            audio_file = "/tmp/voice_summary.wav"
            with open(audio_file, "wb") as f:
                f.write(audio_data)

            # Play audio
            for player in ["afplay", "aplay", "ffplay"]:
                try:
                    subprocess.run([player, audio_file], timeout=30, check=True)
                    os.remove(audio_file)
                    return
                except:
                    continue

            # Fallback
            if os.path.exists(audio_file):
                os.remove(audio_file)

        # If audio failed, use text
        if hasattr(response, 'text'):
            print(response.text)
        else:
            simple_mode(lang)

    except Exception as e:
        print(f"Gemini failed: {e}", file=sys.stderr)
        simple_mode(lang)


def custom_mode(context="", lang="en"):
    """Custom mode - use your own AI + TTS."""
    ai = os.getenv("AI_PROVIDER", "none").lower()
    tts = os.getenv("TTS_PROVIDER", "macos").lower()

    # Generate summary
    if ai == "none":
        msg = "任務完成。下一步要做什麼？" if lang == "zh" else "Done. What's next?"
    else:
        # Simplified AI integration
        msg = _get_ai_summary(ai, context, lang)

    # Speak
    _speak(tts, msg, lang)


def _get_ai_summary(provider, context, lang):
    """Get AI summary (simplified)."""
    prompt = f"簡短總結：{context}。問下一步。" if lang == "zh" else f"Brief summary: {context}. Ask what's next."

    try:
        if provider == "openai":
            import openai
            client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=50
            )
            return resp.choices[0].message.content.strip()

        elif provider == "anthropic":
            import anthropic
            client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
            resp = client.messages.create(
                model="claude-3-5-haiku-20241022",
                max_tokens=50,
                messages=[{"role": "user", "content": prompt}]
            )
            return resp.content[0].text.strip()

        elif provider == "ollama":
            import requests
            resp = requests.post(
                f"{os.getenv('OLLAMA_URL', 'http://localhost:11434')}/api/generate",
                json={"model": os.getenv("OLLAMA_MODEL", "llama3.2"), "prompt": prompt, "stream": False},
                timeout=20
            )
            return resp.json().get("response", "").strip()
    except:
        pass

    return "任務完成。下一步？" if lang == "zh" else "Done. What's next?"


def _speak(provider, text, lang):
    """Speak text (simplified)."""
    if provider == "none":
        print(text)
        return

    if provider == "macos":
        try:
            voice = "Ting-Ting" if lang == "zh" else "Samantha"
            subprocess.run(["say", "-v", voice, text], timeout=20)
        except:
            print(text)

    elif provider == "elevenlabs":
        try:
            import requests
            voice_id = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
            resp = requests.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                json={"text": text},
                headers={"xi-api-key": os.getenv("ELEVENLABS_API_KEY")},
                timeout=20
            )
            audio_file = "/tmp/tts.mp3"
            with open(audio_file, "wb") as f:
                f.write(resp.content)
            subprocess.run(["afplay", audio_file], timeout=20)
            os.remove(audio_file)
        except:
            print(text)
    else:
        print(text)


def main():
    """Main entry point."""
    mode = os.getenv("VOICE_MODE", "simple").lower()
    lang = os.getenv("VOICE_LANG", "en").lower()

    try:
        if mode == "simple":
            simple_mode(lang)
        elif mode == "gemini":
            context = get_git_context()
            gemini_mode(context, lang)
        elif mode == "custom":
            context = get_git_context()
            custom_mode(context, lang)
        else:
            simple_mode(lang)
    except Exception as e:
        print(f"Hook error: {e}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
