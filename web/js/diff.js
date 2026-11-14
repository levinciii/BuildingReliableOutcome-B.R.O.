// Line-by-line diff used in the "Allow this change?" preview.

/** Returns [{t: '+' | '-' | ' ' | '…', s: text}] showing only changed lines plus 2 lines of context, or null if too big. */
export function lineDiff(before, after, context = 2) {
  const a = String(before).split('\n');
  const b = String(after).split('\n');
  if (a.length * b.length > 4_000_000) return null;

  // Longest-common-subsequence table.
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ t: ' ', s: a[i] });
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      ops.push({ t: '-', s: a[i++] });
    } else {
      ops.push({ t: '+', s: b[j++] });
    }
  }
  while (i < a.length) ops.push({ t: '-', s: a[i++] });
  while (j < b.length) ops.push({ t: '+', s: b[j++] });

  // Keep changed lines and a little context around them.
  const keep = new Array(ops.length).fill(false);
  ops.forEach((op, index) => {
    if (op.t === ' ') return;
    for (let k = Math.max(0, index - context); k <= Math.min(ops.length - 1, index + context); k++) keep[k] = true;
  });
  const out = [];
  let skipped = false;
  ops.forEach((op, index) => {
    if (keep[index]) {
      out.push(op);
      skipped = false;
    } else if (!skipped) {
      out.push({ t: '…', s: '' });
      skipped = true;
    }
  });
  return out;
}

export function countChanges(ops) {
  return {
    added: ops.filter((o) => o.t === '+').length,
    removed: ops.filter((o) => o.t === '-').length,
  };
}
