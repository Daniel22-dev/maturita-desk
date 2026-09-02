import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readRuntimeConfig } from '../src/providers/runtime.js';
import { createProviderRegistry } from '../src/providers/registry.js';

const envelope = JSON.parse(fs.readFileSync(new URL('../samples/synthetic-demo-2027.mdesk', import.meta.url), 'utf8'));
let active = null;
const store = {
  async saveEncryptedPack(value) { active = structuredClone(value); },
  async getActivePackMeta() { return active ? { packId: active.packId, contentVersion: active.contentVersion } : null; },
  async loadActiveEnvelope() { return active; },
  async removeActivePack() { active = null; return true; }
};
const locationLike = { href: 'https://school.example/apps/maturita-desk/' };
const runtime = readRuntimeConfig({
  schema: 'maturita-desk-runtime-v1', version: 1, environmentId: 'integration', mode: 'school-server',
  serverBaseUrl: '/api/v1/maturita-desk/', allowedOrigins: ['self'],
  auth: { provider: 'school-server-session', sessionEndpoint: 'session', loginUrl: '/auth/login/maturita-desk', logoutEndpoint: 'session/logout', offlineLease: { enabled: false } },
  content: { provider: 'school-server-encrypted-pack', activePackEndpoint: 'content/active', allowManualImport: false },
  factCheck: { provider: 'school-server', endpoint: 'fact-check', timeoutMs: 10000 }
}, locationLike);

const requests = [];
const fetchImpl = async (url, options) => {
  const pathname = new URL(url).pathname;
  requests.push({ pathname, options, body: options.body ? JSON.parse(options.body) : null });
  if (pathname.endsWith('/session')) {
    return new Response(JSON.stringify({
      schema: 'maturita-desk-auth-session-v1', authenticated: true, user: { displayName: 'Synthetic Teacher' },
      capabilities: ['exam','practice','review','content:download','fact-check'], expiresAt: '2030-01-01T00:00:00.000Z', csrfToken: 'csrf-stage10'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (pathname.endsWith('/content/active')) {
    return new Response(JSON.stringify({ schema: 'maturita-desk-content-delivery-v1', envelope }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (pathname.endsWith('/fact-check')) {
    return new Response(JSON.stringify({ schema: 'maturita-desk-fact-check-v1', verdict: 'confirmed', confidence: 'medium', answer: 'Synthetic server-mode verification.', sources: [{ title: 'Synthetic source', url: 'https://example.org/source' }], searched: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error(`Unexpected endpoint: ${pathname}`);
};

const registry = createProviderRegistry(runtime, { contentStore: store, fetchImpl, locationLike });
const auth = await registry.auth.initialize({ online: true });
registry.setAuthState(auth);
assert.equal(auth.authenticated, true);
assert.equal(auth.source, 'server-session');
const meta = await registry.content.sync();
assert.equal(meta.packId, envelope.packId);
const result = await registry.factCheck.check('Synthetic claim for server mode.');
assert.equal(result.verdict, 'confirmed');

const sessionReq = requests.find(r => r.pathname.endsWith('/session'));
const contentReq = requests.find(r => r.pathname.endsWith('/content/active'));
const factReq = requests.find(r => r.pathname.endsWith('/fact-check'));
for (const req of [sessionReq, contentReq, factReq]) {
  assert.equal(req.options.credentials, 'include');
  assert.equal(req.options.cache, 'no-store');
}
assert.deepEqual(factReq.body, { query: 'Synthetic claim for server mode.' });
assert.equal(factReq.options.headers['X-CSRF-Token'], 'csrf-stage10');
assert.equal('topic' in factReq.body, false);
assert.equal('notes' in factReq.body, false);
assert.equal(active.schema, 'maturita-desk-encrypted-pack-v1');
assert.equal(typeof active.payload, 'string');

console.log('School-server provider integration test: PASS');
