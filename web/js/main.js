import { App } from './app.js';

const app = new App();
app.init();
window.bro = app; // handy for debugging in the browser console

// Makes B.R.O. installable on phones and keeps the app shell available offline.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
