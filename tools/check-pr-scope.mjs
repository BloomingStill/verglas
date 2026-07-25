import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeGithubLogin, readFrontmatter } from './lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const actor = normalizeGithubLogin(process.env.GITHUB_ACTOR);
const baseSha = process.env.BASE_SHA;
const headSha = process.env.HEAD_SHA || 'HEAD';

if (!actor || !baseSha) {
  console.error('ERROR: GITHUB_ACTOR and BASE_SHA are required');
  process.exit(2);
}

const output = execFileSync(
  'git',
  ['diff', '--name-status', '--find-renames', `${baseSha}...${headSha}`],
  { cwd: ROOT, encoding: 'utf8' }
).trim();

const changes = output ? output.split('\n').map((line) => line.split('\t')) : [];
const errors = [];
const handles = new Set();
const allowedFile = /^(ADDRESS\.md|HOME\.md|assets\/.+\.(?:txt|png|jpg|jpeg|webp|gif))$/i;

for (const parts of changes) {
  const status = parts[0];
  const path = parts.at(-1);

  if (status.startsWith('D') || status.startsWith('R')) {
    errors.push(`${path}: deletions and renames require a separate maintainer-reviewed process`);
    continue;
  }

  const match = path.match(/^residents\/([^/]+)\/(.+)$/);
  if (!match) {
    errors.push(`${path}: joining PRs may only change one resident folder`);
    continue;
  }

  const [, handle, relativePath] = match;
  if (handle === 'TEMPLATE') {
    errors.push(`${path}: the shared template cannot be changed in a joining PR`);
    continue;
  }

  handles.add(handle);
  if (!allowedFile.test(relativePath) && relativePath !== 'assets/.gitkeep') {
    errors.push(`${path}: only ADDRESS.md, HOME.md, and ordinary assets are allowed`);
  }
}

if (handles.size !== 1) {
  errors.push(`a joining PR must change exactly one resident folder; found ${handles.size}`);
}

if (handles.size === 1) {
  const [handle] = handles;
  const addressPath = join(ROOT, 'residents', handle, 'ADDRESS.md');
  const homePath = join(ROOT, 'residents', handle, 'HOME.md');

  if (!existsSync(addressPath) || !existsSync(homePath)) {
    errors.push(`residents/${handle}: ADDRESS.md and HOME.md must both exist`);
  } else {
    const address = readFrontmatter(addressPath).fields;
    const claimed = normalizeGithubLogin(address.github);
    if (claimed !== actor) {
      errors.push(`residents/${handle}/ADDRESS.md: github "${claimed}" does not match PR author "${actor}"`);
    }

    try {
      const oldAddress = execFileSync(
        'git',
        ['show', `${baseSha}:residents/${handle}/ADDRESS.md`],
        { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      );
      const temporary = join(ROOT, '.base-address.tmp.md');
      const { writeFileSync, unlinkSync } = await import('node:fs');
      writeFileSync(temporary, oldAddress);
      const oldOwner = normalizeGithubLogin(readFrontmatter(temporary).fields.github);
      unlinkSync(temporary);
      if (oldOwner && oldOwner !== actor) {
        errors.push(`residents/${handle}: existing address belongs to GitHub account "${oldOwner}"`);
      }
    } catch {
      // No address at the base commit means this is a new resident.
    }
  }
}

for (const error of errors) console.error(`ERROR ${error}`);
if (errors.length) {
  console.error(`\nPull-request scope check failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log(`Pull-request scope check passed for @${actor}.`);
