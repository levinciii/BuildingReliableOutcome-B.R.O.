# Make B.R.O. yours

B.R.O. is open source (MIT). That means you can use it, change it, fork it and ship your own version without asking.
Contributions back are welcome but never required.

## Ways to add your own features, easiest first

| I want to... | Do this | Needs code? |
|---|---|---|
| Change how B.R.O. talks or what it focuses on | Create `persona.md` next to `main.py` and write plain English (desktop) | No |
| Add a model or service | Add a block to `bro.json` (desktop) or **Settings > Add a model** (web) | No |
| Teach it a new skill (a tool) | Drop a file into `plugins/` (desktop). See [docs/EXTENDING.md](docs/EXTENDING.md) | A little Python |
| Add a tool to the web version | Edit `web/js/tools.js` (3 small places) | A little JavaScript |
| Add a voice command | Edit `commands.py` / `web/js/commands.js` | A little code |
| Change the look of the web app | Edit `web/css/styles.css` and `web/css/landing.css` | CSS |

## Getting set up

1. Fork the repository on GitHub and clone it.
2. Desktop: run `setup.bat`, then `run.bat --text` to try changes by typing.
3. Web: serve the `web` folder with any static server, for example `python -m http.server -d web 8000`, and open http://localhost:8000.

## Before you open a pull request

- Keep the three promises below. Changes that break them will be asked to change.
- Try it yourself. Desktop: run `run.bat --doctor`, then `run.bat --text` and use the feature. Web: open the app and click through it with the browser console open.
- If you add tests, include them in the pull request.
- Describe what changed and why in `CHANGELOG.md` under **Unreleased**.
- Small, focused pull requests are easier to review.

## The three promises

1. **Private by default.** No analytics, no accounts, no B.R.O. server. Keys and chats stay on the user's device. Never log or upload secrets.
2. **The user stays in control.** Anything that changes files or runs commands asks first.
3. **Coding only, teammate tone.** B.R.O. helps with the project in front of it and talks like a co-worker with the same goal. It does not use first-person phrasing in replies (see `prompt.py` and `web/js/prompt.js`).

## Reporting problems

Open an issue with what you did, what you expected, and what happened. Remove API keys and passwords from anything you paste.
