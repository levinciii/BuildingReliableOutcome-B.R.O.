// Passphrase encryption for keys and backups. Runs entirely in the browser (Web Crypto).
// AES-256-GCM, key derived from the passphrase with PBKDF2-SHA-256 (250,000 rounds) and a random salt.
// The passphrase is never stored anywhere. Forget it and the data cannot be recovered. That is the point.

const ITERATIONS = 250_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const MIN_PASSPHRASE = 8;

function toB64(bytes) {
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(out);
}

function fromB64(text) {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function deriveKey(passphrase, salt, iterations) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt any JSON-friendly value. Returns a plain object that is safe to store or download. */
export async function encryptJSON(value, passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE) {
    throw new Error(`Use a passphrase of at least ${MIN_PASSPHRASE} characters.`);
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(value))));
  return { format: 'bro-vault', v: 1, kdf: 'PBKDF2-SHA-256', iter: ITERATIONS, salt: toB64(salt), iv: toB64(iv), data: toB64(data) };
}

/** Decrypt what encryptJSON made. Throws a friendly error on a wrong passphrase or damaged data. */
export async function decryptJSON(blob, passphrase) {
  if (!blob || blob.format !== 'bro-vault' || blob.v !== 1) throw new Error('This is not a B.R.O. backup or vault.');
  try {
    const key = await deriveKey(String(passphrase ?? ''), fromB64(blob.salt), Number(blob.iter) || ITERATIONS);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(blob.iv) }, key, fromB64(blob.data));
    return JSON.parse(decoder.decode(plain));
  } catch {
    throw new Error('Wrong passphrase, or the file is damaged.');
  }
}
