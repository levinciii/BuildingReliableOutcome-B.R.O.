// The two pop-ups: "Allow this change?" and Settings.
import { $, h } from './util.js';
import { lineDiff, countChanges } from './diff.js';
import { newProfile, DEFAULT_SETTINGS } from './settings.js';

const TYPE_LABELS = { claude: 'Claude (Anthropic)', openai: 'OpenAI-compatible', ollama: 'Ollama (on this PC)' };
const BASE_HINTS = {
  claude: 'Leave empty to use Anthropic',
  openai: 'https://api.openai.com/v1',
  ollama: 'http://localhost:11434',
};
const MAX_PREVIEW_LINES = 250;

// ---------------------------------------------------------------- approval
export function askApproval({ path, content, previous, writable }) {
  const dialog = $('#approve-dialog');
  const preview = $('#approve-preview');
  preview.replaceChildren();

  const isNew = previous === null || previous === undefined;
  $('#approve-title').textContent = isNew ? `Create ${path}?` : `Change ${path}?`;
  const lineCount = content.split('\n').length;
  let summary;

  if (isNew) {
    summary = `A new file with ${lineCount} lines.`;
    content
      .split('\n')
      .slice(0, MAX_PREVIEW_LINES)
      .forEach((line) => preview.append(h('div', { class: 'add', text: `+ ${line}` })));
    if (lineCount > MAX_PREVIEW_LINES) preview.append(h('div', { class: 'gap', text: `… ${lineCount - MAX_PREVIEW_LINES} more lines` }));
  } else {
    const ops = lineDiff(previous, content);
    if (!ops) {
      summary = `Replaces the whole file (${lineCount} lines).`;
      preview.append(h('div', { class: 'gap', text: 'The file is too large to show a line-by-line comparison.' }));
    } else {
      const { added, removed } = countChanges(ops);
      summary = added || removed ? `${added} lines added, ${removed} removed.` : 'No visible change.';
      ops.slice(0, MAX_PREVIEW_LINES).forEach((op) => {
        if (op.t === '…') preview.append(h('div', { class: 'gap', text: '⋯' }));
        else preview.append(h('div', { class: op.t === '+' ? 'add' : op.t === '-' ? 'del' : '', text: `${op.t} ${op.s}` }));
      });
    }
  }
  if (!writable) summary += ' Your uploaded files are not touched: the result is offered as a download.';
  $('#approve-summary').textContent = summary;

  return new Promise((resolve) => {
    const onClose = () => {
      dialog.removeEventListener('close', onClose);
      resolve(dialog.returnValue === 'allow');
    };
    dialog.returnValue = '';
    dialog.addEventListener('close', onClose);
    dialog.showModal();
    $('button[value="deny"]', dialog)?.focus(); // the safe choice is the default
  });
}

// ---------------------------------------------------------------- settings
/**
 * Opens Settings. Resolves to {settings, keys} when saved, or null when cancelled.
 * onTest(profile, key) -> Promise<string> powers each model's "Test" button.
 */
export function openSettings({ settings, keys, voices, onTest, onReset }) {
  const dialog = $('#settings-dialog');
  const draft = JSON.parse(JSON.stringify(settings.profiles));
  const keyDraft = { ...keys };
  let activeId = settings.activeId;
  const list = $('#profiles');

  const renderProfiles = () => {
    list.replaceChildren();
    draft.forEach((profile) => {
      const result = h('span', { class: 'test-result', 'aria-live': 'polite' });
      const keyField = h('label', { class: 'field' }, h('span', {}, 'API key'),
        h('input', {
          type: 'password', autocomplete: 'off', spellcheck: 'false', value: keyDraft[profile.id] || '',
          placeholder: profile.type === 'ollama' ? 'Not needed' : 'Paste your key',
          onInput: (e) => { keyDraft[profile.id] = e.target.value.trim(); },
        }));
      if (profile.type === 'ollama') keyField.hidden = true;

      const typeSelect = h('select', {
        'aria-label': 'Type',
        onChange: (e) => {
          profile.type = e.target.value;
          renderProfiles();
        },
      }, Object.entries(TYPE_LABELS).map(([value, label]) => h('option', { value, selected: profile.type === value }, label)));

      const row = h('div', { class: 'profile' },
        h('div', { class: 'profile-top' },
          h('label', { class: 'radio' },
            h('input', { type: 'radio', name: 'active-model', value: profile.id, checked: profile.id === activeId, onChange: () => { activeId = profile.id; } }),
            'Use this one'),
          h('span', { class: 'spacer' }),
          h('button', {
            type: 'button', class: 'btn', onClick: async (e) => {
              const btn = e.currentTarget;
              btn.disabled = true;
              result.className = 'test-result';
              result.textContent = 'Testing…';
              try {
                const answer = await onTest({ ...profile }, keyDraft[profile.id] || '');
                result.className = 'test-result ok';
                result.textContent = `Works. It answered: ${String(answer).slice(0, 60)}`;
              } catch (err) {
                result.className = 'test-result fail';
                result.textContent = err.message;
              } finally {
                btn.disabled = false;
              }
            },
          }, 'Test'),
          h('button', {
            type: 'button', class: 'btn ghost', disabled: draft.length <= 1, onClick: () => {
              draft.splice(draft.indexOf(profile), 1);
              if (activeId === profile.id) activeId = draft[0].id;
              renderProfiles();
            },
          }, 'Remove')),
        h('div', { class: 'profile-fields' },
          h('label', { class: 'field' }, h('span', {}, 'Name'),
            h('input', { type: 'text', value: profile.name, onInput: (e) => { profile.name = e.target.value; } })),
          h('label', { class: 'field' }, h('span', {}, 'Type'), typeSelect),
          h('label', { class: 'field' }, h('span', {}, 'Model name'),
            h('input', { type: 'text', value: profile.model, spellcheck: 'false', onInput: (e) => { profile.model = e.target.value.trim(); } })),
          h('label', { class: 'field' }, h('span', {}, 'Base URL'),
            h('input', { type: 'text', value: profile.baseUrl || '', spellcheck: 'false', placeholder: BASE_HINTS[profile.type], onInput: (e) => { profile.baseUrl = e.target.value.trim(); } })),
          keyField),
        result);
      list.append(row);
    });
  };
  renderProfiles();

  $('#btn-add-profile').onclick = () => {
    const p = newProfile();
    draft.push(p);
    renderProfiles();
    list.lastElementChild?.querySelector('input[type="text"]')?.focus();
  };

  $('#remember-keys').checked = Boolean(settings.rememberKeys);
  $('#set-wake').value = settings.wakeWords;
  $('#set-window').value = settings.conversationSeconds;
  $('#set-speak').value = settings.speak;
  $('#set-rate').value = settings.rate;
  const voiceSelect = $('#set-voice');
  voiceSelect.replaceChildren(h('option', { value: '' }, 'Browser default'));
  voices.forEach((v) => voiceSelect.append(h('option', { value: v.voiceURI, selected: v.voiceURI === settings.voiceURI }, `${v.name} (${v.lang})`)));

  const close = (value) => dialog.close(value);
  $('#btn-close-settings').onclick = () => close('cancel');
  $('#btn-cancel-settings').onclick = () => close('cancel');
  $('#btn-reset-settings').onclick = () => {
    if (window.confirm('Forget all settings, keys and models on this device?')) {
      close('reset');
    }
  };

  return new Promise((resolve) => {
    const onClose = () => {
      dialog.removeEventListener('close', onClose);
      if (dialog.returnValue === 'reset') {
        onReset?.();
        return resolve(null);
      }
      if (dialog.returnValue !== 'save') return resolve(null);
      const cleaned = draft.map((p) => ({ ...p, name: p.name.trim() || 'Unnamed model' }));
      const fallbackRate = DEFAULT_SETTINGS.rate;
      resolve({
        settings: {
          ...settings,
          profiles: cleaned,
          activeId: cleaned.some((p) => p.id === activeId) ? activeId : cleaned[0].id,
          rememberKeys: $('#remember-keys').checked,
          wakeWords: $('#set-wake').value.trim() || DEFAULT_SETTINGS.wakeWords,
          conversationSeconds: Math.min(300, Math.max(5, Number($('#set-window').value) || DEFAULT_SETTINGS.conversationSeconds)),
          speak: $('#set-speak').value,
          voiceURI: voiceSelect.value,
          rate: Number($('#set-rate').value) || fallbackRate,
        },
        keys: Object.fromEntries(Object.entries(keyDraft).filter(([id, k]) => k && cleaned.some((p) => p.id === id))),
      });
    };
    dialog.returnValue = '';
    dialog.addEventListener('close', onClose);
    dialog.showModal();
  });
}
