import assert from 'node:assert/strict';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
import { TOPICS } from '../src/demo-content.js';
import { readRuntimeConfig } from '../src/providers/runtime.js';
import { createProviderRegistry } from '../src/providers/registry.js';
import { getOrCreateInstallationId, validateLeasePayload, MAX_OFFLINE_LEASE_HOURS, INSTALLATION_ID_STORAGE_KEY } from '../src/providers/auth-lease.js';
import { normalizeFactCheckResult } from '../src/fact-check.js';

const root = new URL('../', import.meta.url);
const read = rel => fs.readFileSync(new URL(rel, root), 'utf8');
const locationLike = { href: 'https://school.example/apps/maturita-desk/' };

// HIGH fix regression: invalid runtime must instantiate locked, capability-free providers.
const lockedRuntime = readRuntimeConfig({ schema: 'maturita-desk-runtime-v1', version: 1, environmentId: 'tampered', mode: 'school-server', allowedOrigins: ['self'] }, locationLike);
assert.equal(lockedRuntime.mode, 'locked');
const store = { async saveEncryptedPack(){}, async getActivePackMeta(){ return null; }, async loadActiveEnvelope(){ return null; }, async removeActivePack(){ return false; } };
const lockedRegistry = createProviderRegistry(lockedRuntime, { contentStore: store, fetchImpl: async () => { throw new Error('must not fetch'); }, locationLike, cryptoImpl: webcrypto });
const lockedAuth = await lockedRegistry.auth.initialize();
assert.equal(lockedRegistry.auth.kind, 'locked');
assert.equal(lockedRegistry.content.kind, 'locked');
assert.equal(lockedRegistry.factCheck, null);
assert.equal(lockedAuth.authenticated, false);
assert.deepEqual([...lockedAuth.capabilities], []);

// Offline authorization maximum is enforced inside the verifier contract, not only config parsing.
const issued = Date.parse('2027-01-01T00:00:00Z');
assert.throws(() => validateLeasePayload({
  schema: 'maturita-desk-offline-auth-lease-v1', appId: 'maturita-desk', installationId: 'mdi-synthetic', subject: 'teacher',
  issuedAt: new Date(issued).toISOString(), expiresAt: new Date(issued + (MAX_OFFLINE_LEASE_HOURS + 2) * 3600000).toISOString(), capabilities: ['exam']
}, { installationId: 'mdi-synthetic', now: issued + 1000, maxHours: 168 }), /delší platnost/i);

// CSPRNG fallback: no Math.random/clock identifier for authorization binding.
const map = new Map();
const storage = { getItem:k=>map.get(k)??null, setItem:(k,v)=>map.set(k,String(v)), removeItem:k=>map.delete(k) };
const cryptoFallback = { getRandomValues(bytes) { bytes.fill(0x5a); return bytes; } };
const install = getOrCreateInstallationId(storage, cryptoFallback);
assert.equal(install, `mdi-${'5a'.repeat(16)}`);
assert.equal(storage.getItem(INSTALLATION_ID_STORAGE_KEY), install);
assert.throws(() => getOrCreateInstallationId({ getItem(){return null;}, setItem(){} }, {}), /kryptograficky bezpečného generátoru/i);

// XSS regression: raw topic.number must no longer be interpolated in the UI.
const main = read('src/main.js');
assert.doesNotMatch(main, /\$\{\s*topic\.number\s*\}/);
assert.match(main, /function topicNumber\(topic\)/);
assert.match(main, /escapeHtml\(state\.content\.error/);

// CSP: scripts and event-handler attributes remain closed even though dynamic style attributes are retained for Safari compatibility.
const index = read('index.html');
assert.match(index, /Content-Security-Policy/);
assert.match(index, /script-src 'self'/);
assert.match(index, /script-src-attr 'none'/);
assert.match(index, /object-src 'none'/);
assert.match(index, /base-uri 'none'/);
const cspContent = index.match(/Content-Security-Policy\" content=\"([^\"]+)/)?.[1] || '';
const scriptDirective = cspContent.split(';').map(x => x.trim()).find(x => x.startsWith('script-src ')) || '';
assert.equal(scriptDirective.includes("'unsafe-inline'"), false);

// Conservative SW cache: unknown GETs are not caught, navigations are not written to cache.
const sw = read('sw.js');
assert.match(sw, /if \(!isCoreAsset\(url, scopePath\)\) return;/);
const navBody = sw.slice(sw.indexOf('async function navigationNetworkFirst'), sw.indexOf('function relativeAssetPath'));
assert.doesNotMatch(navBody, /cache\.put\(request/);
assert.match(sw, /'\.\/runtime-config\.js'/);
assert.match(sw, /'\.\/config\/origin-authorization\.json'/);
assert.match(sw, /relative === 'config\/deployment\.json'/);

// Fact Check results reject plaintext HTTP source links.
const fact = normalizeFactCheckResult({
  schema:'maturita-desk-fact-check-v1', verdict:'confirmed', confidence:'high', answer:'Synthetic',
  sources:[{title:'HTTPS',url:'https://example.org/a'},{title:'HTTP',url:'http://example.org/b'}]
});
assert.deepEqual(fact.sources.map(x=>x.url), ['https://example.org/a']);

// Public code inventory: dangerous executable sinks are absent. outerHTML is allowed only for app-owned phase action markup.
const textFiles = ['src/main.js','src/fact-check.js','src/content-validator.js','src/providers/runtime.js','src/providers/auth-provider.js','src/providers/content-provider.js'];
const combined = textFiles.map(read).join('\n');
assert.doesNotMatch(combined, /\beval\s*\(|\bnew\s+Function\s*\(|document\.write\s*\(/);
assert.doesNotMatch(combined, /javascript:/i);

// Synthetic source itself remains complete after stricter validator contracts.
assert.equal(TOPICS.length, 20);

console.log('Stage 12 security regression suite: PASS');
