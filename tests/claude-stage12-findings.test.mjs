import assert from 'node:assert/strict';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
import { createHttpFactCheckProvider } from '../src/fact-check.js';
import { readRuntimeConfig, loadRuntimeConfig } from '../src/providers/runtime.js';
import { createSchoolServerAuthProvider } from '../src/providers/auth-provider.js';
import { validateTopicCollection } from '../src/content-validator.js';
import { MAX_ENVELOPE_BYTES } from '../src/content-pack.js';
import { TOPICS } from '../src/demo-content.js';
import { handleFactCheckRequest } from '../serverless/fact-check-worker.mjs';

const locationLike = { href: 'https://school.example/apps/maturita-desk/' };

// B-02: a body without Content-Length and without a readable stream must fail closed
// without materializing response.text().
let textCalls = 0;
const fact = createHttpFactCheckProvider({
  endpoint: 'https://fact.example/check',
  fetchImpl: async () => ({
    ok: true, status: 200, headers: { get() { return null; } }, body: null,
    async text() { textCalls++; return JSON.stringify({ pad: 'A'.repeat(8 * 1024 * 1024) }); }
  })
});
await assert.rejects(() => fact.check('Synthetic fact'), error => error?.code === 'INVALID_RESPONSE');
assert.equal(textCalls, 0);

// B-03: missing logout endpoint is invalid both at runtime-config and provider construction.
const noLogoutRuntime = readRuntimeConfig({
  schema:'maturita-desk-runtime-v1', version:1, environmentId:'school', mode:'school-server', serverBaseUrl:'/api/', allowedOrigins:['self'],
  auth:{ provider:'school-server-session', sessionEndpoint:'session', loginUrl:'/login', logoutEndpoint:'' },
  content:{ provider:'school-server-encrypted-pack', activePackEndpoint:'content' }, factCheck:{ provider:'school-server', endpoint:'fact' }
}, locationLike);
assert.equal(noLogoutRuntime.mode, 'locked');
assert.equal(createSchoolServerAuthProvider({ sessionEndpoint:'https://school.example/session', loginUrl:'https://school.example/login', logoutEndpoint:'' }, {
  fetchImpl: async()=>{}, storage:{getItem(){return null;},setItem(){},removeItem(){}}, cryptoImpl:webcrypto, locationLike
}), null);

// N-01: actual public baked profile copied to a school origin cannot silently fall back to local permissions.
delete globalThis.MATURITA_DESK_RUNTIME;
await import(`../runtime-config.js?claude=${Date.now()}`);
const publicBaked = globalThis.MATURITA_DESK_RUNTIME;
const staleCopy = await loadRuntimeConfig({ baked: publicBaked, locationLike, fetchImpl: async () => { throw new Error('network down'); } });
assert.equal(staleCopy.mode, 'locked');
assert.equal(staleCopy.configurationError, 'deployment-origin-mismatch');

// N-02: hostile network-style config cannot self-authorize its own foreign origin.
const hostile = readRuntimeConfig({
  schema:'maturita-desk-runtime-v1', version:1, environmentId:'school', mode:'school-server',
  serverBaseUrl:'https://attacker.example/', allowedOrigins:['https://attacker.example'],
  auth:{provider:'school-server-session',sessionEndpoint:'https://attacker.example/session',loginUrl:'https://attacker.example/login',logoutEndpoint:'https://attacker.example/logout'},
  content:{provider:'school-server-encrypted-pack',activePackEndpoint:'https://attacker.example/content'},
  factCheck:{provider:'school-server',endpoint:'https://attacker.example/fact'}
}, locationLike);
assert.equal(hostile.mode, 'locked');

// N-03: forged Origin is insufficient; the server-side gate is required before upstream use.
let upstreamCalls = 0;
const gateEnv = {
  OPENAI_API_KEY:'synthetic', ALLOWED_ORIGINS:'https://school.example',
  FACTCHECK_GATE_TOKEN:'synthetic-gate-token-32-characters-minimum-claude',
  FACTCHECK_RATE_LIMITER:{ async limit(){ return {success:true}; } }
};
const forgedOrigin = new Request('https://worker.example/fact-check', {
  method:'POST', headers:{Origin:'https://school.example','Content-Type':'application/json'}, body:JSON.stringify({query:'Synthetic'})
});
const forgedResult = await handleFactCheckRequest(forgedOrigin, gateEnv, async()=>{ upstreamCalls++; return new Response('{}'); });
assert.equal(forgedResult.status, 401);
assert.equal(upstreamCalls, 0);

// N-05: mobile-facing envelope ceiling is bounded to 32 MiB, not the old 120 MiB.
assert.equal(MAX_ENVELOPE_BYTES, 32 * 1024 * 1024);

// N-06: string IDs such as "01" are no longer accepted.
const stringIdTopics = structuredClone(TOPICS);
stringIdTopics[0].id = '01';
assert.equal(validateTopicCollection(stringIdTopics).ok, false);

// N-08: arbitrary offline deep routes must not be replaced with the app shell.
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
assert.match(sw, /canonicalEntry = relative === '\.\/' \|\| relative === '\.\/index\.html'/);
assert.match(sw, /tato offline cesta není dostupná/);

console.log('Claude Stage 12 finding regressions: PASS');
