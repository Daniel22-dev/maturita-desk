import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadRuntimeConfig } from '../src/providers/runtime.js';

const root = new URL('../', import.meta.url);
const deployment = JSON.parse(fs.readFileSync(new URL('config/deployment.json', root), 'utf8'));
const placeholderAuth = JSON.parse(fs.readFileSync(new URL('config/origin-authorization.json', root), 'utf8'));
delete globalThis.MATURITA_DESK_RUNTIME;
await import(`../runtime-config.js?final=${Date.now()}`);
const baked = globalThis.MATURITA_DESK_RUNTIME;

assert.equal(baked.environmentId, 'serverless-production');
assert.equal(baked.mode, 'standalone-local');
assert.deepEqual([...baked.trust.confidentialContentOrigins], []);
assert.deepEqual([...baked.trust.appOrigins], ['https://daniel22-dev.github.io']);
assert.equal(baked.trust.originAuthorization.enabled, true);
assert.deepEqual([...baked.trust.originAuthorization.keyIds], ['ghrab-maturita-content-2026-01']);
assert.deepEqual([...baked.content.requirePublisherSignatureFor], ['CONFIDENTIAL-EXAM']);
assert.ok(Object.keys(baked.content.publisherKeys).length >= 1);
for (const jwk of Object.values(baked.content.publisherKeys)) assert.equal('d' in jwk, false, 'public build must not contain a publisher private key');

const fetchPublic = async url => {
  if (String(url).endsWith('/config/deployment.json')) return new Response(JSON.stringify(deployment), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (String(url).endsWith('/config/origin-authorization.json')) return new Response(JSON.stringify(placeholderAuth), { status: 200, headers: { 'Content-Type': 'application/json' } });
  return new Response('', { status: 404 });
};
const demo = await loadRuntimeConfig({ baked, locationLike: { href: 'https://daniel22-dev.github.io/maturita-desk/' }, fetchImpl: fetchPublic });
assert.equal(demo.mode, 'standalone-local');
assert.equal(demo.content.confidentialAllowed, false, 'shared GitHub Pages origin must remain demo-only');

const unknown = await loadRuntimeConfig({ baked, locationLike: { href: 'https://neutral-host.example/' }, fetchImpl: fetchPublic });
assert.equal(unknown.mode, 'locked', 'unknown host without a valid signed origin grant must fail closed');
assert.equal(unknown.configurationSource, 'origin-lock');

const localhost = await loadRuntimeConfig({ baked, locationLike: { href: 'http://127.0.0.1:8765/' }, fetchImpl: fetchPublic });
assert.equal(localhost.mode, 'standalone-local');
assert.equal(localhost.content.confidentialAllowed, true, 'localhost remains available for controlled development and recovery');

const combinedText = [
  fs.readFileSync(new URL('runtime-config.js', root), 'utf8'),
  fs.readFileSync(new URL('config/deployment.json', root), 'utf8'),
  fs.readFileSync(new URL('index.html', root), 'utf8')
].join('\n');
assert.doesNotMatch(combinedText, /maturita\.ghrabuvka\.cz|maturita-fact\.ghrabuvka\.cz/, 'final source must not be tied to a school domain');

assert.equal(fs.existsSync(new URL('START-MATURITA-DESK-INTERNAL.cmd', root)), false, 'normal final release must not ship the localhost launcher');
assert.equal(fs.existsSync(new URL('RELEASE-1.0.1-STATUS.md', root)), true);
assert.equal(fs.existsSync(new URL('SERVERLESS-PRODUCTION-DEPLOY.txt', root)), true);
assert.equal(fs.existsSync(new URL('config/origin-authorization.json', root)), true);

console.log('Serverless 1.0.1 origin-neutral trust/profile tests: PASS');
