// A tiny, safe markdown renderer. Everything is HTML-escaped first, so text from an AI model can never inject
// markup or scripts. Supports: fenced code blocks, inline code, bold, links (http/https only), lists, headings.
import { escapeHtml } from './util.js';

function inline(text) {
  // Split out inline code first so formatting characters inside code are left alone.
  return text
    .split(/(`[^`\n]+`)/g)
    .map((part) => {
      if (/^`[^`\n]+`$/.test(part)) return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      let s = escapeHtml(part);
      s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(
        /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
      );
      return s;
    })
    .join('');
}

function blocks(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let para = [];
  let list = null; // {tag, items}

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };

  for (const line of lines) {
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.*)$/);
    if (bullet || numbered) {
      flushPara();
      const tag = bullet ? 'ul' : 'ol';
      if (list && list.tag !== tag) flushList();
      list = list || { tag, items: [] };
      list.items.push((bullet || numbered)[1]);
    } else if (heading) {
      flushPara();
      flushList();
      out.push(`<p class="md-h">${inline(heading[1])}</p>`);
    } else if (line.trim() === '') {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return out.join('');
}

function codeBlock(lang, code) {
  const label = escapeHtml(lang || 'code');
  return (
    `<div class="code"><div class="code-bar"><span>${label}</span>` +
    `<button type="button" class="copy" data-copy>Copy</button></div>` +
    `<pre><code>${escapeHtml(code)}</code></pre></div>`
  );
}

export function renderMarkdown(source) {
  const parts = String(source ?? '').split('```');
  return parts
    .map((part, i) => {
      if (i % 2 === 0) return blocks(part);
      const newline = part.indexOf('\n');
      let lang = '';
      let code = part;
      if (newline !== -1 && /^[\w+#.-]*$/.test(part.slice(0, newline).trim())) {
        lang = part.slice(0, newline).trim();
        code = part.slice(newline + 1);
      }
      return codeBlock(lang, code.replace(/\n$/, ''));
    })
    .join('');
}
