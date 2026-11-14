// Settings live in this browser only (localStorage). API keys are stored separately, and only if you tick
// "Remember API keys on this device"; otherwise they are kept for this tab only (sessionStorage).
import { uid } from './util.js';

const SETTINGS_KEY = 'bro.settings.v1';
const KEYS_KEY = 'bro.keys.v1';

export const DEFAULT_PROFILES = [
  { id: 'claude', name: 'Claude', type: 'claude', model: 'claude-sonnet-5-5', baseUrl: '' },
  { id: 'openai', name: 'OpenAI', type: 'openai', model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' },
  { id: 'ollama', name: 'Local Ollama', type: 'ollama', model: 'qwen3:4b', baseUrl: 'http://localhost:11434', think: false },
  { id: 'custom', name: 'Custom (OpenAI-compatible)', type: 'openai', model: '', baseUrl: '' },
];

export const DEFAULT_SETTINGS = {
  activeId: 'claude',
  profiles: DEFAULT_PROFILES,
  mode: 'wake', // wake | always | push
  wakeWords: 'bro, hey bro, b r o, brow, bruh',
  conversationSeconds: 45,
  speak: 'voice', // voice = read answers aloud when you spoke; always; off
  voiceURI: '',
  rate: 1,
  rememberKeys: false,
};

const clone = (x) => JSON.parse(JSON.stringify(x));

function read(storage, name) {
  try {
    const raw = storage.getItem(name);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(storage, name, value) {
  try {
    storage.setItem(name, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(storage, name) {
  try {
    storage.removeItem(name);
  } catch {
    /* storage unavailable: nothing to remove */
  }
}

export function loadSettings() {
  const saved = read(localStorage, SETTINGS_KEY) || {};
  const settings = { ...clone(DEFAULT_SETTINGS), ...saved };
  if (!Array.isArray(settings.profiles) || !settings.profiles.length) settings.profiles = clone(DEFAULT_PROFILES);
  if (!settings.profiles.some((p) => p.id === settings.activeId)) settings.activeId = settings.profiles[0].id;
  return settings;
}

export function saveSettings(settings) {
  return write(localStorage, SETTINGS_KEY, settings);
}

export function loadKeys() {
  return { ...(read(sessionStorage, KEYS_KEY) || {}), ...(read(localStorage, KEYS_KEY) || {}) };
}

export function saveKeys(keys, remember) {
  if (remember) {
    write(localStorage, KEYS_KEY, keys);
    remove(sessionStorage, KEYS_KEY);
  } else {
    write(sessionStorage, KEYS_KEY, keys);
    remove(localStorage, KEYS_KEY);
  }
}

export function clearAll() {
  remove(localStorage, SETTINGS_KEY);
  remove(localStorage, KEYS_KEY);
  remove(sessionStorage, KEYS_KEY);
}

export function newProfile() {
  return { id: `custom-${uid()}`, name: 'New model', type: 'openai', model: '', baseUrl: '' };
}

export function needsKey(profile) {
  if (profile.type === 'ollama') return false;
  if (profile.type === 'claude') return true;
  try {
    const host = new URL(profile.baseUrl).hostname;
    return !['localhost', '127.0.0.1', '[::1]', '::1'].includes(host);
  } catch {
    return true;
  }
}
