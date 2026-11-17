"""Example plugin: lists TODO and FIXME comments in the project. Copy this file to start your own."""
import os

from tools import IGNORE_DIRS, TEXT_SUFFIXES


def find_todos(root, limit=60):
    hits = []
    for folder, dirs, files in os.walk(root, followlinks=False):
        dirs[:] = sorted(d for d in dirs if d not in IGNORE_DIRS)
        for name in sorted(files):
            if os.path.splitext(name)[1].lower() not in TEXT_SUFFIXES:
                continue
            path = os.path.join(folder, name)
            try:
                with open(path, encoding="utf-8", errors="ignore") as f:
                    for number, line in enumerate(f, 1):
                        if "TODO" in line or "FIXME" in line:
                            hits.append(f"{os.path.relpath(path, root)}:{number}: {line.strip()[:160]}")
                            if len(hits) >= limit:
                                return "\n".join(hits) + "\n...[more not shown]"
            except OSError:
                continue
    return "\n".join(hits) or "No TODO or FIXME comments found."


TOOLS = [{
    "name": "find_todos",
    "description": "List TODO and FIXME comments across the project, with file and line number.",
    "input_schema": {"type": "object", "properties": {}},
    "run": find_todos,
}]
