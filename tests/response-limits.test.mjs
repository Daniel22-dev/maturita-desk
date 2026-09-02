import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readTextLimited } from '../src/net/read-limited.js';
import { createHttpFactCheckProvider } from '../src/fact-check.js';
import { createSchoolServerAuthProvider } from '../src/providers/auth-provider.js';
import { createSchoolServerContentProvider } from '../src/providers/content-provider.js';

function streamingResponse({ totalBytes, chunkBytes = 64 * 1024, status = 200 }) {
  let produced = 0;
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) {
      if (produced >= totalBytes) { controller.close(); return; }
      const size = Math.min(chunkBytes, totalBytes - produced);
      produced += size;
      controller.enqueue(new Uint8Array(size));
    },
    cancel() { cancelled = true; }
  });
  return { response: new Response(stream, { status, headers: { 'Content-Type': 'application/json' } }), stats: () => ({ produced, cancelled }) };
}

// Negative control for Claude B-02: when streaming is unavailable and Content-Length is absent,
// the helper must fail closed without calling response.text() and materializing the body.
let textCalled = 0;
const noStream = {
  headers: { get() { return null; } },
  body: null,
  async text() { textCalled++; return 'x'.repeat(8 * 1024 * 1024); }
};
await assert.rejects(() => readTextLimited(noStream, 128 * 1024), /příliš velká|bezpečně přečíst/i);
assert.equal(textCalled, 0, 'unbounded response.text() fallback must never be used');

// Generic streamed cap aborts close to the configured boundary, not after all 8 MiB arrive.
const generic = streamingResponse({ totalBytes: 8 * 1024 * 1024 });
await assert.rejects(() => readTextLimited(generic.response, 128 * 1024), /příliš velká|bezpečně přečíst/i);
assert.ok(generic.stats().produced <= 256 * 1024, `generic stream over-read: ${generic.stats().produced}`);

// Fact Check provider uses the streamed cap.
const factStream = streamingResponse({ totalBytes: 8 * 1024 * 1024 });
const fact = createHttpFactCheckProvider({ endpoint: 'https://fact.example/check', fetchImpl: async () => factStream.response });
await assert.rejects(() => fact.check('Synthetic fact'), error => error?.code === 'INVALID_RESPONSE');
assert.ok(factStream.stats().produced <= 256 * 1024, `fact stream over-read: ${factStream.stats().produced}`);

class StorageStub {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

// Auth provider uses the same cap and degrades to unavailable instead of exhausting memory.
const authStream = streamingResponse({ totalBytes: 8 * 1024 * 1024 });
const auth = createSchoolServerAuthProvider({
  sessionEndpoint: 'https://school.example/session', loginUrl: 'https://school.example/login', logoutEndpoint: 'https://school.example/logout',
  offlineLease: { enabled: false }
}, {
  fetchImpl: async () => authStream.response,
  storage: new StorageStub(), cryptoImpl: webcrypto,
  locationLike: { href: 'https://school.example/app/' }
});
const authState = await auth.initialize({ online: true });
assert.equal(authState.authenticated, false);
assert.equal(authState.status, 'unavailable');
assert.ok(authStream.stats().produced <= 256 * 1024, `auth stream over-read: ${authStream.stats().produced}`);

// Content delivery is allowed to be much larger, but still has a hard streamed cap.
let active = null;
const store = {
  async saveEncryptedPack(value) { active = value; }, async getActivePackMeta() { return null; },
  async loadActiveEnvelope() { return active; }, async removeActivePack() { active = null; }
};
const contentStream = streamingResponse({ totalBytes: 40 * 1024 * 1024, chunkBytes: 1024 * 1024 });
const content = createSchoolServerContentProvider({ activePackEndpoint: 'https://school.example/content', allowManualImport: false }, store, {
  authSnapshot: () => ({ authenticated: true, capabilities: ['content:download'] }),
  fetchImpl: async () => contentStream.response
});
await assert.rejects(() => content.sync(), /příliš velká|bezpečně přečíst/i);
assert.ok(contentStream.stats().produced <= 35 * 1024 * 1024, `content stream over-read: ${contentStream.stats().produced}`);
assert.equal(active, null);

console.log('Streamed response byte-cap regression tests: PASS');
