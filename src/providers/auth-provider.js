import { readTextLimited } from '../net/read-limited.js';
import {
  clearSignedLease,
  getOrCreateInstallationId,
  loadSignedLease,
  saveSignedLease,
  verifySignedLease
} from './auth-lease.js';

export const AUTH_SESSION_SCHEMA = 'maturita-desk-auth-session-v1';
export const LOCAL_CAPABILITIES = Object.freeze(['exam', 'practice', 'review', 'content:local', 'fact-check']);
const MAX_AUTH_RESPONSE_BYTES = 128 * 1024;

export function createLocalDeviceAuthProvider() {
  const snapshot = Object.freeze({
    provider: 'local-device',
    status: 'local',
    authenticated: true,
    authoritative: false,
    source: 'local-device',
    capabilities: LOCAL_CAPABILITIES,
    displayName: '',
    expiresAt: '',
    csrfToken: '',
    error: ''
  });
  return Object.freeze({
    kind: 'local-device',
    async initialize() { return snapshot; },
    async refresh() { return snapshot; },
    async logout() { return snapshot; },
    loginUrl() { return ''; }
  });
}


export function createLockedAuthProvider(reason = 'Runtime konfigurace je uzamčená.') {
  const snapshot = Object.freeze({
    provider: 'locked', status: 'configuration-locked', authenticated: false,
    authoritative: true, source: 'configuration', capabilities: Object.freeze([]),
    displayName: '', expiresAt: '', csrfToken: '', error: String(reason || 'Runtime konfigurace je uzamčená.')
  });
  return Object.freeze({
    kind: 'locked',
    async initialize() { return snapshot; },
    async refresh() { return snapshot; },
    async logout() { return snapshot; },
    loginUrl() { return ''; },
    getSnapshot() { return snapshot; }
  });
}

export function createSchoolServerAuthProvider(config, {
  fetchImpl = globalThis.fetch,
  storage = globalThis.localStorage,
  cryptoImpl = globalThis.crypto,
  locationLike = globalThis.location,
  now = () => Date.now()
} = {}) {
  if (!config?.sessionEndpoint || !config?.loginUrl || !config?.logoutEndpoint || typeof fetchImpl !== 'function') return null;
  const installationId = getOrCreateInstallationId(storage, cryptoImpl);
  let current = unauthenticated('checking');

  async function initialize({ online = true } = {}) {
    if (online) {
      try {
        current = await readOnlineSession();
        return current;
      } catch (error) {
        const offline = await readOfflineLease(error);
        current = offline || unavailable(error);
        return current;
      }
    }
    const offline = await readOfflineLease(new Error('Zařízení je offline.'));
    current = offline || unauthenticated('offline', 'Bez platného offline oprávnění se po novém spuštění nelze ověřit.');
    return current;
  }

  async function readOnlineSession() {
    const response = await fetchImpl(config.sessionEndpoint, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      headers: { 'Accept': 'application/json', 'X-Maturita-Desk-Client': 'auth-v1', 'X-Maturita-Desk-Installation': installationId }
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        clearSignedLease(storage);
        return unauthenticated('signed-out', 'Školní relace není přihlášená.');
      }
      throw new Error(`Školní session endpoint skončil stavem ${response.status}.`);
    }
    const data = await readJsonLimited(response, MAX_AUTH_RESPONSE_BYTES, 'Školní session odpověď je neplatná nebo příliš velká.');
    const normalized = normalizeServerSession(data);
    if (!normalized.authenticated) {
      clearSignedLease(storage);
      return normalized;
    }
    if (config.offlineLease?.enabled && data.offlineLease) {
      const verified = await verifySignedLease(data.offlineLease, {
        publicKeys: config.offlineLease.publicKeys,
        installationId,
        maxHours: config.offlineLease.maxHours,
        now: now(),
        cryptoImpl
      });
      if (!verified.capabilities.every(capability => normalized.capabilities.includes(capability))) {
        throw new Error('Offline oprávnění neodpovídá schopnostem aktuální školní relace.');
      }
      saveSignedLease(data.offlineLease, storage);
    }
    return normalized;
  }

  async function readOfflineLease(cause) {
    if (!config.offlineLease?.enabled) return null;
    const stored = loadSignedLease(storage);
    if (!stored) return null;
    try {
      const verified = await verifySignedLease(stored, {
        publicKeys: config.offlineLease.publicKeys,
        installationId,
        maxHours: config.offlineLease.maxHours,
        now: now(),
        cryptoImpl
      });
      return Object.freeze({
        provider: 'school-server-session',
        status: 'offline-lease',
        authenticated: true,
        authoritative: true,
        source: 'offline-lease',
        capabilities: Object.freeze([...verified.capabilities]),
        displayName: '',
        expiresAt: verified.expiresAt,
        csrfToken: '',
        error: cause?.message || ''
      });
    } catch {
      clearSignedLease(storage);
      return null;
    }
  }

  async function logout() {
    const csrf = current.csrfToken || '';
    let confirmed = false;
    let failure = '';
    try {
      {
        const response = await fetchImpl(config.logoutEndpoint, {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          redirect: 'error',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
            'X-Maturita-Desk-Client': 'auth-v1'
          },
          body: '{}'
        });
        confirmed = Boolean(response?.ok);
        if (!confirmed) failure = `Server nepotvrdil odhlášení (HTTP ${response?.status || 0}).`;
      }
    } catch {
      failure = 'Server nepotvrdil odhlášení kvůli chybě spojení.';
    } finally {
      clearSignedLease(storage);
    }
    current = confirmed
      ? unauthenticated('signed-out', 'Školní relace byla potvrzeně ukončena.')
      : unauthenticated('logout-unconfirmed', `${failure} Na sdíleném zařízení aplikaci zavřete a odhlášení zopakujte online.`);
    return current;
  }

  function loginUrl() {
    try {
      const url = new URL(config.loginUrl, locationLike?.href || 'https://example.invalid/');
      const returnTo = safeReturnPath(locationLike);
      if (returnTo) url.searchParams.set('returnTo', returnTo);
      return url.href;
    } catch { return ''; }
  }

  return Object.freeze({
    kind: 'school-server-session',
    installationId,
    initialize,
    refresh: initialize,
    logout,
    loginUrl,
    getSnapshot() { return current; }
  });
}

export function hasCapability(authState, capability, now = Date.now()) {
  if (!authState?.authenticated) return false;
  if (authState.expiresAt) {
    const expiry = Date.parse(authState.expiresAt);
    if (!Number.isFinite(expiry) || expiry <= now) return false;
  }
  return Array.isArray(authState.capabilities) && authState.capabilities.includes(capability);
}

export function normalizeServerSession(value) {
  if (!value || typeof value !== 'object' || value.schema !== AUTH_SESSION_SCHEMA) throw new Error('Školní server vrátil neplatný session kontrakt.');
  if (value.authenticated !== true) return unauthenticated('signed-out', 'Školní relace není přihlášená.');
  const capabilities = normalizeCapabilities(value.capabilities);
  if (!capabilities.length) throw new Error('Školní relace neobsahuje žádná oprávnění pro Maturita Desk.');
  const expiresAt = normalizeFutureIso(value.expiresAt);
  if (!expiresAt) throw new Error('Školní relace nemá platnou expiraci.');
  return Object.freeze({
    provider: 'school-server-session',
    status: 'authenticated',
    authenticated: true,
    authoritative: true,
    source: 'server-session',
    capabilities: Object.freeze(capabilities),
    displayName: String(value.user?.displayName || '').trim().slice(0, 120),
    expiresAt,
    csrfToken: String(value.csrfToken || '').trim().slice(0, 512),
    error: ''
  });
}

function unauthenticated(status, error = '') {
  return Object.freeze({ provider: 'school-server-session', status, authenticated: false, authoritative: true, source: 'server-session', capabilities: Object.freeze([]), displayName: '', expiresAt: '', csrfToken: '', error });
}

function unavailable(error) {
  return Object.freeze({ provider: 'school-server-session', status: 'unavailable', authenticated: false, authoritative: true, source: 'server-session', capabilities: Object.freeze([]), displayName: '', expiresAt: '', csrfToken: '', error: error?.message || 'Školní server není dostupný.' });
}

function normalizeCapabilities(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item || '').trim()).filter(item => /^[a-z][a-z0-9:._-]{1,80}$/.test(item)))].sort();
}

function normalizeFutureIso(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) && time > Date.now() - 60000 ? new Date(time).toISOString() : '';
}

function safeReturnPath(locationLike) {
  try {
    const url = new URL(locationLike?.href || 'https://example.invalid/');
    // Only preserve the same-origin application path. Query/hash fragments may contain
    // transient authentication or diagnostic values and must not be reflected to an IdP.
    return String(url.pathname || '/').slice(0, 1000);
  } catch { return ''; }
}


async function readJsonLimited(response, maxBytes, errorMessage) {
  let text;
  try { text = await readTextLimited(response, maxBytes, { message: errorMessage }); }
  catch { throw new Error(errorMessage); }
  try { return JSON.parse(text); } catch { throw new Error(errorMessage); }
}
