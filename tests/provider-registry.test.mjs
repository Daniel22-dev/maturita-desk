import assert from 'node:assert/strict';
import { readRuntimeConfig } from '../src/providers/runtime.js';
import { createProviderRegistry } from '../src/providers/registry.js';

const store = {
  async saveEncryptedPack() {}, async getActivePackMeta() { return null; },
  async loadActiveEnvelope() { return null; }, async removeActivePack() { return false; }
};
const locationLike = { href: 'https://school.example/apps/maturita-desk/' };

const localRuntime = readRuntimeConfig({
  schema: 'maturita-desk-runtime-v1', version: 1, environmentId: 'local', mode: 'standalone-local', allowedOrigins: ['self'],
  auth: { provider: 'local-device' }, content: { provider: 'encrypted-local' }, factCheck: { provider: 'isolated-http', endpoint: 'https://fact.example/check' }
}, locationLike);
const localRegistry = createProviderRegistry(localRuntime, { contentStore: store, fetchImpl: async () => new Response('{}') , locationLike });
assert.equal(localRegistry.auth.kind, 'local-device');
assert.equal(localRegistry.content.kind, 'encrypted-local');

let factRequest = null;
const schoolRuntime = readRuntimeConfig({
  schema: 'maturita-desk-runtime-v1', version: 1, environmentId: 'school', mode: 'school-server', serverBaseUrl: '/api/v1/maturita-desk/', allowedOrigins: ['self'],
  auth: { provider: 'school-server-session', sessionEndpoint: 'session', loginUrl: '/auth/login/maturita-desk', logoutEndpoint: 'session/logout', offlineLease: { enabled: false } },
  content: { provider: 'school-server-encrypted-pack', activePackEndpoint: 'content/active', allowManualImport: false },
  factCheck: { provider: 'school-server', endpoint: 'fact-check', timeoutMs: 10000 }
}, locationLike);
const registry = createProviderRegistry(schoolRuntime, {
  contentStore: store, locationLike,
  fetchImpl: async (url, options) => {
    if (String(url).endsWith('/fact-check')) {
      factRequest = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ schema: 'maturita-desk-fact-check-v1', verdict: 'confirmed', confidence: 'high', answer: 'Synthetic verification.', sources: [{ title: 'Source', url: 'https://example.org/' }], searched: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error('unexpected fetch');
  }
});
assert.equal(registry.auth.kind, 'school-server-session');
assert.equal(registry.content.kind, 'school-server-encrypted-pack');
registry.setAuthState({ authenticated: true, csrfToken: 'csrf-registry', capabilities: ['fact-check'] });
await registry.factCheck.check('Synthetic claim');
assert.deepEqual(factRequest.body, { query: 'Synthetic claim' });
assert.equal(factRequest.options.credentials, 'include');
assert.equal(factRequest.options.mode, 'same-origin');
assert.equal(factRequest.options.headers['X-CSRF-Token'], 'csrf-registry');
assert.equal('topic' in factRequest.body, false);
assert.equal('notes' in factRequest.body, false);
assert.equal('session' in factRequest.body, false);

console.log('Provider registry tests: PASS');
