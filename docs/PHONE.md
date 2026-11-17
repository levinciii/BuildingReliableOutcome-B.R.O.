# B.R.O. on your phone

## The approach: install the web app

B.R.O. runs on a phone as an installable web app (a PWA). There is nothing to download from an app store.

1. Open the B.R.O. site in **Chrome** on Android (or Safari on iPhone).
2. Open the app, then use the browser menu: **Add to Home screen** / **Install app**.
3. Open **Settings** and add a key for the AI model you want (see below).
4. Pick a project: on phones there is no folder picker, so choose **Import a public GitHub repo**, or **Upload a folder** where the browser offers it.
5. Tap the mic and say "Hey bro".

Installed this way, the app opens full screen and loads instantly, even before the network is up.

## Where does the AI come from?

The phone cannot run a large model itself, so the app talks to one. You have three options. Pick based on privacy and cost.

| Option | Privacy | Cost | Speed | Setup |
|---|---|---|---|---|
| **Your own API key** (Claude or any OpenAI-compatible service) | Your questions and the code the AI reads go to that company | Pay per use | Fast | Paste the key in Settings |
| **Ollama on your own PC or home server**, reached from your phone | Stays between your devices | Free | Depends on your hardware | Set `OLLAMA_ORIGINS`, and reach the PC over your home Wi-Fi or a private network such as Tailscale |
| **Ollama on a VM you rent** | Stays with a server you control | Monthly bill | Slow on cheap CPU servers; fast only on GPU servers (expensive) | Install Ollama on the VM, secure it, then add its address in Settings |

## Can a VM supply the AI model for everyone?

Technically yes. It is not recommended as the default, for four reasons:

- **Cost.** A server that runs a useful coding model quickly needs a GPU, which is expensive to leave on. Cheap CPU servers answer slowly.
- **Privacy.** Everyone's code and questions would pass through one machine. That contradicts the promise that B.R.O. has no server that sees your work.
- **Security.** An open model endpoint needs authentication, rate limiting and abuse protection. Otherwise strangers use it at your expense.
- **Bring-your-own already works.** Each person's key or private model avoids all of the above.

A VM makes sense when **you** want a private model reachable from any device. In that case:

1. Create a VM (a GPU one for good speed) and install Ollama.
2. Do **not** expose port 11434 to the internet. Put it behind a private network (Tailscale or WireGuard) or an authenticating reverse proxy with HTTPS.
3. Set `OLLAMA_ORIGINS` to the B.R.O. site address on the VM.
4. In B.R.O. Settings, set the Ollama address to the VM's private address.

Browsers require **HTTPS** for a website to talk to a remote server, so a plain `http://` VM address will be blocked when you use the hosted site.

## Phone limits

- No terminal commands (the desktop version has those).
- Imported GitHub repos are read-only, and only public ones. Changes B.R.O. suggests are shown on screen or offered as downloads.
- Voice recognition uses the phone browser's speech service. In Chrome that is Google's service.
- Some phone browsers do not support wake-word listening in the background. Keep the app open on screen.
