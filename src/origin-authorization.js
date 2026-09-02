export const ORIGIN_AUTH_SCHEMA = 'maturita-desk-origin-authorization-v1';
export const ORIGIN_AUTH_VERSION = 1;
export const ORIGIN_AUTH_ALGORITHM = 'ECDSA-P256-SHA256';
export const ORIGIN_AUTH_MAX_BYTES = 16 * 1024;

export function originAuthorizationPayload(value) {
  const parsed = normalizeOriginAuthorization(value);
  return [
    'MATURITA-DESK-ORIGIN-AUTH-V1',
    parsed.environmentId,
    parsed.origin,
    parsed.permissions.app ? 'app=1' : 'app=0',
    parsed.permissions.confidentialContent ? 'confidential=1' : 'confidential=0',
    parsed.keyId
  ].join('\n');
}

export function originAuthorizationPayloadBytes(value) {
  return new TextEncoder().encode(originAuthorizationPayload(value));
}

export function normalizeOriginAuthorization(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('origin-authorization-invalid');
  if (value.schema !== ORIGIN_AUTH_SCHEMA || Number(value.version) !== ORIGIN_AUTH_VERSION) throw new Error('origin-authorization-schema');
  const origin = normalizeHttpsOrigin(value.origin);
  if (!origin) throw new Error('origin-authorization-origin');
  const environmentId = safeToken(value.environmentId);
  const keyId = safeToken(value.keyId);
  if (!environmentId || !keyId) throw new Error('origin-authorization-metadata');
  if (value.algorithm !== ORIGIN_AUTH_ALGORITHM) throw new Error('origin-authorization-algorithm');
  const signature = String(value.signature || '').trim();
  if (!/^[A-Za-z0-9_-]{40,256}$/.test(signature)) throw new Error('origin-authorization-signature');
  return Object.freeze({
    schema: ORIGIN_AUTH_SCHEMA,
    version: ORIGIN_AUTH_VERSION,
    environmentId,
    origin,
    permissions: Object.freeze({
      app: value.permissions?.app === true,
      confidentialContent: value.permissions?.confidentialContent === true
    }),
    keyId,
    algorithm: ORIGIN_AUTH_ALGORITHM,
    signature
  });
}

export async function verifyOriginAuthorization(value, {
  publicKeys = {},
  allowedKeyIds = [],
  expectedEnvironmentId = '',
  locationLike = globalThis.location,
  cryptoImpl = globalThis.crypto
} = {}) {
  const parsed = normalizeOriginAuthorization(value);
  const currentOrigin = locationOrigin(locationLike);
  if (!currentOrigin || parsed.origin !== currentOrigin) throw new Error('origin-authorization-origin-mismatch');
  if (expectedEnvironmentId && parsed.environmentId !== expectedEnvironmentId) throw new Error('origin-authorization-environment-mismatch');
  if (!parsed.permissions.app) throw new Error('origin-authorization-app-not-granted');
  if (Array.isArray(allowedKeyIds) && allowedKeyIds.length && !allowedKeyIds.includes(parsed.keyId)) throw new Error('origin-authorization-key-not-allowed');
  const jwk = publicKeys?.[parsed.keyId];
  if (!isVerifyP256Jwk(jwk)) throw new Error('origin-authorization-key-missing');
  if (!cryptoImpl?.subtle) throw new Error('origin-authorization-crypto-unavailable');
  let key;
  try {
    key = await cryptoImpl.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  } catch {
    throw new Error('origin-authorization-key-invalid');
  }
  let signatureBytes;
  try { signatureBytes = fromBase64Url(parsed.signature); }
  catch { throw new Error('origin-authorization-signature-invalid'); }
  const verified = await cryptoImpl.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    signatureBytes,
    originAuthorizationPayloadBytes(parsed)
  );
  if (!verified) throw new Error('origin-authorization-signature-invalid');
  return Object.freeze({
    authorized: true,
    origin: parsed.origin,
    confidentialContent: parsed.permissions.confidentialContent === true,
    keyId: parsed.keyId
  });
}

export function toBase64Url(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  if (typeof Buffer !== 'undefined') return Buffer.from(view).toString('base64url');
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function fromBase64Url(value) {
  const text = String(value || '');
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error('invalid-base64url');
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(text, 'base64url'));
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}

function normalizeHttpsOrigin(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:') return '';
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return '';
    return url.origin;
  } catch { return ''; }
}

function locationOrigin(locationLike) {
  try { return new URL(String(locationLike?.href || '')).origin; }
  catch { return ''; }
}

function isVerifyP256Jwk(value) {
  return Boolean(value && typeof value === 'object' && value.kty === 'EC' && value.crv === 'P-256' && typeof value.x === 'string' && typeof value.y === 'string' && !('d' in value));
}

function safeToken(value) {
  const text = String(value || '').trim();
  return /^[A-Za-z0-9._:-]{1,160}$/.test(text) ? text : '';
}
