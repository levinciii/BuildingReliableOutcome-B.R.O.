# Privacy

B.R.O. has no server, no accounts and no analytics. This page says exactly what is stored and where.

## Saved chats

| | Desktop | Web |
|---|---|---|
| Where | `sessions/` folder next to `main.py` | This browser (localStorage) |
| What | Questions and answers, with keys and passwords replaced by `[secret removed]` | Same |
| Turn off | `"save_sessions": false` in `bro.json` | Settings > Privacy > untick "Save my chats" |
| Delete | `run.bat --clear-sessions` or delete the folder | Settings > Delete saved chats, or the x beside a chat |
| Continue later | `run.bat --resume` | Click a chat under History |

Redaction is pattern based (API keys, tokens, passwords, private keys). It is a safety net, not a guarantee. Do not paste secrets into chats.

## API keys

| | Desktop | Web |
|---|---|---|
| Stored | In `.env` on your computer (never uploaded, excluded by `.gitignore`) | By default only for the open tab. Optional: remember on this device |
| Extra protection | Keep `.env` out of cloud-synced folders | Optional **passphrase lock**: keys are encrypted with AES-256-GCM (PBKDF2, 250,000 rounds) and the passphrase is never stored |
| Sent to | Only the model provider you chose | Only the model provider you chose |

Forgetting the web passphrase means the saved keys cannot be recovered. Paste them again.

## Backups (web)

**Settings > Back up** makes an encrypted `.bro` file protected by a passphrase you choose. Keys are left out unless you tick the box.
Restoring needs the same passphrase. Keep backups somewhere you trust.

## What leaves your device

- Your questions, and the project text B.R.O. reads to answer them, go to the AI provider you picked (or stay on your machine with a local Ollama model).
- Speech: desktop speech recognition is local. In the browser, Chrome sends audio to Google's speech service.
- GitHub import fetches files and recent commits from GitHub's public API. No token is used.
- Asking about recent changes reads git history on your machine (desktop), or the folder's `.git/logs/HEAD` file (web). Author emails are removed.

Nothing else is sent anywhere.
