// The controller: connects the screen, voice, project, tools and the AI model.
import { $, h, sleep, downloadText, uid } from './util.js';
import { loadSettings, saveSettings, loadKeys, saveKeys, clearAll, needsKey, DEFAULT_SETTINGS } from './settings.js';
import { FsaProject, UploadProject, GithubProject, ProjectError } from './project.js';
import { ToolRunner } from './tools.js';
import { buildSystem } from './prompt.js';
import { makeBrain, testProfile, BrainError } from './brains.js';
import { Voice, cleanForSpeech } from './voice.js';
import { buildRegex, parseWords, extract, isNoise } from './wake.js';
import { parse as parseCommand, matchProfile, HELP_TEXT } from './commands.js';
import { ChatView } from './chat.js';
import { askApproval, openSettings, askPassphrase } from './dialogs.js';
import { saveChat, getChat, listChats, deleteChat, clearChats, turnsFromLog, hasVault, saveVault, openVault, removeVault, makeBackup, readBackup, mergeChats } from './store.js';
import { MIN_PASSPHRASE } from './vault.js';

const SUGGESTIONS = [
  'Give an overview of this project',
  'Find where we handle errors',
  'Suggest three features that would help this project, then build the first one',
];

const MODE_HINTS = {
  wake: 'Say “Hey bro”, then your question.',
  always: 'Every sentence you say is a request. Best in a quiet room.',
  push: 'Tap the mic, say one request, then it answers.',
};

export class App {
  constructor() {
    this.settings = loadSettings();
    this.keys = loadKeys();
    this.project = null;
    this.tools = null;
    this.brain = null;
    this.chat = new ChatView($('#messages'));
    this.voice = new Voice({
      onFinal: (text) => this.onSpeech(text),
      onInterim: (text) => this.showInterim(text),
      onState: () => this.refreshOrb(),
      onError: (message) => {
        this.listening = false;
        this.toast(message, true);
        this.refreshOrb();
      },
    });
    this.wakeRe = buildRegex(parseWords(this.settings.wakeWords));
    this.busy = false;
    this.abort = null;
    this.listening = false;
    this.onceActive = false;
    this.dialogOpen = false;
    this.awakeUntil = 0;
    this.toolHandles = new Map();
    this.chatId = null;
    this.pendingTurns = null; // earlier questions and answers, when a saved chat is reopened
    this.vaultPass = null; // the key passphrase, kept in memory only
  }

  get profile() {
    return this.settings.profiles.find((p) => p.id === this.settings.activeId) || this.settings.profiles[0];
  }

  // ------------------------------------------------------------ start-up
  init() {
    this.bindEvents();
    this.renderModels();
    this.renderProject();
    $('#mode-select').value = this.settings.mode;
    this.refreshOrb();
    this.showWelcome();
    this.showSupportBanner();
    this.renderHistory();
    if (hasVault()) this.unlockVault();
    setInterval(() => {
      if (this.listening) this.refreshOrb();
    }, 1000);
    window.addEventListener('beforeunload', () => this.voice.cancelSpeech());
  }

  bindEvents() {
    $('#composer').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#composer-input');
      const text = input.value;
      input.value = '';
      this.resizeInput();
      this.submit(text, 'typed');
    });
    $('#composer-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        $('#composer').requestSubmit();
      }
    });
    $('#composer-input').addEventListener('input', () => this.resizeInput());
    $('#btn-stop').addEventListener('click', () => this.stopAnswering());
    $('#orb').addEventListener('click', () => this.toggleMic());
    $('#btn-mic').addEventListener('click', () => this.toggleMic());
    $('#btn-folder').addEventListener('click', () => this.chooseFolder());
    $('#btn-upload').addEventListener('click', () => $('#upload-input').click());
    $('#upload-input').addEventListener('change', (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      if (files.length) this.setProject(new UploadProject(files));
    });
    $('#btn-github').addEventListener('click', () => this.importGithub());
    $('#btn-new').addEventListener('click', () => this.newChat());
    $('#history-list').addEventListener('click', (e) => {
      const open = e.target.closest('[data-open]');
      const del = e.target.closest('[data-delete]');
      if (open) this.openChat(open.dataset.open);
      else if (del) {
        deleteChat(del.dataset.delete);
        if (this.chatId === del.dataset.delete) this.chatId = null;
        this.renderHistory();
      }
    });
    $('#btn-settings').addEventListener('click', () => this.openSettingsDialog());
    $('#btn-settings-side').addEventListener('click', () => this.openSettingsDialog());
    $('#model-select').addEventListener('change', (e) => this.selectProfile(e.target.value));
    $('#mode-select').addEventListener('change', (e) => {
      this.stopListening();
      this.settings.mode = e.target.value;
      saveSettings(this.settings);
      this.refreshOrb();
    });
    const toggleMenu = (open) => {
      $('#side').classList.toggle('open', open);
      $('#scrim').hidden = !open;
      $('#btn-menu').setAttribute('aria-expanded', String(open));
    };
    $('#btn-menu').addEventListener('click', () => toggleMenu(!$('#side').classList.contains('open')));
    $('#scrim').addEventListener('click', () => toggleMenu(false));
    $('#side').addEventListener('click', (e) => {
      if (e.target.closest('#btn-folder, #btn-settings-side, #orb, [data-open], #btn-github')) toggleMenu(false);
    });
  }

  resizeInput() {
    const input = $('#composer-input');
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }

  showSupportBanner() {
    const notes = [];
    if (!Voice.canListen) notes.push('Voice listening works in Chrome or Edge. In this browser you can still type, and answers can still be read aloud.');
    if (!window.showDirectoryPicker) notes.push('This browser cannot give write access to a folder. Use “Upload a folder” or import a public GitHub repo (both read-only).');
    if (notes.length) {
      $('#banner').textContent = notes.join(' ');
      $('#banner').hidden = false;
    }
    if (!Voice.canListen) {
      $('#orb').disabled = true;
      $('#btn-mic').disabled = true;
    }
  }

  showWelcome() {
    this.chat.showWelcome({ suggestions: SUGGESTIONS, onPick: (text) => this.submit(text, 'typed') });
  }

  // ------------------------------------------------------------ small UI helpers
  toast(message, isError = false) {
    const el = h('div', { class: `toast${isError ? ' error' : ''}`, role: isError ? 'alert' : 'status', text: message });
    $('#toasts').append(el);
    setTimeout(() => el.remove(), isError ? 9000 : 4000);
  }

  showInterim(text) {
    $('#interim').textContent = text ? `“${text}”` : '';
  }

  refreshOrb() {
    const mode = this.settings.mode;
    let state = 'off';
    let text = mode === 'push' ? 'Tap and speak' : 'Tap to start listening';
    if (this.busy) {
      state = 'thinking';
      text = 'Thinking…';
    } else if (this.voice.speaking) {
      state = 'speaking';
      text = 'Speaking…';
    } else if (this.onceActive) {
      state = 'listening';
      text = 'Listening…';
    } else if (this.listening) {
      const awake = Date.now() < this.awakeUntil;
      if (mode === 'wake') {
        state = awake ? 'awake' : 'listening';
        text = awake ? 'Listening, just talk' : 'Say “Hey bro”';
      } else {
        state = 'listening';
        text = 'Listening…';
      }
    }
    const orb = $('#orb');
    orb.dataset.state = state;
    orb.setAttribute('aria-pressed', String(this.listening));
    orb.setAttribute('aria-label', this.listening ? 'Stop listening' : mode === 'push' ? 'Speak now' : 'Start listening');
    $('#orb-status').textContent = text;
    $('#orb-hint').textContent = MODE_HINTS[mode];
    const mic = $('#btn-mic');
    mic.dataset.on = String(this.listening || this.onceActive);
    mic.setAttribute('aria-label', orb.getAttribute('aria-label'));
    const busy = this.busy;
    $('#btn-send').hidden = busy;
    $('#btn-stop').hidden = !busy;
  }

  renderModels() {
    const select = $('#model-select');
    select.replaceChildren(
      ...this.settings.profiles.map((p) => h('option', { value: p.id, selected: p.id === this.settings.activeId }, p.name)),
    );
    const p = this.profile;
    $('#top-model').textContent = p.model ? `${p.name} · ${p.model}` : p.name;
    const missingKey = needsKey(p) && !this.keys[p.id];
    $('#model-status').textContent = missingKey
      ? 'Add your API key in Settings to use this model.'
      : p.type === 'ollama' ? 'Runs on your own PC through Ollama.' : 'Ready.';
  }

  renderProject() {
    const project = this.project;
    $('#project-name').textContent = project ? project.name : 'No folder chosen yet';
    $('#project-meta').textContent = project
      ? `${this.fileCount}${this.fileCount >= 8000 ? '+' : ''} files · ${project.writable ? 'read and write' : 'read-only'}`
      : 'Pick the folder you want help with.';
    const changes = project && !project.writable ? project.changedFiles() : [];
    $('#changes').hidden = changes.length === 0;
    const list = $('#changes-list');
    list.replaceChildren(
      ...changes.map((c) => h('li', {}, h('span', { text: c.path }), h('button', { type: 'button', class: 'btn', onClick: () => downloadText(c.path, c.content) }, 'Download'))),
    );
  }

  // ------------------------------------------------------------ project
  async chooseFolder() {
    if (!window.showDirectoryPicker) {
      this.toast('This browser has no folder picker. Use “Upload a folder” instead.', true);
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ id: 'bro-project', mode: 'readwrite' });
      await this.setProject(new FsaProject(handle));
    } catch (e) {
      if (e?.name !== 'AbortError') this.toast(`Could not open that folder: ${e?.message || e}`, true);
    }
  }

  async importGithub() {
    const dialog = $('#gh-dialog');
    const input = $('#gh-input');
    const error = $('#gh-error');
    error.textContent = '';
    input.value = '';
    const address = await new Promise((resolve) => {
      let value = null;
      const form = $('#gh-form');
      const onSubmit = () => {
        value = input.value.trim();
      };
      const onClose = () => {
        form.removeEventListener('submit', onSubmit);
        dialog.removeEventListener('close', onClose);
        resolve(value);
      };
      $('#gh-cancel').onclick = () => dialog.close('cancel');
      form.addEventListener('submit', onSubmit);
      dialog.addEventListener('close', onClose);
      dialog.showModal();
      input.focus();
    });
    if (!address) return;
    this.toast('Reading the repository list…');
    try {
      await this.setProject(await GithubProject.load(address));
    } catch (e) {
      this.toast(e instanceof ProjectError ? e.message : `Could not import: ${e?.message || e}`, true);
    }
  }

  async setProject(project) {
    this.project = project;
    this.tools = new ToolRunner(project, {
      confirm: (request) => this.confirmWrite(request),
      onEvent: (event) => this.onToolEvent(event),
    });
    this.brain = null; // a new project means a new conversation
    this.fileCount = await project.countFiles();
    this.renderProject();
    this.chat.addSystem(
      `Connected to “${project.name}” (${this.fileCount}${this.fileCount >= 8000 ? '+' : ''} files, ${project.writable ? 'read and write' : 'read-only'}).`,
    );
  }

  async confirmWrite(request) {
    this.dialogOpen = true;
    if (this.listening) this.voice.beep(520, 140);
    try {
      return await askApproval({ ...request, writable: this.project.writable });
    } finally {
      this.dialogOpen = false;
    }
  }

  onToolEvent(event) {
    if (event.phase === 'start') {
      this.toolHandles.set(event.id, this.chat.addTool(event.label));
    } else {
      this.toolHandles.get(event.id)?.done(event.ok);
      this.toolHandles.delete(event.id);
      if (event.name === 'write_file' || event.name === 'save_note') this.renderProject();
    }
  }

  // ------------------------------------------------------------ models and settings
  async selectProfile(id) {
    this.settings.activeId = id;
    saveSettings(this.settings);
    this.brain = null;
    this.renderModels();
  }

  async openSettingsDialog() {
    if (hasVault() && !this.vaultPass) {
      // Never overwrite a locked vault: unlock it first so no saved key is lost.
      await this.unlockVault();
      if (!this.vaultPass) return;
    }
    this.dialogOpen = true;
    try {
      const result = await openSettings({
        settings: this.settings,
        keys: this.keys,
        voices: this.voice.voices(),
        onTest: (profile, key) => testProfile(profile, key),
        onReset: () => {
          clearAll();
          clearChats();
          removeVault();
          location.reload();
        },
        hasPassphrase: Boolean(this.vaultPass),
        onBackup: (includeKeys) => this.backup(includeKeys),
        onRestore: (file) => this.restore(file),
        onClearChats: () => {
          clearChats();
          this.chatId = null;
          this.renderHistory();
          this.toast('Saved chats deleted.');
        },
      });
      if (!result) return;
      this.settings = result.settings;
      this.keys = result.keys;
      if (result.vaultPass) {
        if (result.vaultPass.length < MIN_PASSPHRASE) {
          this.settings.lockKeys = false;
          this.toast(`Keys were not locked: the passphrase needs ${MIN_PASSPHRASE} or more characters.`, true);
        } else {
          this.vaultPass = result.vaultPass;
        }
      }
      if (this.settings.lockKeys && !this.vaultPass) {
        this.settings.lockKeys = false;
        this.toast('Keys were not locked: choose a passphrase first.', true);
      }
      saveSettings(this.settings);
      await this.persistKeys();
      this.wakeRe = buildRegex(parseWords(this.settings.wakeWords));
      this.brain = null;
      this.renderModels();
      this.refreshOrb();
      this.toast('Settings saved.');
    } finally {
      this.dialogOpen = false;
    }
  }

  /** Keys go to one of three places: locked on this device, plain on this device, or this tab only. */
  async persistKeys() {
    if (this.settings.lockKeys && this.vaultPass) {
      await saveVault(this.keys, this.vaultPass);
      saveKeys({}, false); // no plain copy anywhere
    } else {
      removeVault();
      saveKeys(this.keys, this.settings.rememberKeys);
    }
  }

  async unlockVault() {
    for (;;) {
      const pass = await askPassphrase({
        title: 'Unlock your API keys',
        message: 'Your saved keys are encrypted on this device. Enter the passphrase to use them. Skip to continue without them.',
        okLabel: 'Unlock',
        cancelLabel: 'Skip',
      });
      if (pass === null) {
        this.toast('Keys stay locked. Reload the page to unlock them later.');
        return;
      }
      try {
        this.keys = { ...this.keys, ...(await openVault(pass)) };
        this.vaultPass = pass;
        this.settings.lockKeys = true;
        this.renderModels();
        this.toast('Keys unlocked.');
        return;
      } catch (e) {
        this.toast(e.message, true);
      }
    }
  }

  // ------------------------------------------------------------ saved chats and backups
  renderHistory() {
    const chats = listChats();
    const list = $('#history-list');
    list.replaceChildren(
      ...chats.map((c) =>
        h('li', {},
          h('button', { type: 'button', class: 'open', dataset: { open: c.id }, 'aria-current': c.id === this.chatId ? 'true' : null },
            h('span', { class: 'title', text: c.title || 'Untitled chat' }),
            h('span', { class: 'when', text: `${new Date(c.updated).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}${c.project ? ` · ${c.project}` : ''}` })),
          h('button', { type: 'button', class: 'del', dataset: { delete: c.id }, 'aria-label': `Delete chat ${c.title || ''}`, text: '×' })),
      ),
    );
    $('#history-empty').hidden = chats.length > 0;
  }

  autosave() {
    if (this.settings.saveChats === false) return;
    const log = this.chat.log;
    const first = log.find((item) => item.t === 'user');
    if (!first) return;
    if (!this.chatId) this.chatId = uid();
    saveChat(
      { id: this.chatId, title: first.text, project: this.project?.name, model: this.profile.name, log },
      Object.values(this.keys),
    );
    this.renderHistory();
  }

  openChat(id) {
    const saved = getChat(id);
    if (!saved || this.busy) return;
    this.stopAnswering();
    this.chatId = id;
    this.brain = null;
    this.pendingTurns = turnsFromLog(saved.log);
    this.chat.restore(saved.log);
    this.chat.addSystem(
      saved.project && saved.project !== this.project?.name
        ? `Chat restored. It was about “${saved.project}”: choose that folder again so files can be read.`
        : 'Chat restored. Pick up where we left off.',
    );
    this.renderHistory();
  }

  async backup(includeKeys) {
    const passphrase = await askPassphrase({
      title: 'Back up to an encrypted file',
      message: 'Choose a passphrase for this backup. It cannot be recovered, and the file is useless without it.',
      confirm: true,
      okLabel: 'Create backup',
    });
    if (!passphrase) return;
    try {
      const blob = await makeBackup({ settings: this.settings, keys: this.keys, includeKeys }, passphrase);
      downloadText(`bro-backup-${new Date().toISOString().slice(0, 10)}.bro`, JSON.stringify(blob));
      this.toast(includeKeys ? 'Backup saved, including keys.' : 'Backup saved. Keys were not included.');
    } catch (e) {
      this.toast(e.message, true);
    }
  }

  async restore(file) {
    let blob;
    try {
      blob = JSON.parse(await file.text());
    } catch {
      this.toast('That file is not a B.R.O. backup.', true);
      return;
    }
    const passphrase = await askPassphrase({ title: 'Restore a backup', message: 'Enter the passphrase this backup was made with.', okLabel: 'Restore' });
    if (!passphrase) return;
    try {
      const data = await readBackup(blob, passphrase);
      mergeChats(data.chats);
      if (data.settings?.profiles?.length) {
        this.settings = { ...DEFAULT_SETTINGS, ...data.settings, lockKeys: this.settings.lockKeys };
        saveSettings(this.settings);
      }
      if (data.keys) {
        this.keys = { ...this.keys, ...data.keys };
        await this.persistKeys();
      }
      this.renderModels();
      this.renderHistory();
      this.toast(`Restored ${data.chats?.length || 0} chats${data.keys ? ' and keys' : ''}.`);
    } catch (e) {
      this.toast(e.message, true);
    }
  }

  async ensureBrain() {
    if (this.brain) return this.brain;
    const profile = this.profile;
    const system = await buildSystem(this.project, profile);
    this.brain = makeBrain(profile, this.keys[profile.id] || '', this.tools, system);
    if (this.pendingTurns) {
      this.brain.messages = this.pendingTurns;
      this.pendingTurns = null;
    }
    return this.brain;
  }

  // ------------------------------------------------------------ listening
  async toggleMic() {
    if (!Voice.canListen) {
      this.toast('Voice listening needs Chrome or Edge.', true);
      return;
    }
    if (this.settings.mode === 'push') return this.pushToTalk();
    if (this.listening) this.stopListening();
    else this.startListening();
    return undefined;
  }

  startListening() {
    this.voice.cancelSpeech();
    this.listening = this.voice.start();
    this.voice.beep(660, 80);
    this.refreshOrb();
  }

  stopListening() {
    this.listening = false;
    this.voice.stop();
    this.voice.cancelOnce();
    this.awakeUntil = 0;
    this.showInterim('');
    this.refreshOrb();
  }

  async pushToTalk() {
    if (this.busy) return;
    if (this.onceActive) {
      this.voice.cancelOnce();
      return;
    }
    this.voice.cancelSpeech();
    this.onceActive = true;
    this.refreshOrb();
    const text = await this.voice.listenOnce();
    this.onceActive = false;
    this.showInterim('');
    this.refreshOrb();
    if (text) this.submit(text, 'voice');
  }

  /** Called with every finished sentence the browser recognised. */
  onSpeech(text) {
    if (!text || this.busy || this.voice.speaking || this.dialogOpen) return;
    const mode = this.settings.mode;
    const { woke, command } = extract(text, this.wakeRe);
    const inWindow = Date.now() < this.awakeUntil;
    if (mode === 'wake' && !woke && !inWindow) {
      this.showInterim(`Heard “${text}”. Say “Hey bro” first.`);
      return;
    }
    if (!woke && isNoise(text)) return;
    const windowMs = this.settings.conversationSeconds * 1000;
    if (woke) {
      this.voice.beep(880, 110);
      if (!command) {
        this.awakeUntil = Date.now() + windowMs;
        this.showInterim('');
        this.refreshOrb();
        this.say('Yes?', 'voice');
        return;
      }
    }
    this.awakeUntil = Date.now() + windowMs;
    this.showInterim('');
    this.submit(command, 'voice');
  }

  // ------------------------------------------------------------ talking to the model
  stopAnswering() {
    this.abort?.abort();
    this.voice.cancelSpeech();
  }

  async submit(rawText, source = 'typed') {
    const text = String(rawText ?? '').trim();
    if (!text || this.busy) return;
    const parsed = parseCommand(text);
    this.chat.addUser(text);
    if (parsed) {
      await this.runCommand(parsed, source);
      return;
    }

    this.busy = true;
    this.abort = new AbortController();
    this.voice.cancelSpeech();
    this.chat.setThinking(true);
    this.refreshOrb();
    let reply = '';
    let failure = null;
    try {
      const brain = await this.ensureBrain();
      reply = await brain.ask(text, { signal: this.abort.signal });
    } catch (e) {
      failure = e;
      this.brain?.rollback();
    }
    this.chat.setThinking(false);
    this.busy = false;
    this.abort = null;
    this.toolHandles.clear();

    if (failure) {
      if (failure.stopped) {
        this.chat.addSystem('Stopped.');
      } else {
        const message = failure instanceof BrainError ? failure.message : `Something went wrong: ${failure?.message || failure}`;
        this.chat.addAssistant(message, { error: true });
        await this.maybeSpeak('Hit a problem. Check the screen.', source);
      }
    } else {
      const answer = reply || '(no answer)';
      this.chat.addAssistant(answer);
      this.autosave();
      await this.maybeSpeak(answer, source);
    }
    if (this.listening) this.awakeUntil = Date.now() + this.settings.conversationSeconds * 1000;
    this.refreshOrb();
  }

  async say(text, source) {
    this.chat.addAssistant(text);
    await this.maybeSpeak(text, source);
  }

  async maybeSpeak(text, source) {
    const preference = this.settings.speak;
    if (preference === 'off' || (preference === 'voice' && source !== 'voice') || !Voice.canSpeak) return;
    this.voice.pause(); // never listen to its own voice
    this.refreshOrb();
    const speaking = this.voice.speak(cleanForSpeech(text), { rate: this.settings.rate, voiceURI: this.settings.voiceURI });
    this.refreshOrb();
    await speaking;
    await sleep(250);
    this.voice.resume();
    this.refreshOrb();
  }

  // ------------------------------------------------------------ built-in commands
  async runCommand({ cmd, arg }, source) {
    switch (cmd) {
      case 'switch': {
        const profile = matchProfile(arg, this.settings.profiles);
        if (!profile) {
          await this.say(`No model called ${arg}. Say “list models” to hear the options.`, source);
          return;
        }
        await this.selectProfile(profile.id);
        const warning = needsKey(profile) && !this.keys[profile.id] ? ' Add its API key in Settings before asking anything.' : '';
        await this.say(`Switched to ${profile.name}. Starting a fresh conversation.${warning}`, source);
        return;
      }
      case 'which':
        await this.say(`Running on ${this.profile.name}${this.profile.model ? ` (${this.profile.model})` : ''}.`, source);
        return;
      case 'list': {
        const names = this.settings.profiles.map((p) => p.name).join(', ');
        await this.say(`Available models: ${names}. Running on ${this.profile.name}.`, source);
        return;
      }
      case 'reset':
        this.brain = null;
        await this.say('Okay, starting a fresh conversation.', source);
        return;
      case 'stop':
        this.stopListening();
        await this.say('Stopped listening. Tap the mic to start again.', source);
        return;
      default:
        await this.say(HELP_TEXT, source);
    }
  }

  newChat() {
    this.stopAnswering();
    this.brain = null;
    this.chatId = null;
    this.pendingTurns = null;
    this.toolHandles.clear();
    this.showWelcome();
    this.renderHistory();
    this.showInterim('');
  }
}
