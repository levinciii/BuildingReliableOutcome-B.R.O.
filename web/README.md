# B.R.O. on the web

A hands-free voice coding assistant that runs entirely in your browser. No server, no build step: it is a plain
static site, so it deploys to Vercel (or any static host) as-is.

## What it can and can't do

| | Web version |
|---|---|
| Voice ("Hey bro", always-on, push to talk) | Yes, in Chrome and Edge (uses the browser's speech recognition) |
| Read your project | Yes, after you pick a folder (Chrome/Edge), or upload a folder read-only (any browser) |
| Write files | Yes, with your approval each time, in Chrome/Edge. In upload mode, results become downloads |
| Run commands | No. A website cannot run programs on your computer. Use the desktop version for that |
| Models | Claude, OpenAI-compatible services, or Ollama on your own PC |

## Deploy to Vercel

**From GitHub (recommended)**

1. Put the repository on GitHub.
2. In Vercel choose **Add New... > Project** and import the repository.
3. Set **Root Directory** to `web`.
4. Framework Preset: **Other**. Leave Build Command and Output Directory empty.
5. Press **Deploy**.

**From the terminal**

```
cd web
npx vercel --prod
```

`vercel.json` already adds the security headers (strict Content-Security-Policy, microphone allowed only for the
site itself).

## Using it

1. Open the site in Chrome or Edge.
2. **Settings**: paste an API key for the model you want (Claude or OpenAI-compatible), or use Ollama.
3. **Choose project folder**, tap the mic, say "Hey bro, give me an overview of this project".

## Keys and privacy

- **Never put your own API key in the code or in Vercel settings.** The site would hand it to every visitor.
  Each person pastes their own key in Settings.
- Keys are kept for the current tab only, unless "Remember API keys on this device" is ticked.
- Your questions, and the project text the AI reads to answer them, are sent to the model company you chose.
- In Chrome, speech recognition is performed by Google's speech service.

## Using Ollama (a model on your own PC) with the hosted site

A website is only allowed to talk to your local Ollama if Ollama permits that site. Set this once, then restart Ollama:

- Windows (Command Prompt): `setx OLLAMA_ORIGINS "https://your-site.vercel.app"` then quit and reopen Ollama.
- Mac/Linux: `OLLAMA_ORIGINS=https://your-site.vercel.app ollama serve`

If it is not set, B.R.O. shows the exact address to allow. Some browsers refuse a secure (https) page talking to
`http://localhost`; Chrome and Edge allow it.

## Run it locally

Any static server works, for example `npx serve web` or `python -m http.server -d web 8000`, then open
`http://localhost:8000`. (Opening `index.html` by double-click will not work because it uses ES modules.)
