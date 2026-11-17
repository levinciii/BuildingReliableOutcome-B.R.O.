// Access to your project's files from the browser.
//   FsaProject    - the browser's folder picker (Chrome / Edge): can read AND write, and asks before writing.
//   UploadProject - a folder uploaded through a file input (any browser): read-only; "writes" become downloads.
// Both are locked to the chosen folder and skip heavy folders such as node_modules.

export class ProjectError extends Error {}

export const IGNORE_DIRS = new Set([
  '.git', 'node_modules', '__pycache__', '.venv', 'venv', 'env', 'dist', 'build', '.idea', '.vscode',
  '.pytest_cache', '.mypy_cache', '.next', '.nuxt', '.turbo', '.cache', '.svn', '.hg', 'coverage', 'site-packages',
]);
export const TEXT_EXT = new Set([
  '.py', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.md', '.txt', '.toml', '.yaml', '.yml', '.html',
  '.css', '.scss', '.sql', '.sh', '.ini', '.cfg', '.csv', '.vue', '.svelte', '.php', '.java', '.kt', '.go', '.rs',
  '.rb', '.c', '.h', '.cpp', '.cs', '.dart', '.xml', '.env.example',
]);
export const NOTES_FILE = '.assistant_notes.md';
export const MAX_READ_CHARS = 20000;
const MAX_FILE_BYTES = 1_500_000;
const MAX_DEPTH = 12;
const MAX_SCAN = 8000;

/** Turn 'src\\app.js' or './src/app.js' into ['src', 'app.js']. Refuses anything that escapes the project. */
export function splitPath(path) {
  const segments = [];
  for (const part of String(path ?? '').replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') throw new ProjectError('That path is outside the project folder.');
    if (/^[a-zA-Z]:$/.test(part)) throw new ProjectError('Use a path relative to the project folder.');
    segments.push(part);
  }
  return segments;
}

const extensionOf = (path) => {
  const name = path.split('/').pop().toLowerCase();
  if (name.endsWith('.env.example')) return '.env.example';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : '';
};

class BaseProject {
  /** Short listing for the AI's instructions. */
  async tree(limit = 150) {
    const files = [];
    for await (const path of this.walk([])) {
      files.push(path);
      if (files.length > limit) break;
    }
    if (!files.length) return '(empty folder)';
    const text = files.slice(0, limit).join('\n');
    return files.length > limit ? `${text}\n... and more files (use list_files to see them)` : text;
  }

  async countFiles(cap = MAX_SCAN) {
    let n = 0;
    for await (const _ of this.walk([])) if (++n >= cap) break; // eslint-disable-line no-unused-vars
    return n;
  }

  async list(subdir = '.') {
    const start = splitPath(subdir);
    const files = [];
    for await (const path of this.walk(start)) {
      files.push(path);
      if (files.length > 300) break;
    }
    if (!files.length) return 'No files found.';
    const text = files.slice(0, 300).join('\n');
    return files.length > 300 ? `${text}\n... and more (ask for a sub-folder to see the rest)` : text;
  }

  async readRaw(path) {
    const segments = splitPath(path);
    if (!segments.length) throw new ProjectError('Give a file path.');
    return this.readText(segments);
  }

  async read(path) {
    const text = await this.readRaw(path);
    if (text.includes('\u0000')) return `Error: ${path} looks like a binary file.`;
    return text.length > MAX_READ_CHARS ? `${text.slice(0, MAX_READ_CHARS)}\n...[truncated]` : text;
  }

  async exists(path) {
    try {
      await this.readRaw(path);
      return true;
    } catch {
      return false;
    }
  }

  async search(query) {
    const q = String(query ?? '').toLowerCase();
    if (!q) return 'Give something to search for.';
    const hits = [];
    let scanned = 0;
    for await (const path of this.walk([])) {
      if (!TEXT_EXT.has(extensionOf(path))) continue;
      if (++scanned > 2500) break;
      let text;
      try {
        text = await this.readText(path.split('/'));
      } catch {
        continue;
      }
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(q)) {
          hits.push(`${path}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
          if (hits.length >= 60) return `${hits.join('\n')}\n...[more matches not shown]`;
        }
      }
    }
    return hits.join('\n') || 'No matches.';
  }

  async write(path, content) {
    const segments = splitPath(path);
    if (!segments.length) throw new ProjectError('Give a file path.');
    await this.writeText(segments, String(content));
  }

  async readNotes() {
    try {
      return await this.readText([NOTES_FILE]);
    } catch {
      return '';
    }
  }

  async appendNote(note) {
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const existing = await this.readNotes();
    const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
    await this.writeText([NOTES_FILE], `${existing}${prefix}- [${stamp}] ${note}\n`);
  }
}

export class FsaProject extends BaseProject {
  constructor(handle) {
    super();
    this.handle = handle;
    this.name = handle.name;
    this.writable = true;
  }

  async dirAt(segments, create = false) {
    let dir = this.handle;
    for (const segment of segments) dir = await dir.getDirectoryHandle(segment, { create });
    return dir;
  }

  async *walk(startSegments = []) {
    let start;
    try {
      start = await this.dirAt(startSegments);
    } catch {
      return;
    }
    const budget = { left: MAX_SCAN };
    yield* this._walk(start, startSegments.length ? `${startSegments.join('/')}/` : '', 0, budget);
  }

  async *_walk(dir, prefix, depth, budget) {
    if (depth > MAX_DEPTH || budget.left <= 0) return;
    const entries = [];
    try {
      for await (const [name, handle] of dir.entries()) entries.push([name, handle]);
    } catch {
      return; // unreadable folder: skip it quietly
    }
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    for (const [name, handle] of entries) {
      if (budget.left <= 0) return;
      if (handle.kind === 'directory') {
        if (IGNORE_DIRS.has(name)) continue;
        yield* this._walk(handle, `${prefix}${name}/`, depth + 1, budget);
      } else {
        budget.left--;
        yield `${prefix}${name}`;
      }
    }
  }

  async readText(segments) {
    const name = segments[segments.length - 1];
    try {
      const dir = await this.dirAt(segments.slice(0, -1));
      const file = await (await dir.getFileHandle(name)).getFile();
      if (file.size > MAX_FILE_BYTES) throw new ProjectError(`${segments.join('/')} is too large to read.`);
      return await file.text();
    } catch (e) {
      if (e instanceof ProjectError) throw e;
      if (e?.name === 'NotFoundError') throw new ProjectError(`File not found: ${segments.join('/')}`);
      if (e?.name === 'TypeMismatchError') throw new ProjectError(`${segments.join('/')} is not a file.`);
      throw new ProjectError(`Could not read ${segments.join('/')}: ${e?.message || e}`);
    }
  }

  async writeText(segments, content) {
    try {
      const dir = await this.dirAt(segments.slice(0, -1), true);
      const fileHandle = await dir.getFileHandle(segments[segments.length - 1], { create: true });
      const writer = await fileHandle.createWritable();
      await writer.write(content);
      await writer.close();
    } catch (e) {
      throw new ProjectError(`Could not write ${segments.join('/')}: ${e?.message || e}`);
    }
  }
}

export class UploadProject extends BaseProject {
  constructor(fileList) {
    super();
    this.files = new Map();
    this.overlay = new Map(); // changes made by the assistant (offered as downloads)
    this.writable = false;
    let root = '';
    for (const file of fileList) {
      const parts = (file.webkitRelativePath || file.name).split('/');
      if (!root) root = parts[0];
      const inner = parts.slice(1);
      if (!inner.length) continue;
      if (inner.slice(0, -1).some((s) => IGNORE_DIRS.has(s))) continue;
      if (inner.length > MAX_DEPTH + 1) continue;
      this.files.set(inner.join('/'), file);
    }
    this.name = root || 'uploaded folder';
  }

  async *walk(startSegments = []) {
    const prefix = startSegments.length ? `${startSegments.join('/')}/` : '';
    const paths = [...new Set([...this.files.keys(), ...this.overlay.keys()])].sort();
    let n = 0;
    for (const path of paths) {
      if (!path.startsWith(prefix)) continue;
      if (++n > MAX_SCAN) return;
      yield path;
    }
  }

  async readText(segments) {
    const path = segments.join('/');
    if (this.overlay.has(path)) return this.overlay.get(path);
    const file = this.files.get(path);
    if (!file) throw new ProjectError(`File not found: ${path}`);
    if (file.size > MAX_FILE_BYTES) throw new ProjectError(`${path} is too large to read.`);
    return file.text();
  }

  async writeText(segments, content) {
    this.overlay.set(segments.join('/'), content);
  }

  changedFiles() {
    return [...this.overlay.entries()].map(([path, content]) => ({ path, content }));
  }
}

/** Pull "owner/repo" out of "https://github.com/owner/repo", "github.com/owner/repo/tree/main" or "owner/repo". */
export function parseGithubRepo(input) {
  const text = String(input ?? '').trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  const match = text.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)/i) || text.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!match) throw new ProjectError('Use a GitHub address like https://github.com/owner/repo');
  return { owner: match[1], repo: match[2].replace(/\.git$/i, '') };
}

/**
 * A public GitHub repository, read-only. Made for phones, which cannot pick a folder: files are fetched on demand
 * from GitHub and nothing is sent anywhere else. No GitHub token is ever used, so private repos are not reachable.
 */
export class GithubProject extends UploadProject {
  static async load(input, fetchImpl = fetch) {
    const { owner, repo } = parseGithubRepo(input);
    const api = `https://api.github.com/repos/${owner}/${repo}`;
    const info = await fetchImpl(api, { headers: { Accept: 'application/vnd.github+json' } });
    if (info.status === 404) throw new ProjectError('That repository was not found, or it is private. Only public repositories can be imported.');
    if (info.status === 403) throw new ProjectError('GitHub is limiting requests from this network. Try again in a little while.');
    if (!info.ok) throw new ProjectError(`GitHub answered with an error (${info.status}).`);
    const { default_branch: branch = 'main' } = await info.json();
    const treeResponse = await fetchImpl(`${api}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
    if (!treeResponse.ok) throw new ProjectError(`Could not read the file list (${treeResponse.status}).`);
    const tree = await treeResponse.json();
    const project = new GithubProject();
    project.name = `${owner}/${repo}`;
    project.truncated = Boolean(tree.truncated);
    for (const entry of tree.tree || []) {
      if (entry.type !== 'blob') continue;
      const parts = entry.path.split('/');
      if (parts.slice(0, -1).some((s) => IGNORE_DIRS.has(s)) || parts.length > MAX_DEPTH + 1) continue;
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${parts.map(encodeURIComponent).join('/')}`;
      project.files.set(entry.path, {
        size: entry.size ?? 0,
        text: async () => {
          const response = await fetchImpl(url);
          if (!response.ok) throw new ProjectError(`Could not download ${entry.path} (${response.status}).`);
          return response.text();
        },
      });
    }
    if (!project.files.size) throw new ProjectError('That repository has no readable files.');
    return project;
  }

  constructor() {
    super([]);
  }
}
