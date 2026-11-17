"""Saved conversations. Everything stays in the 'sessions' folder on this computer. Nothing is uploaded.

Before anything is written, text that looks like a key or password is replaced with [secret removed].
Turn it off with  "save_sessions": false  in bro.json, or delete the folder any time (or run  --clear-sessions).
"""
import json
import re
import time
from datetime import datetime

import config

SESSIONS_DIR = config.HERE / "sessions"
KEEP = 30

_PATTERNS = [
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}"),
    re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}"),
    re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}"),
    re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"),
    re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]{16,}", re.I),
]
_ASSIGNMENT = re.compile(r"((?:api[_-]?key|secret|token|password|passwd|pwd)[\"']?\s*[:=]\s*[\"']?)[^\s\"',;]{6,}", re.I)


def redact(text, known_secrets=()):
    """Remove anything that looks like a key or password (and any exact secrets passed in)."""
    out = str(text or "")
    for secret in known_secrets:
        if secret and len(secret) >= 6:
            out = out.replace(secret, "[secret removed]")
    for pattern in _PATTERNS:
        out = pattern.sub("[secret removed]", out)
    return _ASSIGNMENT.sub(lambda m: m.group(1) + "[secret removed]", out)


def _text_of(content):
    if isinstance(content, str):
        return content
    parts = []
    for block in content or []:
        text = block.get("text") if isinstance(block, dict) else getattr(block, "text", None)
        if text:
            parts.append(text)
    return "\n".join(parts)


def turns_from_messages(messages):
    """Keep only what was said: each question with the final answer to it (tool chatter is dropped)."""
    turns, question, answer = [], None, ""
    for m in messages:
        role = m.get("role")
        if role == "user" and isinstance(m.get("content"), str):
            if question is not None and answer:
                turns += [{"role": "user", "content": question}, {"role": "assistant", "content": answer}]
            question, answer = m["content"], ""
        elif role == "assistant":
            text = _text_of(m.get("content")).strip()
            if text:
                answer = text
    if question is not None and answer:
        turns += [{"role": "user", "content": question}, {"role": "assistant", "content": answer}]
    return turns


def save(session_id, messages, project, model, known_secrets=()):
    """Write the conversation so far. Returns the file path, or None when there is nothing to save."""
    turns = turns_from_messages(messages)
    if not turns:
        return None
    clean = [{"role": t["role"], "content": redact(t["content"], known_secrets)} for t in turns]
    SESSIONS_DIR.mkdir(exist_ok=True)
    path = SESSIONS_DIR / f"{session_id}.json"
    data = {"id": session_id, "title": clean[0]["content"][:80], "project": str(project), "model": model,
            "updated": datetime.now().isoformat(timespec="seconds"), "turns": clean}
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    for old in sorted(SESSIONS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)[KEEP:]:
        old.unlink(missing_ok=True)
    return path


def new_id():
    return time.strftime("%Y%m%d-%H%M%S")


def list_sessions():
    items = []
    for path in SESSIONS_DIR.glob("*.json") if SESSIONS_DIR.is_dir() else []:
        try:
            items.append(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            continue
    return sorted(items, key=lambda s: s.get("updated", ""), reverse=True)


def latest(project=None):
    for s in list_sessions():
        if project is None or s.get("project") == str(project):
            return s
    return None


def clear():
    count = 0
    for path in SESSIONS_DIR.glob("*.json") if SESSIONS_DIR.is_dir() else []:
        path.unlink(missing_ok=True)
        count += 1
    return count
