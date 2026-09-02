import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createContentPack, encryptContentPack } from '../src/content-pack.js';
import { validateTopicCollection } from '../src/content-validator.js';

const args = Object.fromEntries(process.argv.slice(2).map((item, index, all) => item.startsWith('--') ? [item.slice(2), all[index + 1]] : null).filter(Boolean));
const input = args.input;
const output = args.output;
const passphrase = process.env.MATURITA_DESK_PACK_PASSPHRASE || '';

if (!input || !output) fail('Použití: node tools/create-content-pack.mjs --input content.json --output content.mdesk');
if (passphrase.length < 10) fail('Nastavte MATURITA_DESK_PACK_PASSPHRASE (min. 10 znaků). Heslo se nepředává na příkazové řádce.');

const raw = JSON.parse(await fs.readFile(input, 'utf8'));
const topicsCheck = validateTopicCollection(raw.topics);
if (!topicsCheck.ok) fail(`Obsah neprošel validací: ${topicsCheck.errors[0] || 'neznámá chyba'}`);

const pack = createContentPack({
  packId: raw.packId,
  version: raw.version,
  label: raw.label,
  classification: raw.classification || 'CONFIDENTIAL-EXAM',
  metadata: raw.metadata || {},
  topics: raw.topics,
  createdAt: raw.createdAt || new Date().toISOString()
});
const envelope = await encryptContentPack(pack, passphrase);
await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
await fs.writeFile(output, JSON.stringify(envelope));
console.log(`Content Pack vytvořen: ${output}`);
console.log(`packId=${envelope.packId} version=${envelope.contentVersion} topics=${envelope.topicCount}`);
console.log('Heslo nebylo zapsáno do výstupu ani vypsáno do logu.');

function fail(message) {
  console.error(message);
  process.exit(1);
}
