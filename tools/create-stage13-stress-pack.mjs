import fs from 'node:fs/promises';
import path from 'node:path';
import { TOPICS } from '../src/demo-content.js';
import { createContentPack, encryptContentPack, estimateEnvelopeBytes, MAX_ENVELOPE_BYTES } from '../src/content-pack.js';

const PASSPHRASE = 'STAGE13-SYNTHETIC-STRESS-2027';
const targetBytes = 30 * 1024 * 1024;
const output = process.argv[2] || path.resolve(process.cwd(), 'Maturita-Desk-Stage13-synthetic-stress-30MiB.mdesk');

// AES-GCM ciphertext is incompressible and base64 expands by ~4/3. A 22 MiB
// synthetic metadata filler produces an envelope close to 30 MiB while remaining
// safely below the Stage 12R 32 MiB hard ceiling.
const fillerBytes = 22 * 1024 * 1024;
const filler = 'S'.repeat(fillerBytes);
const pack = createContentPack({
  packId: 'stage13-synthetic-stress-2027',
  version: '1.0.0',
  label: 'Stage 13 Synthetic Stress Pack',
  classification: 'SYNTHETIC-DEMO',
  metadata: {
    purpose: 'Stage 13 device performance and lifecycle pilot only',
    syntheticStressPayload: filler,
    expectedUse: 'No student data. No real exam content.'
  },
  topics: TOPICS,
  createdAt: '2026-09-01T18:00:00.000Z'
});
const envelope = await encryptContentPack(pack, PASSPHRASE, { iterations: 210000 });
const bytes = estimateEnvelopeBytes(envelope);
if (bytes >= MAX_ENVELOPE_BYTES) throw new Error(`Stress pack too large: ${bytes}`);
if (bytes < 28 * 1024 * 1024) throw new Error(`Stress pack too small for Stage 13 target: ${bytes}`);
await fs.writeFile(output, JSON.stringify(envelope));
console.log(JSON.stringify({ output, bytes, mib: (bytes / 1024 / 1024).toFixed(2), targetMiB: 30, maxMiB: MAX_ENVELOPE_BYTES / 1024 / 1024, passphrase: PASSPHRASE }, null, 2));
