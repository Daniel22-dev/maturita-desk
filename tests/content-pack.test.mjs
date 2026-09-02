import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { TOPICS } from '../src/demo-content.js';
import {
  createContentPack, encryptContentPack, decryptContentPack,
  validateEnvelopeShape, safeEnvelopeMeta, parseEnvelopeText,
  signContentPackEnvelope, verifyEnvelopePublisherSignature,
  ENVELOPE_SCHEMA, CONTENT_SCHEMA, MAX_PBKDF2_ITERATIONS
} from '../src/content-pack.js';

const passphrase = 'SYNTHETIC-TEST-PASSPHRASE';
const pack = createContentPack({
  packId: 'test-pack', version: '1.2.3', label: 'Synthetic Test Pack', classification: 'SYNTHETIC-DEMO',
  metadata: { guidanceReviewStatus: 'synthetic review', sourceDocumentCount: 80 }, topics: TOPICS,
  createdAt: '2026-09-01T00:00:00.000Z'
});
assert.equal(pack.schema, CONTENT_SCHEMA);
assert.equal(pack.topics.length, 20);

const envelope = await encryptContentPack(pack, passphrase, { iterations: 200000 });
assert.equal(envelope.schema, ENVELOPE_SCHEMA);
assert.equal(validateEnvelopeShape(envelope).ok, true);
assert.equal(safeEnvelopeMeta(envelope).topicCount, 20);
assert.equal((await verifyEnvelopePublisherSignature(envelope, {}, ['CONFIDENTIAL-EXAM'])).signed, false, 'unsigned synthetic demo remains allowed');

const excessiveKdf = structuredClone(envelope);
excessiveKdf.kdf.iterations = MAX_PBKDF2_ITERATIONS + 1;
assert.equal(validateEnvelopeShape(excessiveKdf).ok, false, 'malicious KDF work factor must be rejected before key derivation');
await assert.rejects(() => decryptContentPack(excessiveKdf, passphrase), /iterations/i);
await assert.rejects(() => encryptContentPack(pack, passphrase, { iterations: MAX_PBKDF2_ITERATIONS + 1 }), /iterations/i);

const parsed = await parseEnvelopeText(JSON.stringify(envelope));
const clear = await decryptContentPack(parsed, passphrase);
assert.equal(clear.manifest.packId, 'test-pack');
assert.equal(clear.metadata.sourceDocumentCount, 80);
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

const raster = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==';
function rasterizeAllSrc(value) {
  if (Array.isArray(value)) return value.forEach(rasterizeAllSrc);
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (key === 'src' && typeof item === 'string' && item.trim()) value[key] = raster;
    else rasterizeAllSrc(item);
  }
}
{
  const confidentialTopics = structuredClone(TOPICS);
  assert.throws(() => createContentPack({ packId: 'confidential-test', version: '1.0.0', label: 'Confidential', classification: 'CONFIDENTIAL-EXAM', topics: confidentialTopics }), /vložená rastrová média/i);
}
{
  const confidentialTopics = structuredClone(TOPICS);
  rasterizeAllSrc(confidentialTopics);
  confidentialTopics[0].exam.pictures.images[0].src = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
  assert.throws(() => createContentPack({ packId: 'unsafe-media', version: '1.0.0', label: 'Unsafe media', classification: 'CONFIDENTIAL-EXAM', topics: confidentialTopics }), /nepovolený asset/i);
}

// 1.0.0 publisher-authenticity gate for CONFIDENTIAL-EXAM.
const confidentialTopics = structuredClone(TOPICS);
rasterizeAllSrc(confidentialTopics);
const confidentialPack = createContentPack({
  packId: 'confidential-signed-test', version: '2027.0.test', label: 'Confidential signed test',
  classification: 'CONFIDENTIAL-EXAM', topics: confidentialTopics, createdAt: '2026-09-02T00:00:00.000Z'
});
const unsignedConfidential = await encryptContentPack(confidentialPack, passphrase, { iterations: 200000 });
await assert.rejects(() => verifyEnvelopePublisherSignature(unsignedConfidential, {}, ['CONFIDENTIAL-EXAM']), /povinný podpis/i);

const pair = await crypto.webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const privateJwk = await crypto.webcrypto.subtle.exportKey('jwk', pair.privateKey);
const publicJwk = await crypto.webcrypto.subtle.exportKey('jwk', pair.publicKey);
const keyId = 'synthetic-publisher-1';
const signedConfidential = await signContentPackEnvelope(unsignedConfidential, privateJwk, keyId);
const verified = await verifyEnvelopePublisherSignature(signedConfidential, { [keyId]: publicJwk }, ['CONFIDENTIAL-EXAM']);
assert.deepEqual(verified, { ok: true, signed: true, keyId });
assert.equal(safeEnvelopeMeta(signedConfidential).publisherSigned, true);
assert.equal(safeEnvelopeMeta(signedConfidential).publisherKeyId, keyId);
assert.equal((await decryptContentPack(signedConfidential, passphrase)).manifest.packId, 'confidential-signed-test');

const signedMetaTamper = structuredClone(signedConfidential);
signedMetaTamper.label = 'Changed after signature';
await assert.rejects(() => verifyEnvelopePublisherSignature(signedMetaTamper, { [keyId]: publicJwk }, ['CONFIDENTIAL-EXAM']), /podpis.*není platný/i);
const signedPayloadTamper = structuredClone(signedConfidential);
const p = signedPayloadTamper.payload.split('');
p[Math.floor(p.length / 2)] = p[Math.floor(p.length / 2)] === 'A' ? 'B' : 'A';
signedPayloadTamper.payload = p.join('');
await assert.rejects(() => verifyEnvelopePublisherSignature(signedPayloadTamper, { [keyId]: publicJwk }, ['CONFIDENTIAL-EXAM']), /integrity/i);
await assert.rejects(() => verifyEnvelopePublisherSignature(signedConfidential, { other: publicJwk }, ['CONFIDENTIAL-EXAM']), /neznámým publisher/i);

console.log('Content Pack crypto + publisher signature tests: PASS');
