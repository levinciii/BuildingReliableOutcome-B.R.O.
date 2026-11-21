// The "hands": what the AI is allowed to do with your project. Same tools as the desktop app,
// except running commands, which a website can never do on your computer.
import { uid } from './util.js';
import { splitPath } from './project.js';

export const TOOL_SCHEMAS = [
  {
    name: 'list_files',
    description: 'List files in the project (or a sub-folder). Use this first to understand the project layout.',
    input_schema: {
      type: 'object',
      properties: { subdir: { type: 'string', description: "Folder relative to the project root. Default '.'" } },
    },
  },
  {
    name: 'read_file',
    description: 'Read a text file from the project.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'File path relative to the project root' } },
      required: ['path'],
    },
  },
  {
    name: 'search_code',
    description: 'Search all project text files for a string (case-insensitive). Returns file:line: text.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'write_file',
    description:
      'Create or overwrite a file in the project. The user must approve it first. Always send the complete file content.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string', description: 'Complete new file content' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'recent_changes',
    description:
      "What changed recently in the project: the latest commits (from git or GitHub) and the project's change notes (CHANGELOG.md or similar), whichever exist. Use it for questions like 'what changed', 'latest commits' or 'what was done last'.",
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'integer', description: 'How many commits to show (default 15, max 50)' } },
    },
  },
  {
    name: 'save_note',
    description: 'Save a short note about the project (decisions, TODOs, ideas) so it is remembered in future sessions.',
    input_schema: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'] },
  },
];

export function describeCall(name, args) {
  const a = args && typeof args === 'object' ? args : {};
  switch (name) {
    case 'list_files': return a.subdir && a.subdir !== '.' ? `Listing files in ${a.subdir}` : 'Listing project files';
    case 'read_file': return `Reading ${a.path ?? 'a file'}`;
    case 'search_code': return `Searching for “${a.query ?? ''}”`;
    case 'write_file': return `Writing ${a.path ?? 'a file'}`;
    case 'recent_changes': return 'Checking recent changes';
    case 'save_note': return 'Saving a note';
    default: return name;
  }
}

export class ToolRunner {
  /**
   * @param project  FsaProject or UploadProject
   * @param confirm  async ({path, content, previous}) => boolean   (asks the user)
   * @param onEvent  ({phase:'start'|'end', id, name, label, ok}) => void   (updates the screen)
   */
  constructor(project, { confirm, onEvent } = {}) {
    this.project = project;
    this.confirm = confirm;
    this.onEvent = onEvent;
  }

  async call(name, rawArgs) {
    const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
    const id = uid();
    const label = describeCall(name, args);
    this.onEvent?.({ phase: 'start', id, name, label });
    let result;
    let ok = true;
    try {
      result = await this.run(name, args);
      if (typeof result !== 'string') result = JSON.stringify(result);
      if (result.startsWith('The user declined')) ok = false;
    } catch (e) {
      ok = false;
      result = `Error: ${e?.message || e}`;
    }
    this.onEvent?.({ phase: 'end', id, name, label, ok });
    return result;
  }

  async run(name, args) {
    const p = this.project;
    switch (name) {
      case 'list_files': return p.list(args.subdir || '.');
      case 'read_file': return p.read(args.path);
      case 'search_code': return p.search(args.query);
      case 'recent_changes': return p.recentChanges(args.limit);
      case 'save_note': {
        await p.appendNote(String(args.note ?? ''));
        return 'Note saved.';
      }
      case 'write_file': {
        if (typeof args.path !== 'string' || typeof args.content !== 'string') {
          return 'Error: write_file needs a path and the complete file content, both as text.';
        }
        if (!splitPath(args.path).length) return 'Error: give a file path, not a folder.';
        let previous = null;
        try {
          previous = await p.readRaw(args.path);
        } catch {
          previous = null; // new file
        }
        const approved = this.confirm ? await this.confirm({ path: args.path, content: args.content, previous }) : false;
        if (!approved) return 'The user declined this change.';
        await p.write(args.path, args.content);
        return p.writable
          ? `Wrote ${args.path}.`
          : `Prepared ${args.path}. The folder was uploaded read-only, so the user can download the new file instead.`;
      }
      default:
        return `Unknown tool: ${name}`;
    }
  }
}
