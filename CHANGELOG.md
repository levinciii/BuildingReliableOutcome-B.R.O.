# Changelog

All notable changes to **B.R.O. (Building Reliable Outcome)** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Version numbers are pre-1.0, so anything may still change.

## [Unreleased]

Nothing yet.

## [0.4.1] - 2026-11-21

### Fixed
- The assistant no longer shows its "thinking" (for example "Okay, let's see. The user asked...") before the answer. Qwen3 and other reasoning models can emit a lone `</think>` with no opening tag; this was not removed before. Thinking is now stripped in every case (complete blocks, a lone `</think>`, an unfinished `<think>`), in both the desktop and web versions.
- Old thinking is no longer stored in the conversation history, so it cannot leak into later answers.
- For Qwen3 models with `think: false`, the `/no_think` switch is added to the instructions, which works even on older Ollama versions that ignore the `think` setting.
- If a model produces only thinking and no answer, B.R.O. says so instead of reading the thoughts aloud.

## [0.4.0] - 2026-11-19

### Added
- **Recent changes.** New `recent_changes` tool: ask what changed recently and B.R.O. reads the latest commits and the project's
  `CHANGELOG.md` (or `CHANGES.md`, `HISTORY.md`, `RELEASES.md`, `NEWS.md`). Desktop uses `git log` and `git status`, can inspect one commit,
  and falls back to git's own log file when git is missing. Web reads a chosen folder's `.git/logs/HEAD`, or a GitHub import's latest commits.
  Author emails are never shown.
- **Echo guard.** B.R.O. ignores its own voice when the microphone picks it up (desktop and web).

### Changed
- **Direct answers.** B.R.O. leads with the answer and no longer narrates its own process or thinks out loud.
- **New colour palette.** Primary `#3A405A` and secondary `#F9DEC9` across the app, landing page, icons and installed-app theme,
  with matching light and dark modes.

## [0.3.0] - 2026-11-17

### Changed
- **Teammate voice.** B.R.O. now talks like a co-worker working toward the same goal and avoids first-person phrasing
  in every reply, including built-in spoken replies ("Running on Claude." instead of "I'm using Claude.").
- **Coding only.** The instructions limit B.R.O. to the project; unrelated questions get a short, friendly redirect.
- B.R.O. is told never to repeat keys or passwords it finds in project files.
- README rewritten as a step-by-step user manual, with sections on saving progress, privacy and making the app your own.

### Added
- **Saved progress, privately.** Desktop: conversations are saved in `sessions/` with secrets removed; `--resume` and `--clear-sessions`;
  `"save_sessions"` setting. Web: History list in the sidebar, secrets removed before saving, delete per chat or all at once.
- **Key vault (web).** Optional passphrase lock encrypts saved API keys on the device (AES-256-GCM, PBKDF2). A wrong passphrase is refused,
  and a locked vault is never overwritten.
- **Encrypted backup and restore (web).** `.bro` files protected by a passphrase; keys are included only if asked.
- **Make it yours.** MIT `LICENSE`, `CONTRIBUTING.md`, issue templates, `docs/EXTENDING.md`, `docs/PRIVACY.md`.
  Desktop `plugins/` folder (drop in a `.py` file to add a tool; includes a `find_todos.py` example) and optional `persona.md`.
- **Phone support.** The web app is installable (manifest, icons, offline shell). New **Import a public GitHub repo** for devices without a folder picker.
  Guide in `docs/PHONE.md`, including why a shared VM-hosted model is not the default and how to run a private one.
- **Landing page** (`web/index.html`) with Ko-fi, GitHub and LinkedIn links. The app moved to `web/app.html`.

### Fixed
- A drive-letter or doubled-backslash path in a web write request could reach the approval prompt; it is now refused first.
- The "say Hey bro first" hint vanished immediately in web voice mode.

## [0.2.0] - 2026-11-14

### Added
- **Web version** in the `web/` folder: a static site (no server, no build step) that deploys to Vercel.
  Includes a simple responsive UI with light and dark themes, chat with code blocks and copy buttons,
  voice with the "Hey bro" wake word (Chrome/Edge), spoken answers, and a Settings dialog for models and voice.
- Project access in the browser: pick a folder to read and write (Chrome/Edge) or upload a folder read-only.
  Every file change shows a before/after preview and needs approval; uploaded folders produce downloads instead.
- Model switching in the browser: Claude, OpenAI-compatible services and Ollama, by menu or by voice/typed command.
- `web/vercel.json` with a strict Content-Security-Policy and other security headers, and `web/README.md`
  with deploy steps.

### Security
- API keys are never part of the site. They stay in the visitor's browser (this tab only unless "remember" is ticked).
- AI replies are rendered as safe text, so a hostile reply cannot inject HTML or scripts.
- Paths outside the project folder, or absolute paths, are refused before any approval prompt.

### Not available on the web
- Running terminal commands (a website cannot do this safely). Use the desktop version.

## [0.1.1] - 2026-10-24

### Fixed
- Crash on startup when the project contained a broken link, such as an npm workspace link in `node_modules`
  that points to a missing folder (`FileNotFoundError: [WinError 3]`).

### Changed
- The project file scanner now skips heavy folders (`node_modules`, `.git`, `.venv`, `dist`, `build`, `.next`,
  `.nuxt`, `.turbo`, `.cache`, `.svn`, `.hg`, `coverage`, `site-packages`) without opening them, which also
  makes it much faster on large projects.
- Links are no longer followed, unreadable files and folders are ignored instead of raising errors,
  and scanning stops at a maximum folder depth to avoid link loops.
- File listings stop early on huge projects and tell the model to ask for a sub-folder.

## [0.1.0] - 2026-10-21

The hands-free release.

### Added
- **Hands-free listening.** The microphone stays open; say "Hey bro" followed by your request. No key press needed.
  - After an answer, B.R.O. keeps listening for 45 seconds (`conversation_seconds`) so you can follow up without
    repeating the wake word.
  - Wake words are configurable (`wake_words`) and tolerate spellings like "B.R.O." and "b r o".
  - Background noise is measured at startup and the speech threshold is set automatically.
  - A short beep confirms that B.R.O. heard you (Windows).
  - It never hears its own voice: audio that piled up while it was speaking is discarded.
  - Listening modes: `wake` (default), `always`, `push` (press Enter), `text` (typing only).
- **Switchable model profiles** in the new `bro.json`. Supported types:
  - `ollama` - local models through Ollama.
  - `claude` - Anthropic Claude.
  - `openai` - any OpenAI-compatible service (OpenAI, LM Studio, Groq, OpenRouter, llama.cpp, and others).
  - Built-in profiles: `local`, `local-small`, `local-big`, `claude`, `openai`, `lmstudio`, `custom`.
- **Switch models any time**: by voice ("switch model to Claude"), by typing (`/model claude`), with
  `--model <name>` at startup, or by editing `active_model`. The choice is remembered.
- **Voice commands**: switch model, which model, list models, reset conversation, goodbye.
- **Optional voice approval** (`"approvals": "voice"`) for file edits and commands. Only a clear "yes" approves.
- **One-click Windows setup**: `setup.bat` creates a private `.venv`, installs libraries, and downloads the model;
  `run.bat` starts the assistant.
- **`--doctor`** checks libraries, microphone, and model, and downloads a missing Ollama model.
- **`.env` file** for API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CUSTOM_API_KEY`) with a `.env.example` template.
- The project folder is asked for once and remembered.
- Ollama is started automatically if it is installed but not running, and the model is pre-loaded in the background.
- Command-line options: `--project`, `--model`, `--models`, `--mode`, `--text`, `--mute`, `--doctor`.
- Spoken replies are capped at 700 characters (`max_spoken_chars`); the full answer stays on screen.
- Friendly, specific error messages for a missing API key, an unreachable server, or a model that is not downloaded.
- Failed requests are rolled back so the next question starts cleanly.

### Changed
- Default model is now `qwen3:4b` (about 2.5 GB), chosen for a 16 GB RAM PC without a supported GPU.
  Qwen3 "thinking" mode is turned off by default to save time on slow CPUs.
- Local models receive a shorter project file list (40 files) in their instructions, so the first answer is faster.
- All three model backends now live in `brain.py`; `ollama_brain.py` was merged into it.
- Settings moved from `VA_*` environment variables to `bro.json`.
- The `anthropic` library is now part of `requirements.txt`, so switching to Claude works without extra installs.
- Replies are labeled `B.R.O.:` and approval prompts read "B.R.O. wants to ...".
- Speech recognition is given a vocabulary hint to recognise "bro" and coding words more reliably.

### Fixed
- Installing on Windows no longer fails with "Access is denied" (libraries now install into a private `.venv`,
  so no administrator rights are needed).

## [0.0.2] - 2026-10-20

### Added
- **Local AI brain through Ollama**, so the assistant can run fully on your own PC with no API key and no token costs.
- Backend switch (`VA_BACKEND`) between local Ollama and cloud Claude.
- Shared system prompt (`prompt.py`) used by every brain.
- Safety limit on tool calls per request, to stop a confused model from looping forever.
- Hidden "thinking" text from reasoning models is stripped before it is shown or spoken.

### Changed
- **Renamed the project to Building Reliable Outcome (B.R.O.)**; the assistant introduces itself by that name
  and answers to "bro".
- Setup instructions now start with Ollama instead of an API key.

## [0.0.1] - 2026-10-20

Initial release.

### Added
- Voice coding assistant for the terminal, written in Python.
- Pipeline of microphone, local speech-to-text ([faster-whisper](https://github.com/SYSTRAN/faster-whisper)),
  AI model, and text-to-speech with the system voice ([pyttsx3](https://github.com/nateshmbhat/pyttsx3)).
- Press Enter to talk, or type a message; say or type "goodbye" to quit.
- Project tools the AI can use: list files, read a file, search code, write a file, run a command, save a note.
- Safety: all file access is locked to the chosen project folder, and writing a file or running a command always
  requires a typed `y` first.
- Notes saved to `.assistant_notes.md` so decisions and TODOs are remembered between sessions.
- Cloud brain using Anthropic Claude (API key required).
- Code blocks, links, and markdown are skipped when replies are read aloud.

## Known limitations

- On an older CPU, a local model answers slowly (tens of seconds is likely), and the first answer is slower while
  the model loads.
- GPU acceleration was not verified for older AMD cards such as the Radeon RX 550.
- Hands-free mode needs the terminal window left open; it is not a hidden background service.
- Typed approval is the default because voice approval is less safe (a misheard "yes" would go through).
- Small local models make more coding mistakes than cloud models; review code before approving a change.
- Cloud model names change over time; if a provider rejects one, update it in `bro.json`.
