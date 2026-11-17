# Extending B.R.O.

This guide shows where things live and how to add to them. You do not need to understand everything first.

## The map

```
You speak ──> stt.py / voice.js        turns speech into text
              wake.py / wake.js         checks for "Hey bro"
              commands.py / commands.js built-in commands (switch model, reset, goodbye)
              brain.py / brains.js      sends the question to the AI model and runs its tool calls
              tools.py / tools.js       the "hands": list, read, search and write files, run commands (desktop)
              prompt.py / prompt.js     the instructions that define B.R.O.'s voice and rules
              tts.py / voice.js         speaks the answer
```

The desktop app is Python (`main.py` is the conductor). The web app in `web/` is plain JavaScript with no build step.
The two versions mirror each other on purpose, so a feature idea usually maps to the same place in both.

## 1. Change the personality (no code)

Desktop: create `persona.md` next to `main.py`:

```
Prefer short answers.
When suggesting a change, always say which file it goes in.
Our project uses pytest and Black formatting.
```

It is added to the instructions the AI receives. The core rules (coding only, no first person, ask before changing files)
stay in force. The core wording lives in `prompt.py` and `web/js/prompt.js`.

## 2. Add a tool with a plugin (desktop)

A tool is something the AI can ask B.R.O. to do. Create `plugins/word_count.py`:

```python
def word_count(root, path):
    text = (root / path).read_text(encoding="utf-8", errors="ignore")
    return f"{len(text.split())} words in {path}"

TOOLS = [{
    "name": "word_count",
    "description": "Count the words in a project file.",
    "input_schema": {
        "type": "object",
        "properties": {"path": {"type": "string", "description": "File path relative to the project"}},
        "required": ["path"],
    },
    "run": word_count,
}]
```

Restart B.R.O. and it prints `Plugins loaded: word_count`. Say "how many words are in the readme?" and the AI can use it.

Rules of the road:
- `run(root, **args)` gets the project folder as a `pathlib.Path` and must return text.
- Names are lowercase letters, digits and underscores. Built-in tool names cannot be replaced.
- A plugin that crashes on load is skipped with a message. It cannot stop B.R.O. from starting.
- Plugins are normal Python running on your computer. Only install plugins you trust.
- If a tool changes files or runs something risky, ask first with the same approval pattern `write_file` uses in `tools.py`.
- `plugins/find_todos.py` is a complete working example.

## 3. Add a tool to the web version

Edit `web/js/tools.js` in three places:

1. Add the definition to `TOOL_SCHEMAS` (name, description, JSON parameters).
2. Add a friendly line to `describeCall` (this is the chip shown while it runs).
3. Add a `case` to `ToolRunner.run` that returns a string.

The web version runs in a browser sandbox, so it can only touch files the user shared, and it cannot run commands.

## 4. Add a voice command

Commands are quick actions that do not need the AI. In `commands.py` (desktop) or `web/js/commands.js` (web), add a pattern to
`parse()` and handle it in `run_builtin` (`main.py`) or the command handler in `web/js/app.js`. Keep replies free of first-person phrasing.

## 5. Add a model provider

Anything that speaks the OpenAI chat format needs no code: add a profile with `type: "openai"`, a `base_url` and a `model`.
A completely different API needs a new class in `brain.py` / `web/js/brains.js` with an `ask()` method and a line in `make_brain`.

## 6. Where privacy is enforced

| Concern | Code |
|---|---|
| Removing secrets from saved chats | `sessions.py` (`redact`), `web/js/store.js` (`redact`) |
| Encrypting keys and backups | `web/js/vault.js` (AES-256-GCM, PBKDF2) |
| Keeping keys out of the website | They are only ever entered by the user at runtime |
| Content-Security-Policy | `web/vercel.json` |

If you add a feature that stores or sends data, extend these, and say so in your pull request.

## 7. Testing your change

- Desktop: run `run.bat --text` and try it by typing. `run.bat --doctor` checks the setup.
- Web: serve `web/` and click through it. Open the browser console and look for errors; the strict security policy will report blocked inline code.
