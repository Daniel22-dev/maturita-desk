import fs from 'node:fs/promises';
import { TOPICS } from '../src/demo-content.js';
import { createContentPack, encryptContentPack } from '../src/content-pack.js';

const DEMO_PASSPHRASE = 'DEMO-ONLY-2027';
const pack = createContentPack({
  packId: 'synthetic-demo-2027',
  version: '1.0.0',
  label: 'Synthetic Demo 2027',
  classification: 'SYNTHETIC-DEMO',
  topics: TOPICS,
  createdAt: '2026-09-01T00:00:00.000Z'
});
const envelope = await encryptContentPack(pack, DEMO_PASSPHRASE, { iterations: 210000 });
await fs.writeFile(new URL('../samples/synthetic-demo-2027.mdesk', import.meta.url), JSON.stringify(envelope));
console.log('Synthetic demo pack generated. Passphrase: DEMO-ONLY-2027');
