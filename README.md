# B.R.O. - Building Reliable Outcome

A voice assistant for your coding project. Say "Hey bro", ask a question, and it answers out loud.
It can read, search, edit and run your project, but asks before changing anything.
By default it runs entirely on your own PC: no account, no tokens, no internet needed.

## Quick start (Windows)

1. Install **Python 3.10 or newer** from python.org. Tick **"Add python.exe to PATH"**.
2. Install **Ollama** from https://ollama.com (this runs the AI model on your PC).
3. Double-click **`setup.bat`**. One time only: it installs everything and downloads the AI model (about 2.5 GB).
4. Double-click **`run.bat`**. The first time it asks for your project folder, then remembers it.

From a terminal in this folder (PowerShell), the same thing is `.\run.bat`.

## Talking to it (hands-free)

B.R.O. keeps the microphone open. Nothing to press.

- Say **"Hey bro"** (or just "bro"), then your question: *"Hey bro, what does the signup function do?"*
- After it answers, you can keep talking for 45 seconds **without** saying "Hey bro" again.
- Say **"Hey bro"** alone and it answers "Yes?" and waits for your question.
- Leave the window open or minimised. A beep means it heard you.

Things you can say:

| Say | What happens |
|---|---|
| "Hey bro, give me an overview of this project" | It reads your files and explains |
| "Find where we open the database" | It searches your code |
| "Add input validation to signup and write a test" | It proposes, then asks before writing files |
| "Run the tests" | It asks, then runs them |
| "Switch model to Claude" | Changes the AI model (see below) |
| "Which model are you using?" / "List models" | Tells you |
| "Reset conversation" | Forgets the chat, keeps project notes |
| "Goodbye" | Quits |

**Approvals:** before it edits a file or runs a command, you type `y` in the terminal (it says so out loud).
If you would rather answer by voice, set `"approvals": "voice"` in `bro.json`. That is convenient but less safe,
because a misheard "yes" would go through. Only a clear "yes" is accepted.

Other ways to run it: `.\run.bat --mode push` (press Enter to talk), `--mode always` (every sentence is a command,
quiet room only), `--text` (type instead of talk), `--mute` (no spoken replies).

## Switching models

B.R.O. works with local models and cloud models. Pick one three ways:

1. **By voice or typing, any time:** "Switch model to claude" (typed: `/model claude`, `/models` lists them).
2. **When starting:** `.\run.bat --model claude`
3. **Permanently:** change `"active_model"` in `bro.json`. (Switching also saves your choice.)

The models are listed in `bro.json`. (That file is created the first time you run B.R.O. and stays on your PC.)

| Name | Type | What it is |
|---|---|---|
| `local` | ollama | Qwen3 4B on your PC. Free. **Default.** |
| `local-small` | ollama | Llama 3.2 3B. A bit faster, weaker at coding. |
| `local-big` | ollama | Qwen3 8B. Smarter but slow on an older CPU. |
| `claude` | claude | Anthropic's Claude. Needs a key. Billed by usage. |
| `openai` | openai | OpenAI. Needs a key. |
| `lmstudio` | openai | LM Studio's local server. Free. |
| `custom` | openai | Template for any OpenAI-compatible service (Groq, OpenRouter, Together, DeepSeek, llama.cpp...). |

**Cloud keys** go in the `.env` file (setup.bat creates it). Open it in Notepad and add your key after the `=`, for example
`ANTHROPIC_API_KEY=sk-ant-...`. Never share this file.

**Adding your own model** - copy a block inside `"models"` in `bro.json` and change it. There are three types:

- `"type": "ollama"` - a model you downloaded with `ollama pull <name>`
- `"type": "claude"` - Claude models
- `"type": "openai"` - anything that speaks the OpenAI format; set `base_url`, `model`, and `api_key_env`

Model names change over time, so check your provider's list if one is rejected. JSON is picky: keep the commas and quotes.
If you break it, B.R.O. tells you the line number, or delete `bro.json` to get the default back.

## Recommended model for your PC

Your PC: i5-4570, 16 GB RAM, Radeon RX 550 4 GB, Windows 10.

**Use `qwen3:4b`** (already the default). It is about 2.5 GB, supports tool use (needed to read and edit your files), and
fits easily in 16 GB of RAM. Bigger models like `qwen3:8b` will work but be much slower on this CPU.

What to expect, honestly:

- Your RX 550 is an older AMD card. As far as I could verify, Ollama's standard GPU support does not cover it, so expect the
  model to run on the **CPU**. Ollama also has an experimental Vulkan mode for older AMD cards
  (start Ollama with the environment variable `OLLAMA_VULKAN=1`), but I could not confirm it works on Windows with an RX 550.
  Try it only if you are curious; if it misbehaves, remove the variable.
- On a CPU this age, answers are slow, likely tens of seconds, and the first one longer while the model loads. That is my
  estimate, not a measurement. B.R.O. keeps the model loaded for 30 minutes and shows `thinking...` while it works.
- Keep questions focused ("explain `signup` in `auth.py`") rather than "review everything".
- Small models make mistakes. Read code before approving a write.
- If it feels too slow, say "switch model to local small", or use a cloud model for hard questions.

## Settings (`bro.json`)

| Setting | Meaning |
|---|---|
| `active_model` | Which model profile to use |
| `listen_mode` | `wake`, `always`, `push`, or `text` |
| `wake_words` | Words that wake it. Add what your voice produces if "bro" is misheard |
| `conversation_seconds` | How long it keeps listening after an answer without the wake word |
| `approvals` | `ask` (type y/n) or `voice` |
| `sounds` | Beep when it hears you |
| `speech_model` | `tiny.en` (fastest), `base.en` (default), `small.en` (most accurate, slower) |
| `audio.input_device` | Microphone number (run `.\run.bat --doctor` to see the list) |
| `audio.silence_threshold` | Minimum loudness counted as speech. It auto-adjusts to your room |
| `audio.silence_seconds` | Pause length that ends your sentence |
| `audio.speech_rate` / `max_spoken_chars` | Voice speed / longest reply spoken (the rest stays on screen) |

## Troubleshooting

Run `.\run.bat --doctor` first. It checks libraries, microphone and model, and downloads the model if missing.

- **It never reacts to "Hey bro":** the terminal prints `heard: ...` for everything it hears. If it spells "bro" differently
  (like "brow" or "bruh"), add that word to `wake_words`. If nothing is printed, try another `audio.input_device`.
- **It answers itself or hears its own voice:** use headphones, or lower your speaker volume.
- **Noisy room, keeps triggering:** use `--mode wake` (default), or raise `audio.silence_threshold`.
- **"Ollama isn't running":** open the Ollama app once. B.R.O. also tries to start it for you.
- **"model isn't downloaded":** run `ollama pull qwen3:4b`.
- **"Access is denied" while installing:** use `setup.bat`, which installs into a private `.venv` folder and needs no admin rights.
- **Wrong project:** run `.\run.bat --project "D:\path\to\project"` (remembered afterwards).

## What is in the folder

`run.bat` start it - `setup.bat` one-time install - `main.py` the conductor - `stt.py` ears (microphone to text) -
`brain.py` the AI models - `tools.py` hands (files and commands) - `tts.py` mouth - `wake.py` wake word - `commands.py` built-in
commands - `doctor.py` setup checker - `prompt.py` personality - `config.py` settings loader - `bro.json` your settings -
`.env` your keys.
