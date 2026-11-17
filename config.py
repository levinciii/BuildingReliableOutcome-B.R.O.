"""B.R.O. settings loader.

You normally never edit this file. Change things in:
  bro.json  - models, wake words, listening mode, microphone and voice settings
  .env      - secret API keys (only needed for cloud models such as Claude)
"""
import json
import os
from copy import deepcopy
from pathlib import Path

HERE = Path(__file__).resolve().parent
SETTINGS_FILE = HERE / "bro.json"
ENV_FILE = HERE / ".env"

# Fixed safety / tuning values (rarely need changing)
COMMAND_TIMEOUT_SECONDS = 120
MAX_HISTORY_MESSAGES = 40
MAX_TOOL_STEPS = 12

DEFAULT_SETTINGS = {
    "project": "",
    "active_model": "local",
    # wake   = say "Hey bro" first, then keep talking for a while without repeating it
    # always = every sentence is a command (quiet room only)
    # push   = press Enter, then talk
    # text   = type only, no microphone
    "listen_mode": "wake",
    "wake_words": ["bro", "hey bro", "b r o", "brow", "bruh"],
    "conversation_seconds": 45,
    # ask   = you type y/n in the terminal before B.R.O. edits a file or runs a command
    # voice = you say yes/no out loud instead (convenient, but less safe)
    "approvals": "ask",
    "sounds": True,
    # Save conversations in the "sessions" folder on this computer (secrets are removed first). Resume with --resume.
    "save_sessions": True,
    "speech_model": "base.en",
    "audio": {
        "input_device": None,
        "silence_seconds": 1.1,
        "silence_threshold": 0.012,
        "max_record_seconds": 30,
        "speech_rate": 185,
        "max_spoken_chars": 700,
    },
    "models": {
        "local": {
            "type": "ollama",
            "model": "qwen3:4b",
            "url": "http://localhost:11434",
            "num_ctx": 8192,
            "think": False,
            "keep_alive": "30m",
            "tree_limit": 40,
            "description": "Free, runs on your PC. Recommended for 16 GB RAM with no supported GPU.",
        },
        "local-small": {
            "type": "ollama",
            "model": "llama3.2:3b",
            "url": "http://localhost:11434",
            "num_ctx": 8192,
            "keep_alive": "30m",
            "tree_limit": 40,
            "description": "Free, a bit faster than 'local' but weaker at coding.",
        },
        "local-big": {
            "type": "ollama",
            "model": "qwen3:8b",
            "url": "http://localhost:11434",
            "num_ctx": 8192,
            "think": False,
            "keep_alive": "30m",
            "tree_limit": 40,
            "description": "Free and smarter, but slow on an older CPU.",
        },
        "claude": {
            "type": "claude",
            "model": "claude-sonnet-5-5",
            "api_key_env": "ANTHROPIC_API_KEY",
            "max_tokens": 2048,
            "description": "Cloud. Needs ANTHROPIC_API_KEY in .env. Billed by usage.",
        },
        "openai": {
            "type": "openai",
            "base_url": "https://api.openai.com/v1",
            "model": "gpt-4o-mini",
            "api_key_env": "OPENAI_API_KEY",
            "description": "Cloud. Needs OPENAI_API_KEY in .env. Change 'model' to any model your account offers.",
        },
        "lmstudio": {
            "type": "openai",
            "base_url": "http://localhost:1234/v1",
            "model": "local-model",
            "api_key_env": "",
            "tree_limit": 40,
            "description": "Free. Talks to LM Studio's local server (start the server in LM Studio first).",
        },
        "custom": {
            "type": "openai",
            "base_url": "https://YOUR-PROVIDER/v1",
            "model": "YOUR-MODEL-NAME",
            "api_key_env": "CUSTOM_API_KEY",
            "description": "Template for any OpenAI-compatible service (Groq, OpenRouter, Together, DeepSeek, llama.cpp...).",
        },
    },
}


def load_env():
    """Read KEY=value lines from .env into the environment (existing variables win)."""
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and value and key not in os.environ:
            os.environ[key] = value


def load_settings():
    settings = deepcopy(DEFAULT_SETTINGS)
    if SETTINGS_FILE.exists():
        try:
            user = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            raise SystemExit(
                f"bro.json has a typo (line {e.lineno}, column {e.colno}): {e.msg}\n"
                "Fix it, or delete bro.json to get the default one back."
            )
        for key, value in user.items():
            if key == "audio" and isinstance(value, dict):
                settings["audio"].update(value)
            elif key == "models" and isinstance(value, dict):
                settings["models"] = value  # your list replaces the built-in list
            else:
                settings[key] = value
    return settings


def save_settings(settings):
    SETTINGS_FILE.write_text(json.dumps(settings, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def get_profile(settings, name):
    models = settings["models"]
    if name not in models:
        raise KeyError(f"No model called '{name}'. Available: {', '.join(models)}")
    profile = dict(models[name])
    profile["name"] = name
    return profile
