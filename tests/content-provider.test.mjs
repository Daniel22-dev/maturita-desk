import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createLocalEncryptedContentProvider, createSchoolServerContentProvider } from '../src/providers/content-provider.js';

const envelope = JSON.parse(fs.readFileSync(new URL('../samples/synthetic-demo-2027.mdesk', import.meta.url), 'utf8'));
function memoryStore() {
  let active = null;
  return {
    async saveEncryptedPack(value) { active = structuredClone(value); return value; },
    async getActivePackMeta() { return active ? { packId: active.packId, contentVersion: active.contentVersion } : null; },
    async loadActiveEnvelope() { return active; },
    async removeActivePack() { const had = !!active; active = null; return had; },
    get active() { return active; }
  };
}

const localStore = memoryStore();
const local = createLocalEncryptedContentProvider(localStore, { confidentialAllowed: false, requirePublisherSignatureFor: ['CONFIDENTIAL-EXAM'], publisherKeys: {} });
assert.equal(local.kind, 'encrypted-local');
assert.equal(local.allowManualImport, true);
const imported = await local.importText(JSON.stringify(envelope));
assert.equal(imported.packId, envelope.packId);
assert.equal(localStore.active.schema, 'maturita-desk-encrypted-pack-v1');

const fakeConfidential = { ...structuredClone(envelope), classification: 'CONFIDENTIAL-EXAM' };
await assert.rejects(() => local.importText(JSON.stringify(fakeConfidential)), /izolovaném produkčním originu/i, 'shared/demo origin policy must block confidential packs');
const localConfidentialOrigin = createLocalEncryptedContentProvider(memoryStore(), { confidentialAllowed: true, requirePublisherSignatureFor: ['CONFIDENTIAL-EXAM'], publisherKeys: {} });
await assert.rejects(() => localConfidentialOrigin.importText(JSON.stringify(fakeConfidential)), /povinný podpis/i, 'production origin still requires publisher signature');

let captured = null;
const serverStore = memoryStore();
let auth = { authenticated: true, capabilities: ['content:download'] };
const remote = createSchoolServerContentProvider({ activePackEndpoint: 'https://school.example/api/content/active', allowManualImport: false, confidentialAllowed: false }, serverStore, {
  authSnapshot: () => auth,
  fetchImpl: async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ schema: 'maturita-desk-content-delivery-v1', envelope }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
});
const synced = await remote.sync();
assert.equal(synced.packId, envelope.packId);
assert.equal(captured.options.credentials, 'include');
assert.equal(captured.options.cache, 'no-store');
assert.equal(serverStore.active.packId, envelope.packId);
await assert.rejects(() => remote.importText(JSON.stringify(envelope)), /Ruční import/);

auth = { authenticated: false, capabilities: [] };
await assert.rejects(() => remote.sync(), /oprávnění/);
assert.equal(serverStore.active.packId, envelope.packId, 'failed sync must not delete cached pack');

const malformedStore = memoryStore();
const malformed = createSchoolServerContentProvider({ activePackEndpoint: 'https://school.example/api/content/active', allowManualImport: false }, malformedStore, {
  authSnapshot: () => ({ authenticated: true, capabilities: ['content:download'] }),
  fetchImpl: async () => new Response(JSON.stringify({ schema: 'wrong', plaintext: 'SHOULD NEVER BE ACCEPTED' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
});
await assert.rejects(() => malformed.sync(), /Nepodporovaný Content delivery/);
assert.equal(malformedStore.active, null);

console.log('Content provider tests: PASS');
