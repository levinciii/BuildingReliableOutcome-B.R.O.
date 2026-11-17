"""Plugins: drop a .py file into the 'plugins' folder to teach B.R.O. a new skill. No other file needs editing.

A plugin file defines a list called TOOLS. Each tool is a dictionary:

    TOOLS = [{
        "name": "word_count",
        "description": "Count the words in a project file.",
        "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]},
        "run": lambda root, path: ...,      # root = the project folder (a pathlib.Path); returns text
    }]

See plugins/find_todos.py for a complete example and docs/EXTENDING.md for the full guide.
Plugins are ordinary Python code that runs on your computer, so only install ones you trust.
Files starting with an underscore are ignored.
"""
import importlib.util
import re

import config
import tools

PLUGINS_DIR = config.HERE / "plugins"
_NAME = re.compile(r"^[a-z][a-z0-9_]{1,40}$")


def load_plugins(directory=None):
    """Load every plugin. A broken plugin is reported and skipped; it never stops B.R.O. from starting."""
    directory = directory or PLUGINS_DIR
    loaded, problems = [], []
    if not directory.is_dir():
        return loaded, problems
    for path in sorted(directory.glob("*.py")):
        if path.name.startswith("_"):
            continue
        try:
            spec = importlib.util.spec_from_file_location(f"bro_plugin_{path.stem}", path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            for tool in getattr(module, "TOOLS", []):
                name = tool.get("name", "")
                if not _NAME.match(name):
                    raise ValueError(f"tool name {name!r} must be lowercase letters, digits and underscores")
                if not callable(tool.get("run")):
                    raise ValueError(f"tool {name} needs a 'run' function")
                tools.register_tool(
                    {"name": name, "description": tool.get("description", ""),
                     "input_schema": tool.get("input_schema") or {"type": "object", "properties": {}}},
                    tool["run"],
                )
                loaded.append(name)
        except Exception as e:  # a plugin is someone else's code: never let it crash the app
            problems.append(f"{path.name}: {e}")
    return loaded, problems
