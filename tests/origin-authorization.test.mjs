import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  ORIGIN_AUTH_ALGORITHM,
  ORIGIN_AUTH_SCHEMA,
  ORIGIN_AUTH_VERSION,
  originAuthorizationPayloadBytes,
  toBase64Url,
  verifyOriginAuthorization
} from '../src/origin-authorization.js';
import { loadRuntimeConfig } from '../src/providers/runtime.js';

const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const privateJwk = await webcrypto.subtle.exportKey('jwk', pair.privateKey);
const publicJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
delete publicJwk.d;
const keyId = 'test-origin-key';
const productionOrigin = 'https://maturita-desk.example';

const grant = await signedGrant({ origin: productionOrigin, confidentialContent: true });
const verified = await verifyOriginAuthorization(grant, {
  publicKeys: { [keyId]: publicJwk },
  allowedKeyIds: [keyId],
  expectedEnvironmentId: 'serverless-production',
  locationLike: { href: `${productionOrigin}/` },
  cryptoImpl: webcrypto
});
assert.equal(verified.authorized, true);
assert.equal(verified.confidentialContent, true);

await assert.rejects(() => verifyOriginAuthorization({ ...grant, origin: 'https://evil.example' }, {
  publicKeys: { [keyId]: publicJwk }, allowedKeyIds: [keyId], expectedEnvironmentId: 'serverless-production',
  locationLike: { href: `${productionOrigin}/` }, cryptoImpl: webcrypto
}), /origin-authorization-origin-mismatch/);

await assert.rejects(() => verifyOriginAuthorization({ ...grant, signature: `${grant.signature[0] === 'A' ? 'B' : 'A'}${grant.signature.slice(1)}` }, {
  publicKeys: { [keyId]: publicJwk }, allowedKeyIds: [keyId], expectedEnvironmentId: 'serverless-production',
  locationLike: { href: `${productionOrigin}/` }, cryptoImpl: webcrypto
}), /origin-authorization-signature-invalid/);

const baked = {
  schema: 'maturita-desk-runtime-v1', version: 1, environmentId: 'serverless-production', mode: 'standalone-local',
  serverBaseUrl: '', allowedOrigins: ['self'],
  trust: {
    expectedMode: 'standalone-local', expectedEnvironmentId: 'serverless-production',
    appOrigins: ['https://daniel22-dev.github.io'], confidentialContentOrigins: [], allowLocalhostConfidential: true,
    originAuthorization: { enabled: true, keyIds: [keyId] }
  },
  auth: { provider: 'local-device', offlineLease: { enabled: false, publicKeys: {} } },
  content: { provider: 'encrypted-local', allowManualImport: true, requirePublisherSignatureFor: ['CONFIDENTIAL-EXAM'], publisherKeys: { [keyId]: publicJwk } },
  factCheck: { provider: 'isolated-http', endpoint: '', timeoutMs: 18000 }
};
const deployment = structuredClone(baked);
const fetchImpl = async url => {
  if (String(url).endsWith('/config/origin-authorization.json')) return jsonResponse(grant);
  if (String(url).endsWith('/config/deployment.json')) return jsonResponse(deployment);
  return new Response('', { status: 404 });
};
const runtime = await loadRuntimeConfig({ baked, fetchImpl, locationLike: { href: `${productionOrigin}/` }, timeoutMs: 1000 });
assert.equal(runtime.mode, 'standalone-local');
assert.equal(runtime.content.confidentialAllowed, true);
assert.equal(runtime.configurationSource, 'network');

const publicRuntime = await loadRuntimeConfig({ baked, fetchImpl: async url => {
  if (String(url).endsWith('/config/deployment.json')) return jsonResponse(deployment);
  return new Response('', { status: 404 });
}, locationLike: { href: 'https://daniel22-dev.github.io/maturita-desk/' }, timeoutMs: 1000 });
assert.equal(publicRuntime.mode, 'standalone-local');
assert.equal(publicRuntime.content.confidentialAllowed, false);

const badFetch = async url => {
  if (String(url).endsWith('/config/origin-authorization.json')) return jsonResponse({ ...grant, signature: `${grant.signature[0] === 'A' ? 'B' : 'A'}${grant.signature.slice(1)}` });
  if (String(url).endsWith('/config/deployment.json')) return jsonResponse(deployment);
  return new Response('', { status: 404 });
};
const locked = await loadRuntimeConfig({ baked, fetchImpl: badFetch, locationLike: { href: `${productionOrigin}/` }, timeoutMs: 1000 });
assert.equal(locked.mode, 'locked');
assert.equal(locked.configurationSource, 'origin-lock');
assert.match(locked.configurationLoadError, /origin-authorization/);

console.log('Signed origin authorization tests: PASS');

async function signedGrant({ origin, confidentialContent }) {
  const value = {
    schema: ORIGIN_AUTH_SCHEMA,
    version: ORIGIN_AUTH_VERSION,
    environmentId: 'serverless-production',
    origin,
    permissions: { app: true, confidentialContent },
    keyId,
    algorithm: ORIGIN_AUTH_ALGORITHM,
    signature: 'PLACEHOLDER_SIGNATURE_0000000000000000000000000000'
  };
  const signature = new Uint8Array(await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    pair.privateKey,
    originAuthorizationPayloadBytes(value)
  ));
  return { ...value, signature: toBase64Url(signature) };
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
