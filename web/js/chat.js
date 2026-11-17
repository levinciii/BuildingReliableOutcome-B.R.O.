// The conversation on screen: messages, tool chips ("Reading app.py"), the thinking indicator, the welcome card.
import { h } from './util.js';
import { renderMarkdown } from './markdown.js';

export class ChatView {
  constructor(root) {
    this.root = root;
    this.typing = null;
    this.toolBox = null;
    this.welcomeEl = null;
    this.log = []; // what is on screen, in a form that can be saved and replayed
    // "Copy" buttons on code blocks (one listener for all of them).
    root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-copy]');
      if (!button) return;
      const code = button.closest('.code')?.querySelector('pre')?.textContent ?? '';
      navigator.clipboard
        ?.writeText(code)
        .then(() => {
          button.textContent = 'Copied';
          setTimeout(() => (button.textContent = 'Copy'), 1500);
        })
        .catch(() => (button.textContent = 'Select and copy'));
    });
  }

  clear() {
    this.root.replaceChildren();
    this.typing = null;
    this.toolBox = null;
    this.welcomeEl = null;
    this.log = [];
  }

  /** Show a saved conversation again. */
  restore(log) {
    this.clear();
    for (const item of log) {
      if (item.t === 'user') this.addUser(item.text);
      else if (item.t === 'assistant') this.addAssistant(item.text, { error: Boolean(item.error) });
      else if (item.t === 'tool') this.addTool(item.label).done(item.ok !== false);
    }
  }

  add(el) {
    if (this.welcomeEl) {
      this.welcomeEl.remove();
      this.welcomeEl = null;
    }
    if (this.typing && this.typing.parentNode === this.root) this.root.insertBefore(el, this.typing);
    else this.root.append(el);
    this.scroll();
    return el;
  }

  scroll() {
    requestAnimationFrame(() => {
      this.root.scrollTop = this.root.scrollHeight;
    });
  }

  addUser(text) {
    this.toolBox = null;
    this.log.push({ t: 'user', text });
    return this.add(h('div', { class: 'msg user' }, h('div', { class: 'bubble', text })));
  }

  addAssistant(text, { error = false } = {}) {
    this.toolBox = null;
    this.log.push({ t: 'assistant', text, error });
    const bubble = h('div', { class: 'bubble md' });
    bubble.innerHTML = renderMarkdown(text); // safe: renderMarkdown escapes every piece of text
    return this.add(h('div', { class: `msg assistant${error ? ' error' : ''}` }, bubble));
  }

  addSystem(text) {
    return this.add(h('p', { class: 'system', text }));
  }

  addTool(label) {
    if (!this.toolBox || this.toolBox.parentNode !== this.root) {
      this.toolBox = this.add(h('div', { class: 'tools' }));
    }
    const entry = { t: 'tool', label, ok: null };
    this.log.push(entry);
    const chip = h('span', { class: 'chip', dataset: { state: 'run' }, text: label });
    this.toolBox.append(chip);
    this.scroll();
    return {
      done: (ok) => {
        entry.ok = Boolean(ok);
        chip.dataset.state = ok ? 'ok' : 'fail';
      },
    };
  }

  setThinking(on) {
    if (on && !this.typing) {
      this.typing = h(
        'div',
        { class: 'msg assistant', 'aria-label': 'B.R.O. is thinking' },
        h('div', { class: 'typing' }, h('span'), h('span'), h('span')),
      );
      if (this.welcomeEl) {
        this.welcomeEl.remove();
        this.welcomeEl = null;
      }
      this.root.append(this.typing);
      this.scroll();
    } else if (!on && this.typing) {
      this.typing.remove();
      this.typing = null;
    }
  }

  showWelcome({ suggestions, onPick }) {
    this.clear();
    this.welcomeEl = h(
      'div',
      { class: 'welcome' },
      h('span', { class: 'logo', 'aria-hidden': 'true' }, 'B'),
      h('h2', {}, 'What are we building?'),
      h('ol', { class: 'steps' },
        h('li', {}, 'Choose your project folder (left).'),
        h('li', {}, 'Add an API key in Settings, or pick a model on your own PC.'),
        h('li', {}, 'Say “Hey bro” after tapping the mic, or type below.'),
      ),
      h(
        'div',
        { class: 'suggestions' },
        suggestions.map((s) => h('button', { type: 'button', class: 'btn', onClick: () => onPick(s) }, s)),
      ),
    );
    this.root.append(this.welcomeEl);
  }
}
