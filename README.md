# B.R.O. - Building Reliable Outcome

**A voice assistant for your coding project.** Say "Hey bro", ask a question, and it answers out loud.
It can read, search, edit and run your project, and it always asks before changing anything.

- **Free and private by default.** It runs an AI model on your own computer. No account, no tokens.
- **Hands-free.** The microphone stays open, so there is nothing to press.
- **Your choice of brain.** Switch between a local model, Claude, OpenAI, or any OpenAI-compatible service.
- **A teammate, not a chatbot.** It talks like a co-worker with the same goal as you (finishing the project) and sticks to coding. Off-topic questions get a friendly nudge back to the work.
- **Private.** No accounts, no B.R.O. server. Saved chats stay on your device with secrets removed.
- **Yours to change.** MIT licensed, with plugins and a plain-English persona file. See [Make it yours](#9-make-it-yours).
- **Two versions.** A desktop app (this folder) and a website version (the `web/` folder) that also installs on your phone.

## Contents

1. [Which version should I use?](#1-which-version-should-i-use)
2. [Install and start (desktop, Windows)](#2-install-and-start-desktop-windows)
3. [Your first conversation](#3-your-first-conversation)
4. [What you can say](#4-what-you-can-say)
5. [Choosing and switching models](#5-choosing-and-switching-models)
6. [Settings reference](#6-settings-reference)
7. [Safety and privacy](#7-safety-and-privacy)
8. [Saving your progress](#8-saving-your-progress)
9. [Make it yours](#9-make-it-yours)
10. [Troubleshooting](#10-troubleshooting)
11. [Web version and phone](#11-web-version-and-phone)
12. [Files in this folder](#12-files-in-this-folder)

---

## 1. Which version should I use?

| | Desktop app | Web version (`web/`) |
|---|---|---|
| Runs | On your computer | In your browser, hosted on Vercel or any static host |
| Voice | Local speech recognition, works offline | Browser speech (Chrome or Edge); Chrome uses Google's speech service |
| Reads and edits project files | Yes | Yes, after you pick a folder (Chrome or Edge) |
| Runs commands (tests, builds) | Yes, with your approval | No (a website cannot do this safely) |
| Works without internet | Yes, with a local model | Only with a local Ollama model |
| Needs installing | Yes | No |

If you want the full experience, use the desktop app. If you just want to try it or use it from any computer, use the web version (see [section 9](#9-web-version)).

## 2. Install and start (desktop, Windows)

You do this once.

**Step 1. Install Python.** Download **Python 3.10 or newer** from https://www.python.org/downloads/.
On the first installer screen, tick **"Add python.exe to PATH"**.

**Step 2. Install Ollama.** Download it from https://ollama.com. This is the program that runs the AI model on your computer.
(Skip this if you only plan to use a cloud model such as Claude. See [section 5](#5-choosing-and-switching-models).)

**Step 3. Run setup.** Double-click **`setup.bat`**. It installs everything into a private folder (`.venv`) and downloads the AI model
(about 2.5 GB, so it takes a while). It does not need administrator rights.

**Step 4. Start B.R.O.** Double-click **`run.bat`**. The first time, it asks for your project folder and remembers it.

Prefer a terminal? Open PowerShell in this folder and run `.\run.bat`.

> Ollama starts automatically when B.R.O. needs it. You do not have to open it yourself.

## 3. Your first conversation

1. Start B.R.O. and wait for it to say it is ready. Leave the window open or minimised.
2. Say **"Hey bro, give me an overview of this project."**
3. A short beep means it heard you. It thinks, then answers out loud (the full text stays on screen).
4. Ask a follow-up straight away. For the next 45 seconds you do **not** need to say "Hey bro" again.

Tips:
- Say **"Hey bro"** alone and it replies "Yes?" and waits for your question.
- Short, focused questions work best: *"What does signup do in auth.py?"* beats *"Review everything."*
- The first answer is slower because the model is loading. After that it stays loaded for 30 minutes.

## 4. What you can say

| Say | What happens |
|---|---|
| "Hey bro, give me an overview of this project" | It reads your files and explains them |
| "Find where we open the database" | It searches your code |
| "Add input validation to signup and write a test" | It proposes the change, then asks before writing files |
| "Run the tests" | It asks, then runs them |
| "Switch model to Claude" | Changes the AI model |
| "Which model are you using?" / "List models" | Tells you |
| "Reset conversation" | Forgets the chat, keeps project notes |
| "Goodbye" | Quits |

You can also type commands: `/model claude`, `/models`, `/reset`, `/quit`.

**Listening modes** (add to the start command, for example `.\run.bat --mode push`):

| Option | Meaning |
|---|---|
| `--mode wake` | Default. Only reacts after "Hey bro". |
| `--mode push` | Press Enter to talk. |
| `--mode always` | Every sentence is a command. Quiet room only. |
| `--text` | Type instead of talk. |
| `--mute` | No spoken replies. |
| `--model NAME` | Start with a specific model. |
| `--project "PATH"` | Use a different project folder (remembered afterwards). |
| `--doctor` | Check the setup and fix what it can. |
| `--resume` | Continue the last saved conversation for this project. |
| `--clear-sessions` | Delete every saved conversation and exit. |

## 5. Choosing and switching models

Switch any time by voice ("switch model to claude") or by typing (`/model claude`). Your choice is saved.
You can also start with `.\run.bat --model claude`, or set `"active_model"` in `bro.json`.

| Name | Type | What it is |
|---|---|---|
| `local` | Ollama | Qwen3 4B on your computer. Free. **Default.** |
| `local-small` | Ollama | Llama 3.2 3B. A bit faster, weaker at coding. |
| `local-big` | Ollama | Qwen3 8B. Smarter but slow on an older CPU. |
| `claude` | Claude | Anthropic's Claude. Needs a key. Billed by usage. |
| `openai` | OpenAI | Needs a key. Billed by usage. |
| `lmstudio` | OpenAI-compatible | LM Studio's local server. Free. |
| `custom` | OpenAI-compatible | Template for Groq, OpenRouter, Together, DeepSeek, llama.cpp and similar. |

### Do I need Ollama?
Only for the free local models (`local`, `local-small`, `local-big`). If you only use Claude or another cloud model, you can skip it.

### Using a cloud model
1. Open the **`.env`** file in this folder with Notepad (`setup.bat` creates it).
2. Paste your key after the `=`, for example `ANTHROPIC_API_KEY=sk-ant-...`.
3. Save, then say "Switch model to claude".

Never share the `.env` file or commit it to GitHub (the included `.gitignore` already excludes it).

### Adding your own model
Open `bro.json`, copy one block inside `"models"`, and change it. There are three types:

- `"type": "ollama"` - a model you downloaded with `ollama pull <name>`
- `"type": "claude"` - Claude models
- `"type": "openai"` - anything that speaks the OpenAI format; set `base_url`, `model` and `api_key_env`

JSON is picky: keep the commas and quotes. If you break the file, B.R.O. tells you the line number.
To start fresh, delete `bro.json` and a default one is created.

### Which local model for my computer?
- **16 GB RAM, no supported GPU (typical older PC):** use `qwen3:4b` (the default). About 2.5 GB, supports the tool use needed to read and edit files.
- Older AMD graphics cards (for example the Radeon RX 550) are generally not covered by Ollama's standard GPU support, so expect the model to run on the **CPU**.
  Ollama has an experimental Vulkan mode (`OLLAMA_VULKAN=1`) that may help on some cards; it is unverified on Windows with that card.
- On an older CPU, answers can take tens of seconds (an estimate, not a measurement). If it is too slow, say "switch model to local small", or use a cloud model for hard questions.
- Small models make mistakes. Read the code before approving a write.

### Moving Ollama's models to another drive
Models are stored in `C:\Users\<you>\.ollama`. To store them elsewhere, set the environment variable `OLLAMA_MODELS` to the new folder
(Windows search > "Edit environment variables for your account" > New), move the existing `models` folder there, then quit and restart Ollama.

## 6. Settings reference

These live in `bro.json` (created on first run, stays on your computer).

| Setting | Meaning |
|---|---|
| `active_model` | Which model to use |
| `listen_mode` | `wake`, `always`, `push` or `text` |
| `wake_words` | Words that wake it. Add what your voice produces if "bro" is misheard |
| `conversation_seconds` | How long it keeps listening after an answer without the wake word |
| `approvals` | `ask` (type y/n, default) or `voice` |
| `sounds` | Beep when it hears you |
| `save_sessions` | Save conversations on this computer (`true` by default). Set `false` to stop |
| `speech_model` | `tiny.en` (fastest), `base.en` (default), `small.en` (most accurate, slower) |
| `audio.input_device` | Microphone number (run `.\run.bat --doctor` to see the list) |
| `audio.silence_threshold` | Minimum loudness counted as speech. It auto-adjusts to your room |
| `audio.silence_seconds` | Pause length that ends your sentence |
| `audio.speech_rate` / `audio.max_spoken_chars` | Voice speed / longest reply spoken aloud (the rest stays on screen) |

## 7. Safety and privacy

- **It asks first.** Before it edits a file or runs a command, you approve it (by default you type `y` in the terminal).
- **Voice approvals are optional.** Setting `"approvals": "voice"` is convenient but less safe, because a misheard "yes" would go through. Only a clear "yes" is accepted.
- **It stays in your project folder.** It skips heavy folders such as `node_modules`, `.git` and `.venv`, and does not follow links.
- **Coding only.** B.R.O. is built for the project in front of it. General questions get a short, friendly redirect.
- **Secrets are protected.** It is told never to repeat keys or passwords it finds in files, and saved chats have them removed.
- **Privacy with local models:** nothing leaves your computer. With a cloud model, your questions and the project text it reads are sent to that company.
- **Keys** stay in `.env` on your computer. Full details: [docs/PRIVACY.md](docs/PRIVACY.md).

## 8. Saving your progress

Conversations are saved automatically in the `sessions/` folder next to `main.py`. Nothing is uploaded.
Anything that looks like an API key, token or password is replaced with `[secret removed]` before saving.

| I want to... | Do this |
|---|---|
| Continue where I left off | `.\run.bat --resume` |
| Stop saving | Set `"save_sessions": false` in `bro.json` |
| Delete everything saved | `.\run.bat --clear-sessions` |
| Keep my keys safe | Keep them only in `.env` (never commit it; `.gitignore` already excludes it) |

The web version saves chats in your browser, can lock your API keys with a passphrase, and makes encrypted backups. See [section 11](#11-web-version-and-phone).

## 9. Make it yours

B.R.O. is open source (MIT). You can change it, extend it and publish your own version.

- **Change the personality, no code:** create `persona.md` next to `main.py` and write instructions in plain English, such as "Our project uses pytest."
- **Teach it a new skill:** drop a Python file into `plugins/`. `plugins/find_todos.py` is a working example. It is a few lines per tool.
- **Add models or voice commands:** edit `bro.json` or `commands.py`.
- **Everything else:** see [docs/EXTENDING.md](docs/EXTENDING.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## 10. Troubleshooting

Run `.\run.bat --doctor` first. It checks libraries, microphone and model, and downloads the model if it is missing.

| Problem | What to do |
|---|---|
| It never reacts to "Hey bro" | The window prints `heard: ...` for everything it hears. If it spells "bro" differently (like "brow"), add that word to `wake_words`. If nothing prints, try another `audio.input_device`. |
| It answers itself or hears its own voice | Use headphones or lower the speaker volume. |
| Keeps triggering in a noisy room | Use `--mode wake` (default) or raise `audio.silence_threshold`. |
| "Ollama isn't running" | Open the Ollama app once. B.R.O. also tries to start it. |
| "Model isn't downloaded" | Run `ollama pull qwen3:4b`. |
| "Access is denied" while installing | Use `setup.bat`; it installs into a private `.venv` and needs no admin rights. |
| Wrong project | Run `.\run.bat --project "D:\path\to\project"`. |
| Very slow answers | Use a smaller model, ask narrower questions, or switch to a cloud model. |
| Crash mentioning a missing file or folder | Update to version 0.1.1 or later (see `CHANGELOG.md`). |

## 11. Web version and phone

The `web/` folder is a static website with the same assistant in your browser: a landing page, a simple chat screen with light and dark themes,
voice with the "Hey bro" wake word, a folder picker, saved chats and a phone-friendly layout.

**Use it:**
1. Open the site in **Chrome or Edge**.
2. Open **Settings** and paste an API key for Claude or an OpenAI-compatible service (or use Ollama).
3. Click **Choose project folder**, tap the microphone, and say "Hey bro, give me an overview of this project."

**On your phone:** open the site in Chrome and choose **Add to Home screen** to install it. Phones have no folder picker, so use
**Import a public GitHub repo**. Details, and the answer to "can a VM provide the AI?", are in [docs/PHONE.md](docs/PHONE.md).

**Privacy features (web):**
- **History** lists your saved chats. Click one to continue it, or the x to delete it. Keys and passwords are removed before saving.
- **Lock saved keys:** Settings > Privacy > "Lock saved API keys with a passphrase". Keys are then stored encrypted and asked for when you open the site.
- **Backup:** Settings > Back up makes an encrypted `.bro` file. Restore it on any device with the same passphrase.

**Limits:** it cannot run commands; folder editing needs Chrome or Edge (other browsers and phones can upload or import read-only, and changes come back as downloads).
Keys stay in your browser. Never put your own key in the site's code.

**Put it online (Vercel):** import the repository, set **Root Directory** to `web`, Framework Preset **Other**, leave the build command empty, and deploy.
Full steps, including how to use a local Ollama model with the hosted site, are in [`web/README.md`](web/README.md).

## 12. Files in this folder

| File | Role |
|---|---|
| `setup.bat` | One-time install |
| `run.bat` | Start B.R.O. |
| `main.py` | The conductor |
| `stt.py` | Ears: microphone to text |
| `tts.py` | Mouth: text to speech |
| `brain.py` | The AI models |
| `tools.py` | Hands: files and commands |
| `wake.py` | Wake word |
| `commands.py` | Built-in commands (switch model, reset, goodbye) |
| `doctor.py` | Setup checker |
| `prompt.py` | The assistant's instructions |
| `config.py` | Settings loader |
| `sessions.py` | Saved conversations (secrets removed) |
| `plugins.py` | Loads your plugins |
| `plugins/` | Drop-in skills. Start with `find_todos.py` |
| `persona.md` | Optional: your own extra instructions (you create it) |
| `bro.json` | Your settings (created on first run) |
| `.env` | Your keys (created by setup, never share) |
| `web/` | The website version, landing page and phone app |
| `docs/` | Guides: extending, phone, privacy |
| `LICENSE` | MIT license |
| `CONTRIBUTING.md` | How to add your own features |
| `CHANGELOG.md` | What changed in each version |

---

Version history is in [`CHANGELOG.md`](CHANGELOG.md).
