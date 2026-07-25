import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function parseFrontmatter(text, file = '<text>') {
  const normalized = text.replace(/\r/g, '');
  if (!normalized.startsWith('---\n')) {
    throw new Error(`${file}: front matter must begin on the first line`);
  }

  const end = normalized.indexOf('\n---\n', 4);
  if (end === -1) {
    throw new Error(`${file}: front matter is missing its closing --- line`);
  }

  const fields = {};
  for (const rawLine of normalized.slice(4, end).split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = rawLine.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      throw new Error(`${file}: unsupported front-matter line: ${rawLine}`);
    }

    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }

  return {
    fields,
    body: normalized.slice(end + 5),
  };
}

export function readFrontmatter(path) {
  return parseFrontmatter(readFileSync(path, 'utf8'), path);
}

export function residentHandles(root) {
  const residentsDir = join(root, 'residents');
  if (!existsSync(residentsDir)) return [];

  return readdirSync(residentsDir)
    .filter((name) => name !== 'TEMPLATE')
    .filter((name) => {
      const path = join(residentsDir, name);
      return statSync(path).isDirectory();
    })
    .sort();
}

export const HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeGithubLogin(value) {
  return String(value || '').trim().replace(/^@/, '').toLowerCase();
}

export function markdownCell(value) {
  return String(value || '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}
