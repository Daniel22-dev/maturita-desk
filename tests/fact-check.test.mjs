import assert from 'node:assert/strict';
import {
  FACT_CHECK_MAX_QUERY,
  createHttpFactCheckProvider,
  factCheckAvailability,
  normalizeFactCheckResult,
  readFactCheckConfig,
  sanitizeFactQuery
} from '../src/fact-check.js';

assert.equal(sanitizeFactQuery('  Sydney\n is   the capital?  '), 'Sydney is the capital?');
assert.throws(() => sanitizeFactQuery('   '), error => error?.code === 'EMPTY_QUERY');
assert.throws(() => sanitizeFactQuery('x'.repeat(FACT_CHECK_MAX_QUERY + 1)), error => error?.code === 'QUERY_TOO_LONG');

assert.deepEqual(factCheckAvailability({ online: true, endpoint: '' }), { ready: false, code: 'unconfigured', label: 'Provider není nakonfigurován' });
assert.equal(factCheckAvailability({ online: false, endpoint: 'https://fact.example/check' }).code, 'offline');
assert.equal(factCheckAvailability({ online: true, endpoint: 'https://fact.example/check' }).ready, true);

const cfg = readFactCheckConfig({ factCheck: { endpoint: 'https://fact.example/check', timeoutMs: 12000 } });
assert.equal(cfg.endpoint, 'https://fact.example/check');
assert.equal(cfg.timeoutMs, 12000);
assert.equal(readFactCheckConfig({ factCheck: { endpoint: 'javascript:alert(1)' } }).endpoint, '');

const result = normalizeFactCheckResult({
  schema: 'maturita-desk-fact-check-v1',
  verdict: 'confirmed',
  confidence: 'high',
  answer: 'Canberra is the capital of Australia.',
  checkedAt: '2026-09-01T12:00:00Z',
  model: 'synthetic-model',
  searched: true,
  sources: [
    { title: 'Government source', url: 'https://example.gov/a', publisher: 'Example Gov' },
    { title: 'Duplicate', url: 'https://example.gov/a' },
    { title: 'Unsafe', url: 'javascript:alert(1)' },
    { title: 'Insecure HTTP', url: 'http://example.org/plain' }
  ]
});
assert.equal(result.sources.length, 1);
assert.equal(result.verdict, 'confirmed');

let captured = null;
const provider = createHttpFactCheckProvider({
  endpoint: 'https://fact.example/check',
  timeoutMs: 5000,
  fetchImpl: async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      schema: 'maturita-desk-fact-check-v1',
      verdict: 'inaccurate',
      confidence: 'high',
      answer: 'Sydney is not the capital; Canberra is.',
      sources: [{ title: 'Official', url: 'https://example.gov/capital' }],
      checkedAt: '2026-09-01T12:00:00Z',
      model: 'synthetic-model',
      searched: true
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
});
const checked = await provider.check('Student says Sydney is the capital of Australia.');
assert.equal(checked.verdict, 'inaccurate');
assert.deepEqual(captured.body, { query: 'Student says Sydney is the capital of Australia.' });
assert.equal(captured.options.credentials, 'omit');
assert.equal(captured.options.cache, 'no-store');
assert.equal(captured.options.headers['X-Maturita-Desk-Client'], 'fact-check-v1');
assert.equal('topic' in captured.body, false);
assert.equal('notes' in captured.body, false);
assert.equal('session' in captured.body, false);

const failingProvider = createHttpFactCheckProvider({
  endpoint: 'https://fact.example/check',
  fetchImpl: async () => new Response(JSON.stringify({ code: 'RATE_LIMITED' }), { status: 429, headers: { 'Content-Type': 'application/json' } })
});
await assert.rejects(() => failingProvider.check('A fact'), error => error?.code === 'RATE_LIMITED' && /příliš mnoho/.test(error.message));

// SIM-06 deterministic interruption -> explicit retry: first request fails, second succeeds,
// and neither request receives app context beyond the explicit query.
let retryAttempts = 0;
const retryBodies = [];
const retryProvider = createHttpFactCheckProvider({
  endpoint: 'https://fact.example/check',
  fetchImpl: async (url, options) => {
    retryAttempts += 1;
    retryBodies.push(JSON.parse(options.body));
    if (retryAttempts === 1) throw new Error('synthetic network interruption');
    return new Response(JSON.stringify({
      schema: 'maturita-desk-fact-check-v1',
      verdict: 'confirmed', confidence: 'medium', answer: 'Synthetic retry result.', searched: true,
      sources: [{ title: 'Synthetic HTTPS source', url: 'https://example.org/retry' }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
});
await assert.rejects(() => retryProvider.check('Synthetic retry claim'), error => error?.code === 'NETWORK');
const retryResult = await retryProvider.check('Synthetic retry claim');
assert.equal(retryResult.verdict, 'confirmed');
assert.equal(retryAttempts, 2);
assert.deepEqual(retryBodies, [{ query: 'Synthetic retry claim' }, { query: 'Synthetic retry claim' }]);

// Oversized provider responses are rejected before normalization.
const oversizedProvider = createHttpFactCheckProvider({
  endpoint: 'https://fact.example/check',
  fetchImpl: async () => new Response(JSON.stringify({
    schema: 'maturita-desk-fact-check-v1', verdict: 'confirmed', confidence: 'high',
    answer: 'x'.repeat(140 * 1024), sources: []
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
});
await assert.rejects(() => oversizedProvider.check('Synthetic oversized response'), error => error?.code === 'INVALID_RESPONSE');

assert.equal(createHttpFactCheckProvider({ endpoint: '' }), null);
console.log('Fact Check client tests: PASS');
