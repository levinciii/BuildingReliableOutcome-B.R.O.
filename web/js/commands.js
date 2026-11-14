// Built-in commands you can say or type. Anything else goes to the AI model.
//   Spoken: "switch model to claude", "which model are you using", "list models", "reset conversation", "stop listening"
//   Typed:  /model claude   /models   /reset   /stop   /help

const STOP_WORDS = new Set([
  'quit', 'exit', 'goodbye', 'good bye', 'bye', 'stop listening', 'stop assistant', 'shut down', 'bye bro', 'good night',
]);

const SWITCH = [
  /^(?:switch|change|set|use|go)\s+(?:the\s+)?(?:model|brain)\s+(?:over\s+)?(?:to\s+)?(.+)$/,
  /^(?:switch|change|go)\s+(?:over\s+)?to\s+(?:the\s+)?(.+?)\s+(?:model|brain)$/,
  /^use\s+(?:the\s+)?(.+?)\s+(?:model|brain)$/,
];
const WHICH = /^(?:what|which)\s+(?:model|brain)(?:\s+(?:are\s+you\s+using|are\s+you\s+running|is\s+this|are\s+we\s+using|are\s+you))?$/;
const LIST = /^(?:list|show|what\s+are)\s+(?:the\s+|my\s+|all\s+|all\s+the\s+)?(?:models|brains)$|^which\s+models\s+do\s+i\s+have$/;
const RESET = /^(?:reset|clear|forget)\s+(?:the\s+|this\s+)?(?:conversation|chat|memory|context)$|^(?:start\s+over|new\s+conversation|new\s+chat)$/;
const HELP = /^(?:help|what\s+can\s+you\s+do|what\s+commands.*)$/;

export function normalize(text) {
  return String(text ?? '').toLowerCase().replace(/[^a-z0-9/ ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Returns {cmd, arg} or null when this is a normal request for the AI. */
export function parse(text) {
  const t = normalize(text);
  if (!t) return null;
  if (t.startsWith('/')) {
    const [first, ...rest] = t.split(' ');
    const word = first.replace(/^\/+/, '');
    const arg = rest.join(' ');
    if (['model', 'brain', 'switch'].includes(word)) return arg ? { cmd: 'switch', arg } : { cmd: 'which' };
    if (['models', 'brains'].includes(word)) return { cmd: 'list' };
    if (['reset', 'clear', 'new'].includes(word)) return { cmd: 'reset' };
    if (['quit', 'exit', 'bye', 'stop'].includes(word)) return { cmd: 'stop' };
    return { cmd: 'help' };
  }
  if (STOP_WORDS.has(t)) return { cmd: 'stop' };
  for (const pattern of SWITCH) {
    const m = pattern.exec(t);
    if (m) return { cmd: 'switch', arg: m[1].trim() };
  }
  if (WHICH.test(t)) return { cmd: 'which' };
  if (LIST.test(t)) return { cmd: 'list' };
  if (RESET.test(t)) return { cmd: 'reset' };
  if (HELP.test(t)) return { cmd: 'help' };
  return null;
}

const NUMBERS = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' };

/** 'Local Two', 'local-2' and 'local2' all become 'local2' (speech recognition writes numbers as words). */
export function key(name) {
  return String(name ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => NUMBERS[w] ?? w)
    .join('');
}

/** 0..1 score based on the longest common subsequence, forgiving of small mis-hearings ("clawed" ~ "claude"). */
function similarity(a, b) {
  if (!a.length || !b.length) return 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const row = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      row[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1]);
    }
    prev = row;
  }
  return (2 * prev[b.length]) / (a.length + b.length);
}

/** Find the model profile a person meant, even if speech recognition spelled it a bit differently. */
export function matchProfile(spoken, profiles) {
  const want = key(spoken);
  if (!want) return null;
  const byKey = new Map();
  for (const p of profiles) {
    byKey.set(key(p.name), p);
    byKey.set(key(p.id), p);
  }
  if (byKey.has(want)) return byKey.get(want);
  const byType = profiles.find((p) => key(p.type) === want);
  if (byType) return byType;
  let best = null;
  let bestScore = 0;
  for (const [k, p] of byKey) {
    const score = similarity(want, k);
    if (score > bestScore) [best, bestScore] = [p, score];
  }
  if (bestScore >= 0.6) return best;
  const starts = [...new Set([...byKey].filter(([k]) => k.startsWith(want) || want.startsWith(k)).map(([, p]) => p))];
  return starts.length === 1 ? starts[0] : null;
}

export const HELP_TEXT =
  "Say “Hey bro” and then ask about your project. You can also say: “switch model to Claude”, " +
  "“which model are you using”, “list models”, “reset conversation”, or “stop listening”.";
