// Saved chats and encrypted backups. Everything stays in this browser (localStorage) unless the user
// downloads a backup file. Nothing here ever talks to a server.
import { encryptJSON, decryptJSON } from './vault.js';

const CHATS_KEY = 'bro.chats.v1';
const VAULT_KEY = 'bro.keys.vault.v1';
export const MAX_CHATS = 40;
const MAX_LOG_ITEMS = 300;

// ------------------------------------------------------------------ secret redaction
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g, // OpenAI, Anthropic and similar
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  /((?:api[_-]?key|secret|token|password|passwd|pwd)["']?\s*[:=]\s*["']?)[^\s"',;]{6,}/gi,
];

/** Replace anything that looks like a key or password. Also removes any exact secrets passed in. */
export function redact(text, knownSecrets = []) {
  let out = String(text ?? '');
  for (const secret of knownSecrets) {
    if (secret && secret.length >= 6) out = out.split(secret).join('[secret removed]');
  }
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (match, prefix) => (typeof prefix === 'string' && match.startsWith(prefix) ? `${prefix}[secret removed]` : '[secret removed]'));
  }
  return out;
}

// ------------------------------------------------------------------ storage helpers
function readJSON(name, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(name);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(name, value) {
  try {
    globalThis.localStorage?.setItem(name, JSON.stringify(value));
    return true;
  } catch {
    return false; // storage full, blocked or private mode
  }
}

// ------------------------------------------------------------------ saved chats
export function listChats() {
  return readJSON(CHATS_KEY, [])
    .map(({ id, title, updated, project, model }) => ({ id, title, updated, project, model }))
    .sort((a, b) => b.updated - a.updated);
}

export function getChat(id) {
  return readJSON(CHATS_KEY, []).find((c) => c.id === id) || null;
}

/** Save (or update) a chat. The log is redacted first. Returns false if the browser refused to store it. */
export function saveChat({ id, title, project, model, log }, knownSecrets = []) {
  const clean = log.slice(-MAX_LOG_ITEMS).map((item) => (item.text ? { ...item, text: redact(item.text, knownSecrets) } : item));
  const chats = readJSON(CHATS_KEY, []).filter((c) => c.id !== id);
  chats.push({ id, title: redact(title, knownSecrets).slice(0, 80), project: project || '', model: model || '', updated: Date.now(), log: clean });
  chats.sort((a, b) => b.updated - a.updated);
  return writeJSON(CHATS_KEY, chats.slice(0, MAX_CHATS));
}

export function deleteChat(id) {
  return writeJSON(CHATS_KEY, readJSON(CHATS_KEY, []).filter((c) => c.id !== id));
}

export function clearChats() {
  try {
    globalThis.localStorage?.removeItem(CHATS_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Turn a saved log back into the plain question/answer pairs a model can continue from. */
export function turnsFromLog(log) {
  const turns = [];
  let pending = null;
  for (const item of log) {
    if (item.t === 'user') pending = item.text;
    else if (item.t === 'assistant' && !item.error && pending !== null) {
      turns.push({ role: 'user', content: pending }, { role: 'assistant', content: item.text });
      pending = null;
    }
  }
  return turns;
}

// ------------------------------------------------------------------ key vault (passphrase-locked keys)
export const hasVault = () => Boolean(readJSON(VAULT_KEY, null));

export async function saveVault(keys, passphrase) {
  return writeJSON(VAULT_KEY, await encryptJSON({ keys }, passphrase));
}

export async function openVault(passphrase) {
  const blob = readJSON(VAULT_KEY, null);
  if (!blob) return {};
  return (await decryptJSON(blob, passphrase)).keys || {};
}

export function removeVault() {
  try {
    globalThis.localStorage?.removeItem(VAULT_KEY);
  } catch {
    /* nothing to remove */
  }
}

// ------------------------------------------------------------------ encrypted backups
/** Everything worth keeping, encrypted with a passphrase. Keys are included only when asked for. */
export async function makeBackup({ settings, keys, includeKeys }, passphrase) {
  const payload = {
    app: 'bro',
    version: 1,
    exportedAt: new Date().toISOString(),
    chats: readJSON(CHATS_KEY, []),
    settings,
    keys: includeKeys ? keys : undefined,
  };
  return encryptJSON(payload, passphrase);
}

export async function readBackup(blob, passphrase) {
  const payload = await decryptJSON(blob, passphrase);
  if (payload?.app !== 'bro') throw new Error('This file is not a B.R.O. backup.');
  return payload;
}

/** Merge backed-up chats into the saved ones (newer copy wins). */
export function mergeChats(chats) {
  const byId = new Map(readJSON(CHATS_KEY, []).map((c) => [c.id, c]));
  for (const chat of Array.isArray(chats) ? chats : []) {
    const mine = byId.get(chat.id);
    if (!mine || (chat.updated || 0) > (mine.updated || 0)) byId.set(chat.id, chat);
  }
  const merged = [...byId.values()].sort((a, b) => b.updated - a.updated).slice(0, MAX_CHATS);
  return writeJSON(CHATS_KEY, merged);
}
