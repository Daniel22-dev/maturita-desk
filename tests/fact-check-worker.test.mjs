import assert from 'node:assert/strict';
import { handleFactCheckRequest } from '../serverless/fact-check-worker.mjs';

const origin = 'https://teacher.example';
const gate = 'synthetic-gate-token-32-characters-minimum-0001';
const limiter = { async limit() { return { success: true }; } };
const env = {
  OPENAI_API_KEY: 'test-secret-not-real',
  OPENAI_FACTCHECK_MODEL: 'gpt-5.6-terra',
  ALLOWED_ORIGINS: origin,
  FACTCHECK_GATE_TOKEN: gate,
  FACTCHECK_RATE_LIMITER: limiter
};

function req(method, body, requestOrigin = origin, path = '/fact-check', presentedGate = gate) {
  return new Request(`https://worker.example${path}`, {
    method,
    headers: {
      ...(requestOrigin ? { Origin: requestOrigin } : {}),
      ...(presentedGate ? { 'X-Maturita-Desk-Gate': presentedGate } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
}

let capturedUpstream = null;
const mockOpenAI = async (url, options) => {
  capturedUpstream = { url, options, body: JSON.parse(options.body) };
  return new Response(JSON.stringify({
    output_text: JSON.stringify({
      verdict: 'inaccurate', confidence: 'high',
      answer: 'Sydney není hlavním městem Austrálie; hlavním městem je Canberra.'
    }),
    output: [{ type: 'web_search_call', status: 'completed', action: { sources: [
      { title: 'Australian Government', url: 'https://www.australia.gov.au/example' },
      { title: 'Duplicate', url: 'https://www.australia.gov.au/example' },
      { title: 'Insecure transport', url: 'http://example.org/unsafe' }
    ] } }]
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const response = await handleFactCheckRequest(req('POST', { query: 'Student tvrdí, že Sydney je hlavní město Austrálie.' }), env, mockOpenAI);
assert.equal(response.status, 200);
assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
assert.equal(response.headers.get('Cache-Control'), 'no-store');
const data = await response.json();
assert.equal(data.schema, 'maturita-desk-fact-check-v1');
assert.equal(data.verdict, 'inaccurate');
assert.equal(data.sources.length, 1, 'HTTP sources must be rejected; only HTTPS is returned');
assert.equal(capturedUpstream.url, 'https://api.openai.com/v1/responses');
assert.equal(capturedUpstream.body.model, 'gpt-5.6-terra');
assert.equal(capturedUpstream.body.store, false);
assert.equal(capturedUpstream.body.tool_choice, 'required');
assert.equal(capturedUpstream.body.tools[0].type, 'web_search');
assert.deepEqual(capturedUpstream.body.include, ['web_search_call.action.sources']);
assert.equal(capturedUpstream.body.input, 'Student tvrdí, že Sydney je hlavní město Austrálie.');
assert.equal('topic' in capturedUpstream.body, false);
assert.equal('notes' in capturedUpstream.body, false);
assert.equal('session' in capturedUpstream.body, false);

const extraField = await handleFactCheckRequest(req('POST', { query: 'A', topic: 'SECRET' }), env, mockOpenAI);
assert.equal(extraField.status, 400);
assert.equal((await extraField.json()).code, 'INVALID_QUERY');

const disallowed = await handleFactCheckRequest(req('POST', { query: 'A fact' }, 'https://student.example'), env, mockOpenAI);
assert.equal(disallowed.status, 403);
assert.equal(disallowed.headers.get('Access-Control-Allow-Origin'), null);

const missingGate = await handleFactCheckRequest(req('POST', { query: 'A fact' }, origin, '/fact-check', ''), env, mockOpenAI);
assert.equal(missingGate.status, 401);
assert.equal((await missingGate.json()).code, 'AUTH_REQUIRED');
const wrongGate = await handleFactCheckRequest(req('POST', { query: 'A fact' }, origin, '/fact-check', 'wrong-token-that-is-long-enough-but-invalid'), env, mockOpenAI);
assert.equal(wrongGate.status, 401);

const noSecret = await handleFactCheckRequest(req('POST', { query: 'A fact' }), { ...env, OPENAI_API_KEY: undefined }, mockOpenAI);
assert.equal(noSecret.status, 503);
assert.ok(!JSON.stringify(await noSecret.json()).includes('secret'));

// A deployment with an API key but no rate limiter or no server-side gate is NOT configured.
const noLimiter = await handleFactCheckRequest(req('POST', { query: 'A fact' }), { ...env, FACTCHECK_RATE_LIMITER: undefined }, mockOpenAI);
assert.equal(noLimiter.status, 503);
assert.equal((await noLimiter.json()).code, 'NOT_CONFIGURED');
const noGateConfig = await handleFactCheckRequest(req('POST', { query: 'A fact' }), { ...env, FACTCHECK_GATE_TOKEN: undefined }, mockOpenAI);
assert.equal(noGateConfig.status, 503);
assert.equal((await noGateConfig.json()).code, 'NOT_CONFIGURED');

const brokenLimiter = await handleFactCheckRequest(req('POST', { query: 'A fact' }), { ...env, FACTCHECK_RATE_LIMITER: { async limit() { throw new Error('broken'); } } }, mockOpenAI);
assert.equal(brokenLimiter.status, 429);

const noSourceUpstream = async () => new Response(JSON.stringify({
  output_text: JSON.stringify({ verdict: 'confirmed', confidence: 'high', answer: 'Claimed answer.' }),
  output: [{ type: 'web_search_call', status: 'completed', action: { sources: [] } }]
}), { status: 200, headers: { 'Content-Type': 'application/json' } });
const noSource = await handleFactCheckRequest(req('POST', { query: 'A fact' }), env, noSourceUpstream);
const noSourceData = await noSource.json();
assert.equal(noSourceData.verdict, 'not_verifiable');
assert.equal(noSourceData.confidence, 'low');

const upstreamError = await handleFactCheckRequest(req('POST', { query: 'A fact' }), env, async () => new Response('SUPER SECRET RAW ERROR', { status: 500 }));
assert.equal(upstreamError.status, 502);
assert.ok(!JSON.stringify(await upstreamError.json()).includes('SUPER SECRET'));

const health = await handleFactCheckRequest(req('GET', undefined, origin, '/health'), env, mockOpenAI);
assert.equal(health.status, 200);
const healthData = await health.json();
assert.deepEqual(healthData, { ok: true, service: 'maturita-desk-fact-check' });
const healthWrongOrigin = await handleFactCheckRequest(req('GET', undefined, 'https://attacker.example', '/health'), env, mockOpenAI);
assert.equal(healthWrongOrigin.status, 403);
const healthNoGate = await handleFactCheckRequest(req('GET', undefined, origin, '/health', ''), env, mockOpenAI);
assert.equal(healthNoGate.status, 401);

const preflight = await handleFactCheckRequest(new Request('https://worker.example/fact-check', { method: 'OPTIONS', headers: { Origin: origin } }), env, mockOpenAI);
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
assert.match(preflight.headers.get('Access-Control-Allow-Headers') || '', /X-Maturita-Desk-Gate/);

// Chunked upstream responses are capped while streaming; the worker must not read the full body.
let produced = 0;
const hugeUpstream = async () => new Response(new ReadableStream({
  pull(controller) {
    const chunk = new Uint8Array(64 * 1024);
    produced += chunk.byteLength;
    controller.enqueue(chunk);
    if (produced >= 8 * 1024 * 1024) controller.close();
  }
}), { status: 200, headers: { 'Content-Type': 'application/json' } });
const tooLarge = await handleFactCheckRequest(req('POST', { query: 'A fact' }), env, hugeUpstream);
assert.equal(tooLarge.status, 502);
assert.equal((await tooLarge.json()).code, 'UPSTREAM_INVALID');
assert.ok(produced <= 640 * 1024, `stream cap should abort close to 512 KiB, produced ${produced}`);

console.log('Fact Check worker anti-abuse/privacy tests: PASS');
