import assert from 'node:assert/strict';
import { TOPICS } from '../src/demo-content.js';
import {
  createContentPack, encryptContentPack, decryptContentPack,
  validateEnvelopeShape, safeEnvelopeMeta, parseEnvelopeText,
  ENVELOPE_SCHEMA, CONTENT_SCHEMA, MAX_PBKDF2_ITERATIONS
} from '../src/content-pack.js';

const passphrase = 'SYNTHETIC-TEST-PASSPHRASE';
const pack = createContentPack({
  packId: 'test-pack',
  version: '1.2.3',
  label: 'Synthetic Test Pack',
  classification: 'SYNTHETIC-DEMO',
  metadata: { guidanceReviewStatus: 'synthetic review', sourceDocumentCount: 80 },
  topics: TOPICS,
  createdAt: '2026-09-01T00:00:00.000Z'
});
assert.equal(pack.schema, CONTENT_SCHEMA);
assert.equal(pack.topics.length, 20);

const envelope = await encryptContentPack(pack, passphrase, { iterations: 200000 });
assert.equal(envelope.schema, ENVELOPE_SCHEMA);
assert.equal(validateEnvelopeShape(envelope).ok, true);
assert.equal(safeEnvelopeMeta(envelope).topicCount, 20);

const excessiveKdf = structuredClone(envelope);
excessiveKdf.kdf.iterations = MAX_PBKDF2_ITERATIONS + 1;
assert.equal(validateEnvelopeShape(excessiveKdf).ok, false, 'malicious KDF work factor must be rejected before key derivation');
await assert.rejects(() => decryptContentPack(excessiveKdf, passphrase), /iterations/i);
await assert.rejects(() => encryptContentPack(pack, passphrase, { iterations: MAX_PBKDF2_ITERATIONS + 1 }), /iterations/i);

const parsed = await parseEnvelopeText(JSON.stringify(envelope));
const clear = await decryptContentPack(parsed, passphrase);
assert.equal(clear.manifest.packId, 'test-pack');
assert.equal(clear.metadata.sourceDocumentCount, 80);
assert.equal(clear.metadata.guidanceReviewStatus, 'synthetic review');
assert.equal(clear.topics[13].title, TOPICS[13].title);

await assert.rejects(() => decryptContentPack(envelope, 'WRONG-PASSPHRASE-123'), /nelze odemknout/i);

const tamperedMeta = structuredClone(envelope);
tamperedMeta.label = 'Tampered';
await assert.rejects(() => decryptContentPack(tamperedMeta, passphrase), /nelze odemknout/i);

const tamperedPayload = structuredClone(envelope);
const chars = tamperedPayload.payload.split('');
chars[Math.floor(chars.length / 2)] = chars[Math.floor(chars.length / 2)] === 'A' ? 'B' : 'A';
tamperedPayload.payload = chars.join('');
await assert.rejects(() => decryptContentPack(tamperedPayload, passphrase), /integrity/i);

await assert.rejects(() => encryptContentPack(pack, 'short'), /alespoň 10/i);

{
  const confidentialTopics = structuredClone(TOPICS);
  assert.throws(() => createContentPack({ packId: 'confidential-test', version: '1.0.0', label: 'Confidential', classification: 'CONFIDENTIAL-EXAM', topics: confidentialTopics }), /vložená rastrová média/i, 'confidential packs must not reference public shell assets');
}

{
  const confidentialTopics = structuredClone(TOPICS);
  const raster = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==';
  for (const topic of confidentialTopics) topic.exam.pictures.images.forEach(image => { image.src = raster; });
  confidentialTopics[0].exam.pictures.images[0].src = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
  assert.throws(() => createContentPack({ packId: 'unsafe-media', version: '1.0.0', label: 'Unsafe media', classification: 'CONFIDENTIAL-EXAM', topics: confidentialTopics }), /nepovolený asset/i);
}


console.log('Content Pack crypto tests: PASS');
