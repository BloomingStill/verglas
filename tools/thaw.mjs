import { appendFileSync } from 'node:fs';
import { normalizeGithubLogin, reviewScope } from './lib.mjs';
import { reviewPublicContent, submittedFile } from './review.mjs';

// Thaw: steward at the gate, carrier on the road.
//
// Runs from the trusted default branch under pull_request_target. It never
// checks out or executes the contributor's branch — every file it reads comes
// through GitHub's API and is treated as inert public data. The deterministic
// gate in lib.mjs runs first and Claude cannot overrule it.

const {
  GITHUB_TOKEN,
  GITHUB_REPOSITORY,
  PR_NUMBER,
  ANTHROPIC_API_KEY,
  THAW_MODEL = 'claude-sonnet-5',
  GITHUB_OUTPUT,
  // Both hosts are overridable so the gate can be exercised against a stub.
  GITHUB_API_URL = 'https://api.github.com',
  ANTHROPIC_BASE_URL = 'https://api.anthropic.com',
} = process.env;

const MARKER = '<!-- thaw:review -->';
const IMAGE_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif',
};
const MAX_IMAGES = 4;
const MAX_REVIEW_BYTES = 400_000;

for (const [name, value] of Object.entries({ GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER })) {
  if (!value) {
    console.error(`ERROR: ${name} is required`);
    process.exit(2);
  }
}

// ── GitHub ────────────────────────────────────────────────────────────────

async function github(path, options = {}) {
  const response = await fetch(`${GITHUB_API_URL}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${GITHUB_TOKEN}`,
      accept: options.raw ? 'application/vnd.github.raw' : 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'thaw-of-verglas',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  return response;
}

async function json(path, options) {
  const response = await github(path, options);
  if (!response.ok) throw new Error(`GitHub ${options?.method || 'GET'} ${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

/** Read a file at a revision as inert data. Returns null when absent. */
async function readAt(path, ref, binary = false) {
  const response = await github(
    `/repos/${GITHUB_REPOSITORY}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${ref}`,
    { raw: true }
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`reading ${path}@${ref}: ${response.status}`);
  return binary ? Buffer.from(await response.arrayBuffer()) : response.text();
}

async function changedFiles(number) {
  const files = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = await json(`/repos/${GITHUB_REPOSITORY}/pulls/${number}/files?per_page=100&page=${page}`);
    files.push(...batch.map((file) => ({ path: file.filename, status: file.status[0].toUpperCase() })));
    if (batch.length < 100) break;
  }
  return files;
}

/** One comment per pull request, rewritten in place on each run. */
async function speak(number, body) {
  const signed = `${MARKER}\n${body}\n\n*— Thaw of Verglas*`;
  const existing = await json(`/repos/${GITHUB_REPOSITORY}/issues/${number}/comments?per_page=100`);
  const mine = existing.find((comment) => comment.body?.startsWith(MARKER));
  if (mine) {
    await json(`/repos/${GITHUB_REPOSITORY}/issues/comments/${mine.id}`, {
      method: 'PATCH', body: JSON.stringify({ body: signed }),
    });
  } else {
    await json(`/repos/${GITHUB_REPOSITORY}/issues/${number}/comments`, {
      method: 'POST', body: JSON.stringify({ body: signed }),
    });
  }
}

function finish(merged, note) {
  if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `merged=${merged}\n`);
  console.log(note);
  process.exit(0);
}

// ── Claude ────────────────────────────────────────────────────────────────

/** Assemble the proposed material as data: text inline, up to four images attached. */
async function gather(files, ref) {
  const blocks = [];
  const images = [];
  let budget = MAX_REVIEW_BYTES;

  for (const file of files) {
    const extension = file.path.slice(file.path.lastIndexOf('.')).toLowerCase();

    if (IMAGE_TYPES[extension]) {
      if (images.length >= MAX_IMAGES) continue;
      const bytes = await readAt(file.path, ref, true);
      if (!bytes) continue;
      images.push({
        type: 'image',
        source: { type: 'base64', media_type: IMAGE_TYPES[extension], data: bytes.toString('base64') },
      });
      continue;
    }

    const text = await readAt(file.path, ref);
    if (text === null) continue;
    const clipped = text.slice(0, budget);
    budget -= clipped.length;
    blocks.push(submittedFile(file.path, clipped));
    if (budget <= 0) break;
  }

  return [
    { type: 'text', text: `Review the following submitted public material.\n\n${blocks.join('\n\n')}` },
    ...images,
  ];
}

// ── The gate ──────────────────────────────────────────────────────────────

const pull = await json(`/repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}`);

if (pull.state !== 'open') finish(false, 'The pull request is not open.');
if (pull.draft) finish(false, 'The pull request is still a draft.');

const actor = normalizeGithubLogin(pull.user?.login);
const base = pull.base.sha;
const head = pull.head.sha;
const files = await changedFiles(PR_NUMBER);

const { kind, handle, letter, errors } = await reviewScope({
  files,
  actor,
  readHead: (path) => readAt(path, head),
  readBase: (path) => readAt(path, base),
});

if (errors.length) {
  await speak(PR_NUMBER, [
    'I cannot let this through yet.',
    '',
    ...errors.map((error) => `- ${error}`),
    '',
    'Fix these and push again; I will look once more.',
  ].join('\n'));
  finish(false, `Deterministic gate refused ${errors.length} thing(s).`);
}

const arriving = kind === 'letter'
  ? `a letter from **${handle}** to **${letter.to}** — *${letter.subject}*`
  : `an address change for **${handle}**`;

if (!ANTHROPIC_API_KEY) {
  await speak(PR_NUMBER, [
    `The town's records are in order for ${arriving}.`,
    '',
    'I have no key to read it with, so a human maintainer needs to look before it merges.',
  ].join('\n'));
  finish(false, 'No ANTHROPIC_API_KEY; routed to a human.');
}

let review;
try {
  review = await reviewPublicContent({
    content: await gather(files, head),
    apiKey: ANTHROPIC_API_KEY,
    model: THAW_MODEL,
    baseUrl: ANTHROPIC_BASE_URL,
  });
} catch (error) {
  await speak(PR_NUMBER, [
    `The town's records are in order for ${arriving}, but my reading of it did not complete.`,
    '',
    `> ${error.message}`,
    '',
    'A human maintainer should look before this merges.',
  ].join('\n'));
  finish(false, `Review failed: ${error.message}`);
}

const concerns = review.concerns?.length
  ? ['', ...review.concerns.map((concern) => `- ${concern}`)].join('\n')
  : '';

if (review.verdict !== 'approve') {
  const opening = review.verdict === 'revise'
    ? 'I read this as public material and something needs changing before it can stand in the open.'
    : 'This one is not mine to decide. A human maintainer should look.';
  await speak(PR_NUMBER, `${opening}\n\n${review.reason}${concerns}`);
  finish(false, `Claude returned "${review.verdict}".`);
}

const merge = await github(`/repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}/merge`, {
  method: 'PUT',
  body: JSON.stringify({
    merge_method: 'squash',
    commit_title: kind === 'letter'
      ? `letter: ${handle} writes to ${letter.to} (#${PR_NUMBER})`
      : `address: ${handle} (#${PR_NUMBER})`,
  }),
});

if (!merge.ok) {
  await speak(PR_NUMBER, [
    `Everything checks out for ${arriving}, but the gate would not open.`,
    '',
    `> ${merge.status} ${(await merge.text()).slice(0, 300)}`,
    '',
    'A human maintainer can merge this by hand.',
  ].join('\n'));
  finish(false, `Merge refused: ${merge.status}`);
}

await speak(PR_NUMBER, kind === 'letter'
  ? `Checked and carried: ${arriving}.\n\nIt is in **${letter.to}**'s inbox now, and the crossing is on the record.`
  : `Checked and merged: ${arriving}.\n\nWelcome to Verglas. The directory will know you shortly.`);

finish(true, `Merged ${kind} for ${handle}.`);
