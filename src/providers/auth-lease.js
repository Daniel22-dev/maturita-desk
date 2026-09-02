export const OFFLINE_LEASE_SCHEMA = 'maturita-desk-offline-auth-lease-v1';
export const SIGNED_LEASE_SCHEMA = 'maturita-desk-signed-auth-lease-v1';
export const OFFLINE_LEASE_STORAGE_KEY = 'ghrab.maturita-desk.auth-lease.v1';
export const INSTALLATION_ID_STORAGE_KEY = 'ghrab.maturita-desk.installation-id.v1';
export const MAX_OFFLINE_LEASE_HOURS = 24;

export function getOrCreateInstallationId(storage = globalThis.localStorage, cryptoImpl = globalThis.crypto) {
  let existing = '';
  try { existing = String(storage?.getItem?.(INSTALLATION_ID_STORAGE_KEY) || ''); } catch {}
  if (/^[A-Za-z0-9._:-]{8,160}$/.test(existing)) return existing;
  const generated = `mdi-${secureInstallationToken(cryptoImpl)}`;
  try { storage?.setItem?.(INSTALLATION_ID_STORAGE_KEY, generated); } catch {}
  return generated;
}

export function saveSignedLease(envelope, storage = globalThis.localStorage) {
  validateSignedLeaseShape(envelope);
  storage?.setItem?.(OFFLINE_LEASE_STORAGE_KEY, JSON.stringify(envelope));
}

export function loadSignedLease(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(OFFLINE_LEASE_STORAGE_KEY);
    if (!raw) return null;
    return validateSignedLeaseShape(JSON.parse(raw));
  } catch { return null; }
}

export function clearSignedLease(storage = globalThis.localStorage) {
  try { storage?.removeItem?.(OFFLINE_LEASE_STORAGE_KEY); } catch {}
}

export async function verifySignedLease(envelope, {
  publicKeys = {},
  installationId,
  now = Date.now(),
  maxHours = 24,
  cryptoImpl = globalThis.crypto
} = {}) {
  const value = validateSignedLeaseShape(envelope);
  const rawPayload = value.payload;
  const payload = validateLeasePayload(rawPayload, { installationId, now, maxHours });
  const jwk = publicKeys?.[value.keyId];
  if (!jwk) throw new Error('Offline oprávnění používá neznámý podpisový klíč.');
  if (!cryptoImpl?.subtle) throw new Error('Web Crypto není dostupné pro ověření offline oprávnění.');
  const key = await cryptoImpl.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const signature = base64UrlToBytes(value.signature);
  const data = new TextEncoder().encode(canonicalJson(rawPayload));
  const ok = await cryptoImpl.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, data);
  if (!ok) throw new Error('Podpis offline oprávnění není platný.');
  return Object.freeze({ ...payload, capabilities: Object.freeze([...payload.capabilities]) });
}

export function validateSignedLeaseShape(value) {
  if (!value || typeof value !== 'object') throw new Error('Offline oprávnění má neplatný formát.');
  if (value.schema !== SIGNED_LEASE_SCHEMA) throw new Error('Nepodporované schéma offline oprávnění.');
  if (value.algorithm !== 'ECDSA-P256-SHA256') throw new Error('Nepodporovaný algoritmus offline oprávnění.');
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(String(value.keyId || ''))) throw new Error('Offline oprávnění nemá platný keyId.');
  if (!/^[A-Za-z0-9_-]{40,200}$/.test(String(value.signature || ''))) throw new Error('Offline oprávnění nemá platný podpis.');
  if (!value.payload || typeof value.payload !== 'object') throw new Error('Offline oprávnění neobsahuje payload.');
  return value;
}

export function validateLeasePayload(payload, { installationId, now = Date.now(), maxHours = 24 } = {}) {
  if (payload.schema !== OFFLINE_LEASE_SCHEMA || payload.appId !== 'maturita-desk') throw new Error('Offline oprávnění není určeno pro Maturita Desk.');
  if (String(payload.installationId || '') !== String(installationId || '')) throw new Error('Offline oprávnění patří jiné instalaci.');
  const issuedAt = Date.parse(payload.issuedAt || '');
  const expiresAt = Date.parse(payload.expiresAt || '');
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt) throw new Error('Offline oprávnění má neplatnou platnost.');
  const policyHours = Math.min(MAX_OFFLINE_LEASE_HOURS, Math.max(1, Number(maxHours || MAX_OFFLINE_LEASE_HOURS)));
  const maxMs = policyHours * 3600000;
  if (expiresAt - issuedAt > maxMs + 60000) throw new Error('Offline oprávnění má delší platnost, než klient dovoluje.');
  if (issuedAt > now + 5 * 60000) throw new Error('Offline oprávnění bylo vydáno v budoucnosti.');
  if (expiresAt <= now) throw new Error('Offline oprávnění vypršelo.');
  const capabilities = normalizeCapabilities(payload.capabilities);
  if (!capabilities.length) throw new Error('Offline oprávnění neobsahuje žádné schopnosti.');
  return {
    schema: OFFLINE_LEASE_SCHEMA,
    appId: 'maturita-desk',
    installationId: String(payload.installationId),
    subject: safeOpaqueSubject(payload.subject),
    issuedAt: new Date(issuedAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    capabilities
  };
}

export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function bytesToBase64Url(bytes) {
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToBytes(value) {
  const text = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = text + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('binary');
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function normalizeCapabilities(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item || '').trim()).filter(item => /^[a-z][a-z0-9:._-]{1,80}$/.test(item)))].sort();
}

function safeOpaqueSubject(value) {
  const text = String(value || '').trim();
  return /^[A-Za-z0-9._:-]{1,160}$/.test(text) ? text : 'teacher';
}


function secureInstallationToken(cryptoImpl) {
  if (typeof cryptoImpl?.randomUUID === 'function') return cryptoImpl.randomUUID();
  if (typeof cryptoImpl?.getRandomValues !== 'function') throw new Error('Bez kryptograficky bezpečného generátoru nelze vytvořit identifikátor instalace.');
  const bytes = new Uint8Array(16);
  cryptoImpl.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
