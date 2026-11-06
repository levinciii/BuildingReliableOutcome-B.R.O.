"""Project tools the assistant can call. Everything is locked to the project folder.

Anything that changes your files or runs a command asks for a typed y/n first.
"""
import itertools
import os
import subprocess
from datetime import datetime
from pathlib import Path

import config

IGNORE_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv", "env",
    "dist", "build", ".idea", ".vscode", ".pytest_cache", ".mypy_cache",
    ".next", ".nuxt", ".turbo", ".cache", ".svn", ".hg", "coverage", "site-packages",
}
MAX_DEPTH = 12  # never dive deeper than this (protects against link loops)
TEXT_SUFFIXES = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".json", ".md", ".txt", ".toml", ".yaml",
    ".yml", ".html", ".css", ".sql", ".sh", ".env.example", ".ini", ".cfg", ".csv",
}
MAX_READ_CHARS = 20000
NOTES_FILE = ".assistant_notes.md"


TOOL_SCHEMAS = [
    {
        "name": "list_files",
        "description": "List files in the project (or a sub-folder). Use this first to understand the project layout.",
        "input_schema": {
            "type": "object",
            "properties": {
                "subdir": {"type": "string", "description": "Folder relative to the project root. Default '.'"},
            },
        },
    },
    {
        "name": "read_file",
        "description": "Read a text file from the project.",
        "input_schema": {
            "type": "object",
            "properties": {"path": {"type": "string", "description": "File path relative to the project root"}},
            "required": ["path"],
        },
    },
    {
        "name": "search_code",
        "description": "Search all project text files for a string (case-insensitive). Returns file:line: text.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    },
    {
        "name": "write_file",
        "description": "Create or overwrite a file in the project. The user must approve it first. Always send the complete file content.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "content": {"type": "string", "description": "Complete new file content"},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "run_command",
        "description": "Run a shell command in the project folder (tests, linters, git status, pip list...). The user must approve it first.",
        "input_schema": {
            "type": "object",
            "properties": {"command": {"type": "string"}},
            "required": ["command"],
        },
    },
    {
        "name": "save_note",
        "description": "Save a short note about the project (decisions, TODOs, ideas) so it is remembered in future sessions.",
        "input_schema": {
            "type": "object",
            "properties": {"note": {"type": "string"}},
            "required": ["note"],
        },
    },
]


class ProjectTools:
    def __init__(self, root, confirm):
        self.root = Path(root).resolve()
        self.confirm = confirm  # function(prompt) -> bool

    # ---------- helpers ----------
    def _safe(self, rel):
        p = (self.root / rel).resolve()
        if p != self.root and self.root not in p.parents:
            raise ValueError("That path is outside the project folder.")
        return p

    def _walk(self, base):
        """Yield the project's files. Folders like node_modules are skipped without ever being
        opened, links are not followed, and anything unreadable (broken links, no permission)
        is quietly ignored instead of crashing."""
        base = Path(base)
        try:
            if any(part in IGNORE_DIRS for part in base.relative_to(self.root).parts):
                return
        except ValueError:
            return
        base_depth = len(base.parts)
        for dirpath, dirnames, filenames in os.walk(base, followlinks=False, onerror=lambda e: None):
            if len(Path(dirpath).parts) - base_depth >= MAX_DEPTH:
                dirnames[:] = []
            else:
                dirnames[:] = sorted(d for d in dirnames if d not in IGNORE_DIRS)
            for name in sorted(filenames):
                p = Path(dirpath) / name
                try:
                    if p.is_file():
                        yield p
                except OSError:
                    continue

    def file_tree(self, limit=150):
        """Short listing used in the system prompt."""
        files = [str(p.relative_to(self.root)) for p in itertools.islice(self._walk(self.root), limit + 1)]
        text = "\n".join(files[:limit])
        if len(files) > limit:
            text += "\n... and more files (use list_files to see them)"
        return text or "(empty folder)"

    def read_notes(self):
        p = self.root / NOTES_FILE
        return p.read_text(encoding="utf-8", errors="replace") if p.exists() else ""

    # ---------- tools ----------
    def list_files(self, subdir="."):
        base = self._safe(subdir)
        files = [str(p.relative_to(self.root)) for p in itertools.islice(self._walk(base), 301)]
        if not files:
            return "No files found."
        out = "\n".join(files[:300])
        if len(files) > 300:
            out += "\n... and more (ask for a sub-folder to see the rest)"
        return out

    def read_file(self, path):
        p = self._safe(path)
        if not p.is_file():
            return f"Error: {path} is not a file."
        text = p.read_text(encoding="utf-8", errors="replace")
        if len(text) > MAX_READ_CHARS:
            text = text[:MAX_READ_CHARS] + "\n...[truncated]"
        return text

    def search_code(self, query):
        q = query.lower()
        hits = []
        for p in self._walk(self.root):
            if p.suffix.lower() not in TEXT_SUFFIXES:
                continue
            try:
                for i, line in enumerate(p.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
                    if q in line.lower():
                        hits.append(f"{p.relative_to(self.root)}:{i}: {line.strip()[:200]}")
                        if len(hits) >= 60:
                            return "\n".join(hits) + "\n...[more matches not shown]"
            except OSError:
                continue
        return "\n".join(hits) or "No matches."

    def write_file(self, path, content):
        p = self._safe(path)
        action = "overwrite" if p.exists() else "create"
        if not self.confirm(f"B.R.O. wants to {action} '{path}' ({len(content)} characters)."):
            return "The user declined this change."
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return f"Wrote {path}."

    def run_command(self, command):
        if not self.confirm(f"B.R.O. wants to run: {command}"):
            return "The user declined to run this command."
        try:
            r = subprocess.run(
                command, shell=True, cwd=self.root, capture_output=True, text=True,
                timeout=config.COMMAND_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            return f"Command timed out after {config.COMMAND_TIMEOUT_SECONDS} seconds."
        out = (r.stdout or "") + (r.stderr or "")
        if len(out) > 8000:
            out = out[:8000] + "\n...[truncated]"
        return f"Exit code {r.returncode}\n{out}"

    def save_note(self, note):
        stamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        with open(self.root / NOTES_FILE, "a", encoding="utf-8") as f:
            f.write(f"- [{stamp}] {note}\n")
        return "Note saved."

    # ---------- dispatcher ----------
    def call(self, name, args):
        fn = getattr(self, name, None)
        if name not in {t["name"] for t in TOOL_SCHEMAS} or fn is None:
            return f"Unknown tool: {name}"
        try:
            return fn(**args)
        except Exception as e:  # report to the model so it can recover
            return f"Error: {e}"
