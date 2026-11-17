// Service worker: lets B.R.O. install on a phone and open instantly. It only ever touches files from this site.
// Calls to AI providers, GitHub and Ollama go straight to the network and are never cached or inspected here.
const CACHE = 'bro-shell-v3';
const SHELL = [
  './', 'app.html', 'css/styles.css', 'favicon.svg', 'manifest.webmanifest',
  'js/main.js', 'js/app.js', 'js/util.js', 'js/markdown.js', 'js/wake.js', 'js/commands.js', 'js/settings.js',
  'js/project.js', 'js/diff.js', 'js/tools.js', 'js/prompt.js', 'js/brains.js', 'js/voice.js', 'js/chat.js',
  'js/dialogs.js', 'js/store.js', 'js/vault.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)))).then(() => self.clients.claim()),
  );
});

// Same-site files: show the saved copy straight away and refresh it in the background.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      const fresh = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || fresh;
    }),
  );
});
