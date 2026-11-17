// Brains: the part that thinks. Runs entirely in your browser; your key goes straight to the provider you chose.
//   claude -> Anthropic Claude          openai -> any OpenAI-compatible service (OpenAI, LM Studio, Groq, OpenRouter...)
//   ollama -> a model on your own PC through Ollama (needs OLLAMA_ORIGINS set, see the README)
import { TOOL_SCHEMAS } from './tools.js';
import { needsKey } from './settings.js';

export class BrainError extends Error {
  constructor(message, { stopped = false } = {}) {
    super(message);
    this.stopped = stopped;
  }
}

const MAX_STEPS = 12;
const MAX_HISTORY = 40;
const LOOP_MESSAGE = 'Stuck in a loop of tool calls. Try asking again in a simpler way.';

export const stripThinking = (text) => String(text ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();

function friendlyHttpError(status, bodyText, kind, profile) {
  let detail = '';
  try {
    const data = JSON.parse(bodyText);
    detail = data?.error?.message || (typeof data?.error === 'string' ? data.error : '') || data?.message || '';
  } catch {
    detail = String(bodyText || '').slice(0, 200);
  }
  const who = profile.name || kind;
  if (status === 401 || status === 403) return new BrainError(`${who} rejected the API key. Check it in Settings.`);
  if (status === 404) return new BrainError(`${who} says that model or address wasn't found. Check the model name and base URL in Settings. ${detail}`.trim());
  if (status === 429) return new BrainError(`${who} says you are out of quota or sending too fast. ${detail}`.trim());
  return new BrainError(`${who} returned an error (${status}). ${detail}`.trim());
}

function networkError(kind, profile) {
  if (kind === 'ollama') {
    return new BrainError(
      `Can't reach Ollama at ${profile.baseUrl}. Make sure Ollama is running, and that it allows this website: ` +
        `set the environment variable OLLAMA_ORIGINS to ${location.origin} and restart Ollama. ` +
        `If your browser asks to allow access to local devices, choose Allow.`,
    );
  }
  return new BrainError(`Can't reach ${profile.baseUrl || 'the service'}. Check your internet connection and the base URL in Settings.`);
}

async function postJson(url, { headers = {}, body, signal, timeoutMs, kind, profile }) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (signal?.aborted) throw new BrainError('Stopped.', { stopped: true });
    if (timedOut) throw new BrainError('The model took too long to answer.');
    throw networkError(kind, profile);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  if (!response.ok) throw friendlyHttpError(response.status, await response.text().catch(() => ''), kind, profile);
  return response.json();
}

class BaseBrain {
  constructor(profile, key, tools, system) {
    this.profile = profile;
    this.key = key;
    this.tools = tools; // ToolRunner or null (no project chosen)
    this.system = system;
    this.messages = [];
  }

  describe() {
    return `${this.profile.name} (${this.profile.model})`;
  }

  reset() {
    this.messages = [];
  }

  /** Forget the question that just failed (and anything after it) so the next one starts clean. */
  rollback() {
    while (this.messages.length) if (this.isPlainUser(this.messages.pop())) break;
  }

  isPlainUser(m) {
    return m.role === 'user' && typeof m.content === 'string';
  }

  trim() {
    while (this.messages.length > MAX_HISTORY) {
      this.messages.shift();
      while (this.messages.length && !this.isPlainUser(this.messages[0])) this.messages.shift();
    }
  }

  async runTool(name, args) {
    if (!this.tools) return 'Error: no project folder has been chosen yet.';
    return this.tools.call(name, args);
  }

  parseArgs(raw) {
    if (raw && typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw || '{}');
    } catch {
      return {};
    }
  }
}

class ClaudeBrain extends BaseBrain {
  async ask(text, { signal } = {}) {
    this.messages.push({ role: 'user', content: text });
    this.trim();
    const base = (this.profile.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
    for (let step = 0; step < MAX_STEPS; step++) {
      const body = {
        model: this.profile.model,
        max_tokens: Number(this.profile.maxTokens) || 2048,
        system: this.system,
        messages: this.messages,
      };
      if (this.tools) body.tools = TOOL_SCHEMAS;
      const data = await postJson(`${base}/v1/messages`, {
        headers: {
          'x-api-key': this.key,
          'anthropic-version': '2023-06-01',
          // Required by Anthropic to allow calls straight from a web page. The key stays in your browser.
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body,
        signal,
        timeoutMs: 180_000,
        kind: 'claude',
        profile: this.profile,
      });
      this.messages.push({ role: 'assistant', content: data.content });
      if (data.stop_reason !== 'tool_use') {
        return data.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
      }
      const results = [];
      for (const block of data.content) {
        if (block.type === 'tool_use') {
          results.push({ type: 'tool_result', tool_use_id: block.id, content: await this.runTool(block.name, block.input) });
        }
      }
      this.messages.push({ role: 'user', content: results });
    }
    return LOOP_MESSAGE;
  }
}

const toolDefsOpenAI = () =>
  TOOL_SCHEMAS.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));

class OpenAIBrain extends BaseBrain {
  async ask(text, { signal } = {}) {
    this.messages.push({ role: 'user', content: text });
    this.trim();
    const base = this.profile.baseUrl.replace(/\/$/, '');
    for (let step = 0; step < MAX_STEPS; step++) {
      const body = {
        model: this.profile.model,
        messages: [{ role: 'system', content: this.system }, ...this.messages],
      };
      if (this.tools) body.tools = toolDefsOpenAI();
      const data = await postJson(`${base}/chat/completions`, {
        headers: this.key ? { authorization: `Bearer ${this.key}` } : {},
        body,
        signal,
        timeoutMs: 180_000,
        kind: 'openai',
        profile: this.profile,
      });
      const message = data?.choices?.[0]?.message;
      if (!message) throw new BrainError('The service sent back an answer that could not be read.');
      const calls = message.tool_calls || [];
      const stored = { role: 'assistant', content: message.content || '' };
      if (calls.length) {
        calls.forEach((c, i) => {
          c.id = c.id || `call_${Date.now()}_${i}`;
        });
        stored.tool_calls = calls;
      }
      this.messages.push(stored);
      if (!calls.length) return stripThinking(message.content);
      for (const call of calls) {
        const fn = call.function || {};
        this.messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: await this.runTool(fn.name || '', this.parseArgs(fn.arguments)),
        });
      }
    }
    return LOOP_MESSAGE;
  }
}

class OllamaBrain extends BaseBrain {
  constructor(...args) {
    super(...args);
    this.sendThink = this.profile.think !== undefined && this.profile.think !== null;
  }

  async ask(text, { signal } = {}) {
    this.messages.push({ role: 'user', content: text });
    this.trim();
    const base = this.profile.baseUrl.replace(/\/$/, '');
    for (let step = 0; step < MAX_STEPS; step++) {
      const message = await this.chat(base, signal);
      const calls = message.tool_calls || [];
      const { thinking, ...stored } = message; // eslint-disable-line no-unused-vars
      this.messages.push(stored);
      if (!calls.length) return stripThinking(message.content);
      for (const call of calls) {
        const fn = call.function || {};
        this.messages.push({
          role: 'tool',
          tool_name: fn.name || '',
          content: await this.runTool(fn.name || '', this.parseArgs(fn.arguments)),
        });
      }
    }
    return LOOP_MESSAGE;
  }

  async chat(base, signal) {
    const body = {
      model: this.profile.model,
      messages: [{ role: 'system', content: this.system }, ...this.messages],
      stream: false,
      keep_alive: this.profile.keepAlive || '30m',
      options: { num_ctx: Number(this.profile.numCtx) || 8192 },
    };
    if (this.tools) body.tools = toolDefsOpenAI();
    if (this.sendThink) body.think = Boolean(this.profile.think);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const data = await postJson(`${base}/api/chat`, {
          body, signal, timeoutMs: 900_000, kind: 'ollama', profile: this.profile,
        });
        return data.message;
      } catch (e) {
        // Some models have no "thinking" mode and refuse the setting: ask again without it.
        if (attempt === 0 && 'think' in body && /think/i.test(e.message)) {
          delete body.think;
          this.sendThink = false;
          continue;
        }
        if (/wasn't found/.test(e.message)) {
          throw new BrainError(`The model "${this.profile.model}" isn't installed in Ollama. Run: ollama pull ${this.profile.model}`);
        }
        throw e;
      }
    }
    throw new BrainError('Ollama did not answer.');
  }
}

const BRAINS = { claude: ClaudeBrain, openai: OpenAIBrain, ollama: OllamaBrain };

export function makeBrain(profile, key, tools, system) {
  const Brain = BRAINS[profile.type];
  if (!Brain) throw new BrainError(`Model "${profile.name}" has an unknown type "${profile.type}".`);
  if (!profile.model) throw new BrainError(`Model "${profile.name}" has no model name yet. Open Settings and fill it in.`);
  if (profile.type !== 'claude' && !profile.baseUrl) {
    throw new BrainError(`Model "${profile.name}" has no base URL yet. Open Settings and fill it in.`);
  }
  if (needsKey(profile) && !key) {
    throw new BrainError(`Add your API key for "${profile.name}" in Settings first. It stays in this browser.`);
  }
  return new Brain(profile, key, tools, system);
}

/** Used by the Settings "Test" button: a tiny question with no project and no tools. */
export async function testProfile(profile, key) {
  const brain = makeBrain(profile, key, null, 'You are a connection test. Answer in one short sentence.');
  return brain.ask('Reply with the single word OK.');
}
