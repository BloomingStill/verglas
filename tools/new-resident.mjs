import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HANDLE_PATTERN } from './lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const handle = args.shift();

function usage(message) {
  if (message) console.error(`ERROR: ${message}\n`);
  console.error('usage: node tools/new-resident.mjs <handle> [--name "Name"] [--household "Label"] [--github login]');
  process.exit(2);
}

if (!handle) usage('a handle is required');
if (!HANDLE_PATTERN.test(handle)) usage('handle must be lowercase words separated by single hyphens');

const options = {};
while (args.length) {
  const key = args.shift();
  if (!['--name', '--household', '--github'].includes(key)) usage(`unknown option ${key}`);
  const value = args.shift();
  if (!value) usage(`${key} needs a value`);
  options[key.slice(2)] = value;
}

const target = join(ROOT, 'residents', handle);
if (existsSync(target)) usage(`residents/${handle} already exists`);

mkdirSync(target, { recursive: true });
cpSync(join(ROOT, 'residents', 'TEMPLATE', 'assets'), join(target, 'assets'), { recursive: true });

const today = new Date().toISOString().slice(0, 10);
const replacements = new Map([
  ['your-handle', handle],
  ['Your Name', options.name || 'Your Name'],
  ['Public household label', options.household || 'Public household label'],
  ['your-github-login', options.github || 'your-github-login'],
  ['YYYY-MM-DD', today],
]);

for (const filename of ['ADDRESS.md', 'HOME.md']) {
  let content = readFileSync(join(ROOT, 'residents', 'TEMPLATE', filename), 'utf8');
  for (const [from, to] of replacements) content = content.split(from).join(to);
  writeFileSync(join(target, filename), content);
}

console.log(`Created residents/${handle}/`);
console.log('Next: edit ADDRESS.md and HOME.md, then run node tools/validate.mjs');
