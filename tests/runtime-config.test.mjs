import assert from 'node:assert/strict';
import { readRuntimeConfig, loadRuntimeConfig, endpointOriginAllowed, MAX_OFFLINE_LEASE_HOURS } from '../src/providers/runtime.js';

const locationLike = { href: 'https://school.example/apps/maturita-desk/' };

const localRaw = {
  schema: 'maturita-desk-runtime-v1', version: 1, environmentId: 'local', mode: 'standalone-local',
  allowedOrigins: ['self', 'https://fact.example'], auth: { provider: 'local-device' }, content: { provider: 'encrypted-local' },
  factCheck: { provider: 'isolated-http', endpoint: 'https://fact.example/check', timeoutMs: 12000 }
};
const local = readRuntimeConfig(localRaw, locationLike, {
  expectedMode: 'standalone-local', expectedEnvironmentId: 'local', allowedOrigins: ['self', 'https://fact.example']
});
assert.equal(local.mode, 'standalone-local');
assert.equal(local.configurationError, '');
assert.equal(local.auth.provider, 'local-device');
assert.equal(local.content.allowManualImport, true);
assert.equal(local.factCheck.endpoint, 'https://fact.example/check');

// Network/runtime config can narrow baked trust but cannot expand it.
const localUntrustedEgress = readRuntimeConfig(localRaw, locationLike, {
  expectedMode: 'standalone-local', expectedEnvironmentId: 'local', allowedOrigins: ['self']
});
assert.equal(localUntrustedEgress.mode, 'standalone-local');
assert.equal(localUntrustedEgress.factCheck.endpoint, '');

const school = readRuntimeConfig({
  schema: 'maturita-desk-runtime-v1', version: 1, environmentId: 'school-prod', mode: 'school-server',
  serverBaseUrl: '/api/v1/maturita-desk/', allowedOrigins: ['self'],
  auth: { provider: 'school-server-session', sessionEndpoint: 'session', loginUrl: '/auth/login/maturita-desk', logoutEndpoint: 'session/logout', offlineLease: { enabled: false, maxHours: 168 } },
  content: { provider: 'school-server-encrypted-pack', activePackEndpoint: 'content/active', allowManualImport: false },
  factCheck: { provider: 'school-server', endpoint: 'fact-check', timeoutMs: 18000 }
}, locationLike);
assert.equal(school.mode, 'school-server');
assert.equal(school.configurationError, '');
assert.equal(school.auth.sessionEndpoint, 'https://school.example/api/v1/maturita-desk/session');
assert.equal(school.auth.logoutEndpoint, 'https://school.example/api/v1/maturita-desk/session/logout');
assert.equal(school.content.activePackEndpoint, 'https://school.example/api/v1/maturita-desk/content/active');
assert.equal(school.factCheck.endpoint, 'https://school.example/api/v1/maturita-desk/fact-check');
assert.equal(school.content.allowManualImport, false);
assert.equal(school.auth.offlineLease.maxHours, MAX_OFFLINE_LEASE_HOURS, 'offline authorization must never exceed 24h client policy');

// Missing logout is a configuration error in school-server mode.
const schoolNoLogout = readRuntimeConfig({
  schema: 'maturita-desk-runtime-v1', version: 1, environmentId: 'school-prod', mode: 'school-server',
  serverBaseUrl: '/api/v1/maturita-desk/', allowedOrigins: ['self'],
  auth: { provider: 'school-server-session', sessionEndpoint: 'session', loginUrl: '/auth/login/maturita-desk', offlineLease: { enabled: false } },
  content: { provider: 'school-server-encrypted-pack', activePackEndpoint: 'content/active' },
  factCheck: { provider: 'school-server', endpoint: 'fact-check' }
}, locationLike);
assert.equal(schoolNoLogout.mode, 'locked');
assert.match(schoolNoLogout.configurationError, /auth/);

const crossOriginRejected = readRuntimeConfig({
  schema: 'maturita-desk-runtime-v1', version: 1, environmentId: 'bad', mode: 'school-server',
  serverBaseUrl: 'https://evil.example/api/', allowedOrigins: ['https://evil.example'],
  auth: { provider: 'school-server-session', sessionEndpoint: 'session', loginUrl: 'https://evil.example/login', logoutEndpoint: 'https://evil.example/logout' },
  content: { provider: 'school-server-encrypted-pack', activePackEndpoint: 'content' },
  factCheck: { provider: 'school-server', endpoint: 'fact' }
}, locationLike, { allowedOrigins: ['self'] });
assert.equal(crossOriginRejected.mode, 'locked');
assert.match(crossOriginRejected.configurationError, /invalid-school-server-configuration/);
assert.equal(crossOriginRejected.serverBaseUrl, '');
assert.equal(endpointOriginAllowed('http://evil.example/api', ['self'], locationLike), false);
assert.equal(endpointOriginAllowed('https://school.example/api', ['self'], locationLike), true);

const unsupported = readRuntimeConfig({ schema: 'wrong', version: 99 }, locationLike);
assert.equal(unsupported.mode, 'locked');
assert.equal(unsupported.configurationError, 'unsupported-runtime-schema');
const missing = readRuntimeConfig(undefined, locationLike);
assert.equal(missing.mode, 'locked');
assert.equal(missing.configurationError, 'runtime-configuration-missing');

let loadCaptured = null;
const bakedLocal = {
  schema: 'maturita-desk-runtime-v1', version: 1, environmentId: 'baked', mode: 'standalone-local', allowedOrigins: ['self'],
  trust: { expectedMode: 'standalone-local', expectedEnvironmentId: 'baked', appOrigins: ['https://school.example'] },
  auth: { provider: 'local-device' }, content: { provider: 'encrypted-local' }, factCheck: { provider: 'isolated-http', endpoint: '' }
};
const loaded = await loadRuntimeConfig({
  baked: bakedLocal,
  locationLike,
  fetchImpl: async (url, options) => {
    loadCaptured = { url, options };
    return new Response(JSON.stringify({ schema: 'maturita-desk-runtime-v1', version: 1, environmentId: 'baked', mode: 'standalone-local', allowedOrigins: ['self'], auth: { provider: 'local-device' }, content: { provider: 'encrypted-local' }, factCheck: { provider: 'isolated-http', endpoint: '' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
});
assert.equal(loaded.environmentId, 'baked');
assert.equal(loaded.configurationSource, 'network');
assert.equal(loadCaptured.options.cache, 'no-store');
assert.equal(loadCaptured.options.credentials, 'same-origin');

const fallbackLoaded = await loadRuntimeConfig({
  baked: bakedLocal,
  locationLike,
  fetchImpl: async () => { throw new Error('offline'); }
});
assert.equal(fallbackLoaded.environmentId, 'baked');
assert.equal(fallbackLoaded.mode, 'standalone-local');
assert.equal(fallbackLoaded.configurationSource, 'baked-fallback');
assert.equal(fallbackLoaded.configurationLoadError, 'deployment-config-unavailable');

// N-01 regression: the public standalone baked profile must not silently become active
// when copied to a different (e.g. school) origin and network config is unavailable.
const stalePublicBaked = {
  ...bakedLocal,
  environmentId: 'standalone-local',
  trust: { expectedMode: 'standalone-local', expectedEnvironmentId: 'standalone-local', appOrigins: ['https://daniel22-dev.github.io'] }
};
const wrongOriginFallback = await loadRuntimeConfig({
  baked: stalePublicBaked,
  locationLike,
  fetchImpl: async () => { throw new Error('network down'); }
});
assert.equal(wrongOriginFallback.mode, 'locked');
assert.equal(wrongOriginFallback.configurationSource, 'origin-lock');
assert.equal(wrongOriginFallback.configurationError, 'deployment-origin-mismatch');

// Mode/environment are release-pinned by the baked profile. Network config cannot switch them.
const modeMismatch = await loadRuntimeConfig({
  baked: bakedLocal,
  locationLike,
  fetchImpl: async () => new Response(JSON.stringify({
    schema: 'maturita-desk-runtime-v1', version: 1, environmentId: 'baked', mode: 'school-server', allowedOrigins: ['self'],
    auth: { provider: 'school-server-session', sessionEndpoint: '/s', loginUrl: '/l', logoutEndpoint: '/o' },
    content: { provider: 'school-server-encrypted-pack', activePackEndpoint: '/c' }, factCheck: { provider: 'school-server', endpoint: '/f' }
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
});
assert.equal(modeMismatch.mode, 'locked');
assert.equal(modeMismatch.configurationError, 'runtime-mode-mismatch');

const environmentMismatch = await loadRuntimeConfig({
  baked: bakedLocal,
  locationLike,
  fetchImpl: async () => new Response(JSON.stringify({
    schema: 'maturita-desk-runtime-v1', version: 1, environmentId: 'other', mode: 'standalone-local', allowedOrigins: ['self'],
    auth: { provider: 'local-device' }, content: { provider: 'encrypted-local' }, factCheck: { provider: 'isolated-http', endpoint: '' }
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
});
assert.equal(environmentMismatch.mode, 'locked');
assert.equal(environmentMismatch.configurationError, 'runtime-environment-mismatch');

// Negative control for Stage 12 HIGH fix: a syntactically valid but semantically invalid
// network configuration must NOT fall back to standalone-local permissions.
const bakedSchool = {
  schema: 'maturita-desk-runtime-v1', version: 1, environmentId: 'baked-school', mode: 'school-server',
  serverBaseUrl: '/api/v1/maturita-desk/', allowedOrigins: ['self'],
  trust: { expectedMode: 'school-server', expectedEnvironmentId: 'baked-school', appOrigins: ['https://school.example'] },
  auth: { provider: 'school-server-session', sessionEndpoint: 'session', loginUrl: '/auth/login/maturita-desk', logoutEndpoint: 'session/logout', offlineLease: { enabled: false } },
  content: { provider: 'school-server-encrypted-pack', activePackEndpoint: 'content/active', allowManualImport: false },
  factCheck: { provider: 'school-server', endpoint: 'fact-check' }
};
const malformedNetwork = await loadRuntimeConfig({
  baked: bakedSchool,
  locationLike,
  fetchImpl: async () => new Response(JSON.stringify({ schema: 'maturita-desk-runtime-v1', version: 1, environmentId: 'baked-school', mode: 'not-a-real-mode' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
});
assert.equal(malformedNetwork.mode, 'locked');
assert.equal(malformedNetwork.auth.provider, 'locked');
assert.equal(malformedNetwork.content.allowManualImport, false);
assert.equal(malformedNetwork.configurationError, 'unsupported-runtime-mode');



// 1.0.1 origin-neutral serverless trust. The shared GitHub Pages origin stays
// demo-only. Confidential access is granted only after the async signed-origin
// authorization step extends the baked trust policy with the current origin.
const publisherKey = { kty: 'EC', crv: 'P-256', x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', y: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', ext: true, key_ops: ['verify'] };
const finalRaw = {
  schema: 'maturita-desk-runtime-v1', version: 1, environmentId: 'serverless-production', mode: 'standalone-local',
  allowedOrigins: ['self'],
  auth: { provider: 'local-device' },
  content: { provider: 'encrypted-local', requirePublisherSignatureFor: ['CONFIDENTIAL-EXAM'], publisherKeys: { 'publisher-1': publisherKey } },
  factCheck: { provider: 'isolated-http', endpoint: '' }
};
const baseTrust = {
  expectedMode: 'standalone-local', expectedEnvironmentId: 'serverless-production',
  allowedOrigins: ['self'], confidentialContentOrigins: [], allowLocalhostConfidential: true,
  publisherKeys: { 'publisher-1': publisherKey }, requirePublisherSignatureFor: ['CONFIDENTIAL-EXAM']
};
const githubDemo = readRuntimeConfig(finalRaw, { href: 'https://daniel22-dev.github.io/maturita-desk/' }, baseTrust);
assert.equal(githubDemo.mode, 'standalone-local');
assert.equal(githubDemo.content.confidentialAllowed, false);
const authorizedTrust = { ...baseTrust, confidentialContentOrigins: ['https://neutral-host.example'] };
const production = readRuntimeConfig(finalRaw, { href: 'https://neutral-host.example/' }, authorizedTrust);
assert.equal(production.mode, 'standalone-local');
assert.equal(production.content.confidentialAllowed, true);
assert.deepEqual(Object.keys(production.content.publisherKeys), ['publisher-1']);
const maliciousPublisherNetwork = readRuntimeConfig({ ...finalRaw, content: { ...finalRaw.content, publisherKeys: { 'attacker': publisherKey } } }, { href: 'https://neutral-host.example/' }, authorizedTrust);
assert.equal(maliciousPublisherNetwork.mode, 'locked', 'network config cannot replace the baked publisher key and leave confidential mode active');
assert.match(maliciousPublisherNetwork.configurationError, /publisherKeys/);

console.log('Runtime/provider config fail-closed tests: PASS');
