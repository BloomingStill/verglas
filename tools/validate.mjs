import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DATE_PATTERN,
  HANDLE_PATTERN,
  normalizeGithubLogin,
  readFrontmatter,
  residentHandles,
} from './lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];
const fail = (file, message) => errors.push(`${file}: ${message}`);
const warn = (file, message) => warnings.push(`${file}: ${message}`);

const allowedExtensions = new Set(['.md', '.txt', '.png', '.jpg', '.jpeg', '.webp', '.gif']);
const requiredAddress = ['handle', 'name', 'household', 'github', 'joined'];
const requiredHome = ['resident', 'title', 'location'];

function validateDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function walk(directory) {
  const paths = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...walk(path));
    else paths.push(path);
  }
  return paths;
}

for (const handle of residentHandles(ROOT)) {
  const folder = join(ROOT, 'residents', handle);
  const addressPath = join(folder, 'ADDRESS.md');
  const homePath = join(folder, 'HOME.md');
  const addressRel = relative(ROOT, addressPath);
  const homeRel = relative(ROOT, homePath);

  if (!HANDLE_PATTERN.test(handle)) fail(`residents/${handle}`, 'folder name is not a valid handle');
  if (!existsSync(addressPath)) fail(addressRel, 'missing ADDRESS.md');
  if (!existsSync(homePath)) fail(homeRel, 'missing HOME.md');
  if (!existsSync(addressPath) || !existsSync(homePath)) continue;

  let address;
  let home;
  try { address = readFrontmatter(addressPath).fields; }
  catch (error) { fail(addressRel, error.message); continue; }
  try { home = readFrontmatter(homePath).fields; }
  catch (error) { fail(homeRel, error.message); continue; }

  for (const field of requiredAddress) {
    if (!address[field]) fail(addressRel, `required field "${field}" is empty`);
  }
  for (const field of requiredHome) {
    if (!home[field]) fail(homeRel, `required field "${field}" is empty`);
  }

  if (address.handle && address.handle !== handle) {
    fail(addressRel, `handle "${address.handle}" does not match folder "${handle}"`);
  }
  if (home.resident && home.resident !== handle) {
    fail(homeRel, `resident "${home.resident}" does not match folder "${handle}"`);
  }
  if (address.handle && !HANDLE_PATTERN.test(address.handle)) {
    fail(addressRel, 'handle must be lowercase words separated by single hyphens');
  }
  if (address.github && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(normalizeGithubLogin(address.github))) {
    fail(addressRel, 'github is not shaped like a GitHub login');
  }
  if (address.joined && !validateDate(address.joined)) {
    fail(addressRel, 'joined must be a real date in YYYY-MM-DD form');
  }
  if (address.note && address.note.length > 180) {
    warn(addressRel, 'note is longer than 180 characters');
  }

  if (home.image) {
    if (home.image.startsWith('/') || home.image.includes('..')) {
      fail(homeRel, 'image must be a safe relative path inside the resident folder');
    } else if (!existsSync(join(folder, home.image))) {
      fail(homeRel, `image points to missing file "${home.image}"`);
    }
  }

  for (const path of walk(folder)) {
    const rel = relative(ROOT, path).replaceAll('\\', '/');
    if (path.endsWith('.gitkeep')) continue;
    const extension = extname(path).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      fail(rel, `file type "${extension || '(none)'}" is not allowed`);
    }
    if (statSync(path).size > 1_500_000) {
      fail(rel, 'file is larger than 1.5 MB');
    }
  }
}

for (const warning of warnings.sort()) console.warn(`WARN  ${warning}`);
for (const error of errors.sort()) console.error(`ERROR ${error}`);

if (errors.length) {
  console.error(`\nValidation failed with ${errors.length} error(s) and ${warnings.length} warning(s).`);
  process.exit(1);
}

console.log(`Validation passed for ${residentHandles(ROOT).length} resident(s) with ${warnings.length} warning(s).`);
