import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadRuntimeConfig } from '../src/providers/runtime.js';

const root = new URL('../', import.meta.url);
const deployment = JSON.parse(fs.readFileSync(new URL('config/deployment.json', root), 'utf8'));
delete globalThis.MATURITA_DESK_RUNTIME;
await import(`../runtime-config.js?final=${Date.now()}`);
const baked = globalThis.MATURITA_DESK_RUNTIME;

assert.equal(baked.environmentId, 'serverless-production');
assert.equal(baked.mode, 'standalone-local');
assert.deepEqual([...baked.trust.confidentialContentOrigins], ['https://maturita.ghrabuvka.cz']);
assert.ok(baked.trust.appOrigins.includes('https://daniel22-dev.github.io'));
assert.ok(baked.trust.appOrigins.includes('https://maturita.ghrabuvka.cz'));
assert.deepEqual([...baked.content.requirePublisherSignatureFor], ['CONFIDENTIAL-EXAM']);
assert.ok(Object.keys(baked.content.publisherKeys).length >= 1);
for (const jwk of Object.values(baked.content.publisherKeys)) assert.equal('d' in jwk, false, 'public build must not contain a publisher private key');

const fetchConfig = async () => new Response(JSON.stringify(deployment), { status: 200, headers: { 'Content-Type': 'application/json' } });
const demo = await loadRuntimeConfig({ baked, locationLike: { href: 'https://daniel22-dev.github.io/maturita-desk/' }, fetchImpl: fetchConfig });
assert.equal(demo.mode, 'standalone-local');
assert.equal(demo.content.confidentialAllowed, false, 'shared GitHub Pages origin must remain demo-only');

const production = await loadRuntimeConfig({ baked, locationLike: { href: 'https://maturita.ghrabuvka.cz/' }, fetchImpl: fetchConfig });
assert.equal(production.mode, 'standalone-local');
assert.equal(production.content.confidentialAllowed, true, 'isolated pinned production origin must allow signed confidential packs');
assert.ok(Object.keys(production.content.publisherKeys).length >= 1);

const wrongOrigin = await loadRuntimeConfig({ baked, locationLike: { href: 'https://attacker.example/' }, fetchImpl: fetchConfig });
assert.equal(wrongOrigin.mode, 'locked');
assert.equal(wrongOrigin.configurationError, 'deployment-origin-mismatch');

assert.equal(fs.existsSync(new URL('START-MATURITA-DESK-INTERNAL.cmd', root)), false, 'normal final release must not ship the localhost launcher');
assert.equal(fs.existsSync(new URL('RELEASE-1.0.0-STATUS.md', root)), true);
assert.equal(fs.existsSync(new URL('SERVERLESS-PRODUCTION-DEPLOY.txt', root)), true);

console.log('Serverless 1.0.0 final trust/profile tests: PASS');
