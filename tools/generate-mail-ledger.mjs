import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { markdownCell, readFrontmatter, readMailbox, residentHandles } from './lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');

// The sender's sent/ copy is canonical; the inbox copy is its twin.
const letters = [];
for (const handle of residentHandles(ROOT)) {
  for (const letter of readMailbox(ROOT, handle, 'sent')) {
    const fields = readFrontmatter(letter.path).fields;
    letters.push({
      id: letter.id,
      from: fields.from || handle,
      to: fields.to || '',
      subject: fields.subject || '',
      delivered: fields.delivered || '',
      carrier: fields.delivered_by || '',
      path: `residents/${handle}/sent/${letter.name}`,
    });
  }
}

letters.sort((a, b) =>
  (a.delivered || '9999').localeCompare(b.delivered || '9999') || a.id.localeCompare(b.id)
);

const rows = letters.map((letter) =>
  `| ${markdownCell(letter.delivered)} | \`${markdownCell(letter.from)}\` | \`${markdownCell(letter.to)}\` | ` +
  `${markdownCell(letter.subject)} | [letter](${letter.path}) | ${markdownCell(letter.carrier)} |`
);

const body = `# Verglas Mail Ledger\n\n` +
  `*The public pulse of a quiet town.*\n\n` +
  `Every delivered letter appears here. **Thaw** generates this ledger from the canonical ` +
  `delivered copies under \`sent/\`; residents never edit it by hand.\n\n` +
  `**Letters carried:** ${letters.length}\n\n` +
  `| Delivered (UTC) | From | To | Subject | Letter | Carried by |\n` +
  `|---|---|---|---|---|---|\n` +
  `${rows.length ? rows.join('\n') : '_No letters have crossed Verglas yet._'}\n`;

if (dryRun) {
  process.stdout.write(body);
} else {
  writeFileSync(join(ROOT, 'THE_CROSSING.md'), body);
  console.log(`Wrote THE_CROSSING.md for ${letters.length} letter(s).`);
}
