"""Brains: the part that thinks. One class per kind of model, picked from a profile in bro.json.

  type "ollama" -> a model running on your own PC through Ollama (free)
  type "claude" -> Anthropic's Claude (cloud, needs an API key)
  type "openai" -> any OpenAI-compatible service: OpenAI, LM Studio, Groq, OpenRouter, llama.cpp...
"""
import json
import os
import re
import shutil
import subprocess
import time
from urllib.parse import urlparse

import requests

import config
from prompt import build_system
from tools import TOOL_SCHEMAS


class BrainError(Exception):
    """A problem the user can fix (missing key, server not running...). The message is shown as-is."""


THINKING_LOST = "The model got lost in its own thinking and gave no answer. Ask again, or switch to a model without a thinking mode."


def strip_thinking(text):
    """Remove a reasoning model's thinking so it is never shown or spoken.

    Handles all three shapes: <think>...</think> blocks, a lone </think> (Qwen3 starts its reply already
    "inside" the thinking, so only the closing tag appears), and a <think> that never closes.
    """
    text = text or ""
    if "</think>" in text:
        text = text.rsplit("</think>", 1)[1]          # the answer is whatever follows the last closing tag
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    text = text.split("<think>", 1)[0]               # an unclosed <think> swallows the rest
    return text.strip()


# ---------------------------------------------------------------- Ollama helpers
def _is_local(url):
    return (urlparse(url).hostname or "") in {"localhost", "127.0.0.1", "::1"}


def ollama_up(url):
    try:
        return requests.get(url.rstrip("/") + "/api/tags", timeout=3).ok
    except requests.RequestException:
        return False


def ensure_ollama(url, wait_seconds=25):
    """Make sure the Ollama server answers. Starts it quietly if it is installed but not running."""
    if ollama_up(url):
        return True
    if not _is_local(url) or not shutil.which("ollama"):
        return False
    flags = 0x08000000 if os.name == "nt" else 0  # CREATE_NO_WINDOW
    try:
        subprocess.Popen(
            ["ollama", "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL, creationflags=flags,
        )
    except OSError:
        return False
    deadline = time.time() + wait_seconds
    while time.time() < deadline:
        if ollama_up(url):
            return True
        time.sleep(0.5)
    return False


def ollama_models(url):
    try:
        r = requests.get(url.rstrip("/") + "/api/tags", timeout=5)
        r.raise_for_status()
        return [m["name"] for m in r.json().get("models", [])]
    except (requests.RequestException, ValueError, KeyError):
        return []


def ollama_has(url, model):
    names = ollama_models(url)
    return model in names or (":" not in model and f"{model}:latest" in names)


# ---------------------------------------------------------------- base class
class BaseBrain:
    def __init__(self, tools, profile):
        self.tools = tools
        self.profile = profile
        self.messages = []
        self.system = build_system(tools, int(profile.get("tree_limit", 150)))

    def describe(self):
        return f"{self.profile['name']} ({self.profile['type']}: {self.profile.get('model', '?')})"

    def prepare(self):
        """Check everything needed is in place. Raise BrainError with a friendly message if not."""

    def warm_up(self):
        """Optional: get ready in the background so the first answer is faster."""

    def reset(self):
        self.messages = []

    def rollback(self):
        """Forget the question that just failed (and anything after it) so the next one starts clean."""
        while self.messages:
            if self._is_plain_user(self.messages.pop()):
                break

    def _api_key(self):
        env = self.profile.get("api_key_env", "")
        if not env:
            return ""
        key = os.environ.get(env, "")
        if not key:
            raise BrainError(
                f"The model '{self.profile['name']}' needs a key named {env}. "
                f"Add a line like {env}=your-key to the .env file next to main.py, then restart."
            )
        return key

    def _trim(self):
        # Keep history bounded and always start on a plain user message,
        # so tool calls and their results are never split apart.
        while len(self.messages) > config.MAX_HISTORY_MESSAGES:
            self.messages.pop(0)
            while self.messages and not self._is_plain_user(self.messages[0]):
                self.messages.pop(0)

    @staticmethod
    def _is_plain_user(msg):
        return msg.get("role") == "user" and isinstance(msg.get("content"), str)

    def _run_tool(self, name, args):
        print(f"  [tool] {name}")
        return self.tools.call(name, args if isinstance(args, dict) else {})

    def ask(self, text):
        raise NotImplementedError


LOOP_MESSAGE = "Stuck in a loop of tool calls. Try asking again in a simpler way."


# ---------------------------------------------------------------- Ollama (local)
class OllamaBrain(BaseBrain):
    def __init__(self, tools, profile):
        super().__init__(tools, profile)
        self.base = profile.get("url", "http://localhost:11434").rstrip("/")
        self.model = profile["model"]
        self.tool_defs = [
            {"type": "function", "function": {
                "name": t["name"], "description": t["description"], "parameters": t["input_schema"]}}
            for t in TOOL_SCHEMAS
        ]
        self._send_think = profile.get("think") is not None

    def _no_think(self):
        """Qwen3 models honour a '/no_think' switch in the instructions, even when Ollama ignores the think setting."""
        if self.profile.get("think") is False and "qwen3" in self.model.lower():
            return "\n\n/no_think"
        return ""

    def prepare(self):
        if not ensure_ollama(self.base):
            raise BrainError(
                "Ollama isn't running and could not be started. Install it from https://ollama.com, "
                "open the Ollama app once, then try again."
            )
        if not ollama_has(self.base, self.model):
            raise BrainError(
                f"The model '{self.model}' isn't downloaded yet. Run:  ollama pull {self.model}\n"
                "(or run setup.bat, which does it for you)"
            )

    def warm_up(self):
        # Loading a model from disk takes a while; do it now instead of during your first question.
        try:
            requests.post(self.base + "/api/generate",
                          json={"model": self.model, "keep_alive": self.profile.get("keep_alive", "30m")},
                          timeout=300)
        except requests.RequestException:
            pass

    def _chat(self):
        payload = {
            "model": self.model,
            "messages": [{"role": "system", "content": self.system + self._no_think()}] + self.messages,
            "tools": self.tool_defs,
            "stream": False,
            "keep_alive": self.profile.get("keep_alive", "30m"),
            "options": {"num_ctx": int(self.profile.get("num_ctx", 8192))},
        }
        if self._send_think:
            payload["think"] = bool(self.profile["think"])
        for attempt in range(2):
            try:
                r = requests.post(self.base + "/api/chat", json=payload,
                                  timeout=int(self.profile.get("timeout", 900)))
            except requests.ConnectionError:
                if attempt == 0 and ensure_ollama(self.base):
                    continue
                raise BrainError("Can't reach Ollama. Open the Ollama app (or run `ollama serve`) and try again.")
            except requests.Timeout:
                raise BrainError("The local model took too long. Try a smaller model, e.g. say 'switch model to local small'.")
            if r.status_code == 400 and "think" in payload and "think" in r.text.lower():
                payload.pop("think")  # this model has no thinking mode; ask again without it
                self._send_think = False
                continue
            break
        if r.status_code == 404:
            raise BrainError(f"The model '{self.model}' isn't installed. Run:  ollama pull {self.model}")
        if not r.ok:
            raise BrainError(f"Ollama returned an error ({r.status_code}): {r.text[:200]}")
        return r.json()["message"]

    def ask(self, text):
        self.messages.append({"role": "user", "content": text})
        self._trim()
        for _ in range(config.MAX_TOOL_STEPS):
            msg = self._chat()
            calls = msg.get("tool_calls") or []
            self.messages.append({**{k: v for k, v in msg.items() if k != "thinking"},
                                  "content": strip_thinking(msg.get("content"))})  # never feed old thinking back in
            if not calls:
                return strip_thinking(msg.get("content")) or (THINKING_LOST if (msg.get("content") or "").strip() else "")
            for call in calls:
                fn = call.get("function", {})
                args = fn.get("arguments") or {}
                if isinstance(args, str):  # some models send JSON text instead of an object
                    try:
                        args = json.loads(args)
                    except json.JSONDecodeError:
                        args = {}
                name = fn.get("name", "")
                self.messages.append({"role": "tool", "tool_name": name,
                                      "content": self._run_tool(name, args)})
        return LOOP_MESSAGE


# ---------------------------------------------------------------- OpenAI-compatible
class OpenAICompatBrain(BaseBrain):
    def __init__(self, tools, profile):
        super().__init__(tools, profile)
        self.base = profile["base_url"].rstrip("/")
        self.tool_defs = [
            {"type": "function", "function": {
                "name": t["name"], "description": t["description"], "parameters": t["input_schema"]}}
            for t in TOOL_SCHEMAS
        ]

    def prepare(self):
        if "YOUR-" in self.base or "YOUR-" in str(self.profile.get("model", "")):
            raise BrainError(
                f"The model '{self.profile['name']}' is just a template. Open bro.json and fill in "
                "its base_url and model."
            )
        self._api_key()  # raises a friendly error if the key is missing

    def _headers(self):
        key = self._api_key()
        return {"Authorization": f"Bearer {key}"} if key else {}

    def _chat(self):
        payload = {
            "model": self.profile["model"],
            "messages": [{"role": "system", "content": self.system}] + self.messages,
            "tools": self.tool_defs,
        }
        if self.profile.get("max_tokens"):
            payload["max_tokens"] = int(self.profile["max_tokens"])
        try:
            r = requests.post(self.base + "/chat/completions", json=payload, headers=self._headers(),
                              timeout=int(self.profile.get("timeout", 300)))
        except requests.ConnectionError:
            raise BrainError(f"Can't reach {self.base}. Is the server running and the address right?")
        except requests.Timeout:
            raise BrainError("The model took too long to answer.")
        if r.status_code in (401, 403):
            raise BrainError("The service rejected the API key. Check it in the .env file.")
        if r.status_code == 404:
            raise BrainError(f"Not found: {self.base}/chat/completions. Check base_url and model in bro.json.")
        if not r.ok:
            raise BrainError(f"The service returned an error ({r.status_code}): {r.text[:200]}")
        return r.json()["choices"][0]["message"]

    def ask(self, text):
        self.messages.append({"role": "user", "content": text})
        self._trim()
        for _ in range(config.MAX_TOOL_STEPS):
            msg = self._chat()
            calls = msg.get("tool_calls") or []
            stored = {"role": "assistant", "content": strip_thinking(msg.get("content"))}
            if calls:
                for i, call in enumerate(calls):
                    call.setdefault("id", f"call_{int(time.time() * 1000)}_{i}")
                stored["tool_calls"] = calls
            self.messages.append(stored)
            if not calls:
                return strip_thinking(msg.get("content")) or (THINKING_LOST if (msg.get("content") or "").strip() else "")
            for call in calls:
                fn = call.get("function", {})
                args = fn.get("arguments") or {}
                if isinstance(args, str):
                    try:
                        args = json.loads(args or "{}")
                    except json.JSONDecodeError:
                        args = {}
                self.messages.append({"role": "tool", "tool_call_id": call["id"],
                                      "content": self._run_tool(fn.get("name", ""), args)})
        return LOOP_MESSAGE


# ---------------------------------------------------------------- Claude
class ClaudeBrain(BaseBrain):
    def __init__(self, tools, profile):
        super().__init__(tools, profile)
        self.client = None

    def prepare(self):
        key = self._api_key()
        try:
            import anthropic
        except ImportError:
            raise BrainError("The 'anthropic' library isn't installed. Run setup.bat again.")
        self.client = anthropic.Anthropic(api_key=key, base_url=self.profile.get("base_url") or None)

    def ask(self, text):
        if self.client is None:
            self.prepare()
        import anthropic
        self.messages.append({"role": "user", "content": text})
        self._trim()
        for _ in range(config.MAX_TOOL_STEPS):
            try:
                resp = self.client.messages.create(
                    model=self.profile["model"],
                    max_tokens=int(self.profile.get("max_tokens", 2048)),
                    system=self.system,
                    tools=TOOL_SCHEMAS,
                    messages=self.messages,
                )
            except anthropic.AuthenticationError:
                raise BrainError("Claude rejected the API key. Check ANTHROPIC_API_KEY in the .env file.")
            except anthropic.APIConnectionError:
                raise BrainError("Can't reach Claude. Check your internet connection.")
            except anthropic.APIStatusError as e:
                raise BrainError(f"Claude returned an error ({e.status_code}): {e.message}")
            self.messages.append({"role": "assistant", "content": resp.content})
            if resp.stop_reason != "tool_use":
                return "".join(b.text for b in resp.content if b.type == "text").strip()
            results = []
            for block in resp.content:
                if block.type == "tool_use":
                    results.append({"type": "tool_result", "tool_use_id": block.id,
                                    "content": self._run_tool(block.name, block.input)})
            self.messages.append({"role": "user", "content": results})
        return LOOP_MESSAGE


BRAINS = {"ollama": OllamaBrain, "claude": ClaudeBrain, "openai": OpenAICompatBrain}


def make_brain(tools, profile):
    kind = profile.get("type")
    if kind not in BRAINS:
        raise BrainError(f"Model '{profile.get('name')}' has an unknown type '{kind}'. Use one of: {', '.join(BRAINS)}.")
    return BRAINS[kind](tools, profile)
