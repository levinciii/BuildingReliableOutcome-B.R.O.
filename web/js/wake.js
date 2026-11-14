// Wake-word detection on transcribed text. Same behaviour as wake.py in the desktop app.

export const HALLUCINATIONS = new Set([
  'you', 'thank you', 'thanks', 'thanks for watching', 'thank you for watching', 'bye',
  'okay', 'ok', 'uh', 'um', 'hmm', 'mm', 'so', 'the', 'and', 'yeah', 'oh',
]);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "bro" also matches "B.R.O." and "b r o". A leading hey/hi/ok is swallowed too. */
export function buildRegex(words) {
  const parts = [];
  for (const word of words) {
    const chars = [...String(word).toLowerCase()].filter((c) => /[a-z0-9]/.test(c));
    if (chars.length) parts.push(chars.map(escapeRegex).join('[\\s.\\-]*'));
  }
  if (!parts.length) return null;
  return new RegExp(`(?<![a-z0-9])(?:(?:hey|hi|hello|okay|ok)[\\s,.!]+)?(?:${parts.join('|')})(?![a-z0-9])`, 'i');
}

export function parseWords(text) {
  return String(text ?? '')
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean);
}

/** Returns {woke, command}. The command keeps the user's own spelling and casing. */
export function extract(text, regex) {
  const clean = String(text ?? '').trim();
  if (!regex || !clean) return { woke: false, command: clean };
  const m = regex.exec(clean);
  if (!m) return { woke: false, command: clean };
  const after = clean.slice(m.index + m[0].length).replace(/^[\s,.!?:;-]+/, '').trim();
  const before = clean.slice(0, m.index).replace(/^[\s,.!?:;-]+|[\s,.!?:;-]+$/g, '');
  return { woke: true, command: after || before };
}

export function isNoise(text) {
  const cleaned = String(text ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  return !cleaned || HALLUCINATIONS.has(cleaned);
}
