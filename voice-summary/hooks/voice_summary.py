#!/usr/bin/env python3
"""
Voice Summary Hook for Claude Code
Provides audio summary after task completion and prompts for next steps.

Configuration via environment variables:
- VOICE_SUMMARY_ENABLED: Enable/disable the hook (default: true)
- VOICE_SUMMARY_AI_PROVIDER: AI provider for summarization (openai|anthropic|ollama|none, default: none)
- VOICE_SUMMARY_TTS_PROVIDER: TTS provider (elevenlabs|macos|none, default: macos)
- VOICE_SUMMARY_LANGUAGE: Language for summary (en|zh, default: en)
- OPENAI_API_KEY: OpenAI API key (if using OpenAI)
- ANTHROPIC_API_KEY: Anthropic API key (if using Anthropic)
- ELEVENLABS_API_KEY: ElevenLabs API key (if using ElevenLabs TTS)
"""

import os
import sys
import json
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any


class VoiceSummary:
    """Voice summary generator for Claude Code sessions."""

    def __init__(self):
        self.enabled = os.getenv("VOICE_SUMMARY_ENABLED", "true").lower() == "true"
        self.ai_provider = os.getenv("VOICE_SUMMARY_AI_PROVIDER", "none").lower()
        self.tts_provider = os.getenv("VOICE_SUMMARY_TTS_PROVIDER", "macos").lower()
        self.language = os.getenv("VOICE_SUMMARY_LANGUAGE", "en").lower()
        self.project_dir = os.getenv("CLAUDE_PROJECT_DIR", os.getcwd())

    def generate_summary(self, context: str = "") -> str:
        """Generate a summary using AI or a default message."""
        if self.ai_provider == "none" or not context:
            return self._get_default_message()

        try:
            if self.ai_provider == "openai":
                return self._summarize_with_openai(context)
            elif self.ai_provider == "anthropic":
                return self._summarize_with_anthropic(context)
            elif self.ai_provider == "ollama":
                return self._summarize_with_ollama(context)
            else:
                return self._get_default_message()
        except Exception as e:
            print(f"AI summarization failed: {e}", file=sys.stderr)
            return self._get_default_message()

    def _get_default_message(self) -> str:
        """Get default completion message based on language."""
        messages = {
            "en": "Task completed. What would you like me to do next?",
            "zh": "任務完成。請問下一步要做什麼？"
        }
        return messages.get(self.language, messages["en"])

    def _summarize_with_openai(self, context: str) -> str:
        """Summarize using OpenAI API."""
        try:
            import openai
        except ImportError:
            raise ImportError("openai package not installed. Run: pip install openai")

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY not set")

        client = openai.OpenAI(api_key=api_key)

        prompt = self._get_summarization_prompt(context)

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a helpful assistant that summarizes task completions concisely."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=100,
            temperature=0.7
        )

        summary = response.choices[0].message.content.strip()
        return summary

    def _summarize_with_anthropic(self, context: str) -> str:
        """Summarize using Anthropic API."""
        try:
            import anthropic
        except ImportError:
            raise ImportError("anthropic package not installed. Run: pip install anthropic")

        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY not set")

        client = anthropic.Anthropic(api_key=api_key)

        prompt = self._get_summarization_prompt(context)

        response = client.messages.create(
            model="claude-3-5-haiku-20241022",
            max_tokens=100,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        summary = response.content[0].text.strip()
        return summary

    def _summarize_with_ollama(self, context: str) -> str:
        """Summarize using Ollama local model."""
        try:
            import requests
        except ImportError:
            raise ImportError("requests package not installed. Run: pip install requests")

        ollama_url = os.getenv("OLLAMA_API_URL", "http://localhost:11434")
        model = os.getenv("OLLAMA_MODEL", "llama3.2")

        prompt = self._get_summarization_prompt(context)

        response = requests.post(
            f"{ollama_url}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.7,
                    "num_predict": 100
                }
            },
            timeout=30
        )

        if response.status_code != 200:
            raise Exception(f"Ollama API error: {response.status_code}")

        result = response.json()
        return result.get("response", "").strip()

    def _get_summarization_prompt(self, context: str) -> str:
        """Get summarization prompt based on language."""
        if self.language == "zh":
            return f"""基於以下上下文，用一句簡短的話（最多20個字）總結已完成的任務，然後詢問下一步要做什麼。

上下文：
{context[:500]}

請用中文回覆，格式：[任務總結]。下一步要做什麼？"""
        else:
            return f"""Based on the following context, summarize the completed task in one brief sentence (max 15 words), then ask what to do next.

Context:
{context[:500]}

Format: [Task summary]. What would you like me to do next?"""

    def speak(self, text: str) -> bool:
        """Convert text to speech."""
        if self.tts_provider == "none":
            print(text)
            return True

        try:
            if self.tts_provider == "macos":
                return self._speak_macos(text)
            elif self.tts_provider == "elevenlabs":
                return self._speak_elevenlabs(text)
            else:
                print(text)
                return True
        except Exception as e:
            print(f"TTS failed: {e}", file=sys.stderr)
            print(text)
            return False

    def _speak_macos(self, text: str) -> bool:
        """Use macOS say command for TTS."""
        try:
            # Check if say command exists
            subprocess.run(["which", "say"], check=True, capture_output=True)

            # Select voice based on language
            voice = "Ting-Ting" if self.language == "zh" else "Samantha"

            subprocess.run(
                ["say", "-v", voice, text],
                check=True,
                timeout=30
            )
            return True
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            # Fallback to print if say is not available
            print(text)
            return False

    def _speak_elevenlabs(self, text: str) -> bool:
        """Use ElevenLabs API for TTS."""
        try:
            import requests
        except ImportError:
            raise ImportError("requests package not installed. Run: pip install requests")

        api_key = os.getenv("ELEVENLABS_API_KEY")
        if not api_key:
            raise ValueError("ELEVENLABS_API_KEY not set")

        # Select voice based on language
        voice_id = os.getenv(
            "ELEVENLABS_VOICE_ID",
            "21m00Tcm4TlvDq8ikWAM" if self.language == "en" else "yoZ06aMxZJJ28mfd3POQ"
        )

        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"

        headers = {
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": api_key
        }

        data = {
            "text": text,
            "model_id": "eleven_monolingual_v1",
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.5
            }
        }

        response = requests.post(url, json=data, headers=headers, timeout=30)

        if response.status_code != 200:
            raise Exception(f"ElevenLabs API error: {response.status_code}")

        # Play audio using system audio player
        audio_file = "/tmp/voice_summary.mp3"
        with open(audio_file, "wb") as f:
            f.write(response.content)

        # Try different audio players
        for player in ["afplay", "mpg123", "ffplay"]:
            try:
                subprocess.run(
                    [player, audio_file],
                    check=True,
                    capture_output=True,
                    timeout=30
                )
                os.remove(audio_file)
                return True
            except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
                continue

        # Cleanup and fallback
        if os.path.exists(audio_file):
            os.remove(audio_file)
        print(text)
        return False

    def get_context(self) -> str:
        """Get context from recent git activity or project state."""
        context_parts = []

        try:
            # Get git status
            result = subprocess.run(
                ["git", "status", "--short"],
                cwd=self.project_dir,
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0 and result.stdout.strip():
                context_parts.append(f"Git changes: {result.stdout.strip()}")
        except:
            pass

        try:
            # Get last commit message
            result = subprocess.run(
                ["git", "log", "-1", "--pretty=%B"],
                cwd=self.project_dir,
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0 and result.stdout.strip():
                context_parts.append(f"Last commit: {result.stdout.strip()}")
        except:
            pass

        return " | ".join(context_parts) if context_parts else ""

    def run(self) -> int:
        """Run the voice summary hook."""
        if not self.enabled:
            return 0

        # Get context
        context = self.get_context()

        # Generate summary
        summary = self.generate_summary(context)

        # Speak summary
        self.speak(summary)

        return 0


def main():
    """Main entry point."""
    try:
        hook = VoiceSummary()
        return hook.run()
    except Exception as e:
        print(f"Voice summary hook error: {e}", file=sys.stderr)
        return 0  # Don't block Claude Code on errors


if __name__ == "__main__":
    sys.exit(main())
