import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createLocalDeviceAuthProvider, createSchoolServerAuthProvider, hasCapability } from '../src/providers/auth-provider.js';
import { canonicalJson, bytesToBase64Url, OFFLINE_LEASE_SCHEMA, SIGNED_LEASE_SCHEMA, OFFLINE_LEASE_STORAGE_KEY } from '../src/providers/auth-lease.js';

class StorageStub {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

const local = createLocalDeviceAuthProvider();
const localState = await local.initialize();
assert.equal(localState.authenticated, true);
assert.equal(localState.authoritative, false);
assert.equal(hasCapability(localState, 'exam'), true);

const storage = new StorageStub();
const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
const nowMs = Date.parse('2027-05-31T08:00:00.000Z');
let installationId = '';
let onlineCalls = [];

const config = {
  sessionEndpoint: 'https://school.example/api/v1/maturita-desk/session',
  loginUrl: 'https://school.example/auth/login/maturita-desk',
  logoutEndpoint: 'https://school.example/api/v1/maturita-desk/session/logout',
  offlineLease: { enabled: true, maxHours: 24, publicKeys: { 'school-key-1': publicJwk } }
};

async function signLease(id) {
  const payload = {
    schema: OFFLINE_LEASE_SCHEMA,
    appId: 'maturita-desk',
    installationId: id,
    subject: 'teacher-opaque-17',
    issuedAt: '2027-05-31T07:00:00.000Z',
    expiresAt: '2027-05-31T18:00:00.000Z',
    capabilities: ['exam', 'practice', 'content:download']
  };
  const bytes = new TextEncoder().encode(canonicalJson(payload));
  const signature = new Uint8Array(await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, bytes));
  return { schema: SIGNED_LEASE_SCHEMA, algorithm: 'ECDSA-P256-SHA256', keyId: 'school-key-1', payload, signature: bytesToBase64Url(signature) };
}

const fetchOnline = async (url, options) => {
  onlineCalls.push({ url, options });
  installationId = options.headers['X-Maturita-Desk-Installation'];
  if (options.method === 'POST') return new Response(null, { status: 204 });
  return new Response(JSON.stringify({
    schema: 'maturita-desk-auth-session-v1', authenticated: true,
    user: { displayName: 'Synthetic Teacher' },
    capabilities: ['exam', 'practice', 'review', 'content:download', 'fact-check'],
    expiresAt: '2030-05-31T18:00:00.000Z', csrfToken: 'csrf-synthetic',
    offlineLease: await signLease(installationId)
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const provider = createSchoolServerAuthProvider(config, { fetchImpl: fetchOnline, storage, cryptoImpl: webcrypto, locationLike: { href: 'https://school.example/apps/maturita-desk/' }, now: () => nowMs });
const online = await provider.initialize({ online: true });
assert.equal(online.authenticated, true);
assert.equal(online.source, 'server-session');
assert.equal(online.displayName, 'Synthetic Teacher');
assert.equal(hasCapability(online, 'fact-check'), true);
assert.equal(onlineCalls[0].options.credentials, 'include');
assert.equal(onlineCalls[0].options.cache, 'no-store');
assert.ok(installationId.startsWith('mdi-'));
assert.ok(storage.getItem(OFFLINE_LEASE_STORAGE_KEY));
// Login returnTo is path-only; query/hash values are not reflected to the Identity Provider.
const loginProvider = createSchoolServerAuthProvider(config, {
  fetchImpl: fetchOnline, storage: new StorageStub(), cryptoImpl: webcrypto,
  locationLike: { href: 'https://school.example/apps/maturita-desk/?code=SYNTH-CANARY#token=SYNTH-CANARY' },
  now: () => nowMs
});
const loginUrl = new URL(loginProvider.loginUrl());
assert.equal(loginUrl.searchParams.get('returnTo'), '/apps/maturita-desk/');
assert.equal(loginUrl.href.includes('SYNTH-CANARY'), false);

const offlineProvider = createSchoolServerAuthProvider(config, {
  fetchImpl: async () => { throw new Error('network down'); }, storage, cryptoImpl: webcrypto,
  locationLike: { href: 'https://school.example/apps/maturita-desk/' }, now: () => nowMs
});
const offline = await offlineProvider.initialize({ online: false });
assert.equal(offline.authenticated, true);
assert.equal(offline.source, 'offline-lease');
assert.equal(hasCapability(offline, 'exam', nowMs), true);
assert.equal(hasCapability(offline, 'fact-check', nowMs), false);

const tampered = JSON.parse(storage.getItem(OFFLINE_LEASE_STORAGE_KEY));
tampered.payload.capabilities.push('review');
storage.setItem(OFFLINE_LEASE_STORAGE_KEY, JSON.stringify(tampered));
const tamperedState = await offlineProvider.initialize({ online: false });
assert.equal(tamperedState.authenticated, false);
assert.equal(storage.getItem(OFFLINE_LEASE_STORAGE_KEY), null);

// Re-establish an online lease, then logout must clear it.
await provider.initialize({ online: true });
assert.ok(storage.getItem(OFFLINE_LEASE_STORAGE_KEY));
const loggedOut = await provider.logout();
assert.equal(loggedOut.authenticated, false);
assert.equal(storage.getItem(OFFLINE_LEASE_STORAGE_KEY), null);
assert.equal(onlineCalls.at(-1).options.method, 'POST');
assert.equal(onlineCalls.at(-1).options.headers['X-CSRF-Token'], 'csrf-synthetic');

console.log('Auth provider + signed offline lease tests: PASS');

// Logout must never claim success if the server did not confirm cookie invalidation.
const failedLogoutStorage = new StorageStub();
const failedLogoutProvider = createSchoolServerAuthProvider(config, {
  storage: failedLogoutStorage, cryptoImpl: webcrypto,
  locationLike: { href: 'https://school.example/apps/maturita-desk/' }, now: () => nowMs,
  fetchImpl: async (url, options) => {
    if (options.method === 'POST') return new Response(JSON.stringify({ error: 'synthetic' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    const id = options.headers['X-Maturita-Desk-Installation'];
    return new Response(JSON.stringify({
      schema: 'maturita-desk-auth-session-v1', authenticated: true,
      capabilities: ['exam'], expiresAt: '2030-05-31T18:00:00.000Z', csrfToken: 'csrf-synthetic',
      offlineLease: await signLease(id)
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
});
await failedLogoutProvider.initialize({ online: true });
const unconfirmed = await failedLogoutProvider.logout();
assert.equal(unconfirmed.authenticated, false);
assert.equal(unconfirmed.status, 'logout-unconfirmed');
assert.match(unconfirmed.error, /nepotvrdil odhlášení/i);
assert.equal(failedLogoutStorage.getItem(OFFLINE_LEASE_STORAGE_KEY), null);

console.log('Logout confirmation negative control: PASS');

// Stage 12R B-03 negative control: a school auth provider cannot exist without a logout endpoint.
const missingLogoutProvider = createSchoolServerAuthProvider({
  sessionEndpoint: 'https://school.example/session',
  loginUrl: 'https://school.example/login',
  logoutEndpoint: '',
  offlineLease: { enabled: false }
}, { fetchImpl: fetchOnline, storage: new StorageStub(), cryptoImpl: webcrypto, locationLike: { href: 'https://school.example/app/' } });
assert.equal(missingLogoutProvider, null);
console.log('Missing logout endpoint fail-closed control: PASS');
