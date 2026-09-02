import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
import {
  ORIGIN_AUTH_ALGORITHM,
  ORIGIN_AUTH_SCHEMA,
  ORIGIN_AUTH_VERSION,
  originAuthorizationPayloadBytes,
  toBase64Url
} from '../src/origin-authorization.js';

const args = process.argv.slice(2);
const origin = argValue('--origin');
const keyPath = argValue('--private-key');
const outputPath = argValue('--out') || 'config/origin-authorization.json';
const environmentId = argValue('--environment') || 'serverless-production';
const keyId = argValue('--key-id') || 'ghrab-maturita-content-2026-01';
const confidentialContent = !args.includes('--no-confidential');

if (!origin || !keyPath) usage();
const normalizedOrigin = normalizeOrigin(origin);
if (!normalizedOrigin) throw new Error('Origin must be an exact HTTPS origin with no path, query or fragment.');
const privateJwk = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
if (!isPrivateP256Jwk(privateJwk)) throw new Error('Private key must be an ECDSA P-256 JWK.');

const unsigned = {
  schema: ORIGIN_AUTH_SCHEMA,
  version: ORIGIN_AUTH_VERSION,
  environmentId,
  origin: normalizedOrigin,
  permissions: { app: true, confidentialContent },
  keyId,
  algorithm: ORIGIN_AUTH_ALGORITHM,
  signature: 'PLACEHOLDER_SIGNATURE_0000000000000000000000000000'
};

const key = await webcrypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
const signature = new Uint8Array(await webcrypto.subtle.sign(
  { name: 'ECDSA', hash: 'SHA-256' },
  key,
  originAuthorizationPayloadBytes(unsigned)
));
const output = { ...unsigned, signature: toBase64Url(signature) };
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n', { mode: 0o644 });
console.log(`Signed origin authorization written to ${outputPath}`);
console.log(`Origin: ${normalizedOrigin}`);
console.log(`Confidential content: ${confidentialContent ? 'allowed' : 'blocked'}`);

function argValue(name) {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : '';
}

function normalizeOrigin(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return '';
    return url.origin;
  } catch { return ''; }
}

function isPrivateP256Jwk(value) {
  return Boolean(value && typeof value === 'object' && value.kty === 'EC' && value.crv === 'P-256' && typeof value.x === 'string' && typeof value.y === 'string' && typeof value.d === 'string');
}

function usage() {
  console.error('Usage: node tools/sign-origin-authorization.mjs --origin https://app.example --private-key /secure/path/key.private.jwk [--out config/origin-authorization.json]');
  process.exit(2);
}
