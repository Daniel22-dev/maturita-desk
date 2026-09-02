import { readTextLimited } from './net/read-limited.js';
export const FACT_CHECK_SCHEMA = 'maturita-desk-fact-check-v1';
export const FACT_CHECK_MAX_QUERY = 700;
export const FACT_CHECK_MAX_ANSWER = 5000;
export const FACT_CHECK_MAX_SOURCES = 6;
export const FACT_CHECK_DEFAULT_TIMEOUT_MS = 18000;
export const FACT_CHECK_MAX_RESPONSE_BYTES = 128 * 1024;

const VERDICTS = new Set(['confirmed', 'inaccurate', 'mixed', 'uncertain', 'not_verifiable', 'informational']);
const CONFIDENCE = new Set(['high', 'medium', 'low']);

export class FactCheckError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'FactCheckError';
    this.code = code;
  }
}

export function sanitizeFactQuery(value) {
  const query = String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!query) throw new FactCheckError('EMPTY_QUERY', 'Nejdříve napište informaci, kterou chcete ověřit.');
  if (query.length > FACT_CHECK_MAX_QUERY) throw new FactCheckError('QUERY_TOO_LONG', `Dotaz může mít nejvýše ${FACT_CHECK_MAX_QUERY} znaků.`);
  return query;
}

export function readFactCheckConfig(runtime = globalThis.MATURITA_DESK_RUNTIME) {
  const raw = runtime && typeof runtime === 'object' ? runtime.factCheck : null;
  const endpoint = typeof raw?.endpoint === 'string' ? raw.endpoint.trim() : '';
  const timeoutMs = Number(raw?.timeoutMs);
  return {
    endpoint: isAllowedEndpoint(endpoint) ? endpoint : '',
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs >= 3000 && timeoutMs <= 60000 ? Math.round(timeoutMs) : FACT_CHECK_DEFAULT_TIMEOUT_MS
  };
}

export function factCheckAvailability({ online = true, endpoint = '' } = {}) {
  if (!endpoint) return { ready: false, code: 'unconfigured', label: 'Provider není nakonfigurován' };
  if (!online) return { ready: false, code: 'offline', label: 'Offline' };
  return { ready: true, code: 'ready', label: 'Online · připraven' };
}

export function normalizeFactCheckResult(value) {
  if (!value || typeof value !== 'object' || value.schema !== FACT_CHECK_SCHEMA) {
    throw new FactCheckError('INVALID_RESPONSE', 'Fact Check vrátil neplatnou odpověď.');
  }
  const verdict = VERDICTS.has(value.verdict) ? value.verdict : 'uncertain';
  const confidence = CONFIDENCE.has(value.confidence) ? value.confidence : 'low';
  const answer = String(value.answer ?? '').trim().slice(0, FACT_CHECK_MAX_ANSWER);
  if (!answer) throw new FactCheckError('INVALID_RESPONSE', 'Fact Check nevrátil vysvětlení.');
  const sources = normalizeSources(value.sources);
  return {
    schema: FACT_CHECK_SCHEMA,
    verdict,
    confidence,
    answer,
    sources,
    checkedAt: normalizeIso(value.checkedAt),
    model: typeof value.model === 'string' ? value.model.slice(0, 80) : '',
    searched: value.searched !== false
  };
}

export function createHttpFactCheckProvider({ endpoint, timeoutMs = FACT_CHECK_DEFAULT_TIMEOUT_MS, fetchImpl = globalThis.fetch, credentials = 'omit', mode = 'cors', getCsrfToken = () => '', getAccessToken = () => '' } = {}) {
  const safeEndpoint = String(endpoint ?? '').trim();
  if (!isAllowedEndpoint(safeEndpoint)) return null;
  if (typeof fetchImpl !== 'function') return null;

  return Object.freeze({
    kind: 'http',
    endpoint: safeEndpoint,
    async check(rawQuery, { signal } = {}) {
      const query = sanitizeFactQuery(rawQuery);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new DOMException('Fact Check timeout', 'TimeoutError')), timeoutMs);
      const forwardAbort = () => controller.abort(signal?.reason || new DOMException('Fact Check cancelled', 'AbortError'));
      if (signal?.aborted) forwardAbort();
      else signal?.addEventListener?.('abort', forwardAbort, { once: true });

      try {
        const response = await fetchImpl(safeEndpoint, {
          method: 'POST',
          mode: mode === 'same-origin' ? 'same-origin' : 'cors',
          credentials: credentials === 'include' ? 'include' : 'omit',
          cache: 'no-store',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Maturita-Desk-Client': 'fact-check-v1',
            ...(credentials === 'include' && String(getCsrfToken?.() || '').trim() ? { 'X-CSRF-Token': String(getCsrfToken()).trim().slice(0, 512) } : {}),
            ...(credentials !== 'include' && sanitizeAccessToken(getAccessToken?.()) ? { 'X-Maturita-Desk-Access': sanitizeAccessToken(getAccessToken?.()) } : {})
          },
          body: JSON.stringify({ query }),
          signal: controller.signal
        });
        let data = null;
        try { data = await readJsonLimited(response, FACT_CHECK_MAX_RESPONSE_BYTES); } catch {}
        if (!response.ok) {
          const code = typeof data?.code === 'string' ? data.code : `HTTP_${response.status}`;
          const message = publicErrorMessage(code, response.status);
          throw new FactCheckError(code, message);
        }
        return normalizeFactCheckResult(data);
      } catch (error) {
        if (error instanceof FactCheckError) throw error;
        if (controller.signal.aborted) {
          if (signal?.aborted) throw new FactCheckError('CANCELLED', 'Ověření bylo zrušeno.');
          throw new FactCheckError('TIMEOUT', 'Ověření trvá příliš dlouho. Zkuste to znovu.');
        }
        throw new FactCheckError('NETWORK', 'Fact Check se nepodařilo spojit s online službou.');
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener?.('abort', forwardAbort);
      }
    }
  });
}


function sanitizeAccessToken(value) {
  const token = String(value || '').trim();
  return token.length >= 32 && token.length <= 256 && /^[A-Za-z0-9._~+-]+$/.test(token) ? token : '';
}

function normalizeSources(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const output = [];
  for (const item of value) {
    const url = safeSourceUrl(item?.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    output.push({
      title: String(item?.title || item?.publisher || new URL(url).hostname).trim().slice(0, 240),
      url,
      publisher: String(item?.publisher || '').trim().slice(0, 160),
      publishedAt: normalizeIso(item?.publishedAt)
    });
    if (output.length >= FACT_CHECK_MAX_SOURCES) break;
  }
  return output;
}

function safeSourceUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return '';
    url.username = '';
    url.password = '';
    return url.toString();
  } catch { return ''; }
}

function normalizeIso(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function isAllowedEndpoint(value) {
  if (!value) return false;
  try {
    const url = new URL(value, globalThis.location?.href || 'https://example.invalid/');
    if (url.protocol === 'https:') return true;
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return url.protocol === 'http:' && local;
  } catch { return false; }
}

function publicErrorMessage(code, status) {
  if (code === 'RATE_LIMITED' || status === 429) return 'Fact Check má momentálně příliš mnoho požadavků. Zkuste to za chvíli.';
  if (code === 'ORIGIN_NOT_ALLOWED' || status === 403) return 'Toto nasazení nemá oprávnění používat Fact Check.';
  if (code === 'NOT_CONFIGURED' || status === 503) return 'Fact Check provider není na serveru připraven.';
  if (code === 'INVALID_QUERY' || status === 400) return 'Dotaz nebylo možné odeslat. Zkontrolujte jeho délku a obsah.';
  if (status >= 500) return 'Online ověření je dočasně nedostupné.';
  return 'Fact Check se nepodařilo dokončit.';
}


async function readJsonLimited(response, maxBytes) {
  let text;
  try {
    text = await readTextLimited(response, maxBytes, { message: 'Fact Check vrátil příliš velkou nebo nečitelnou odpověď.' });
  } catch {
    throw new FactCheckError('INVALID_RESPONSE', 'Fact Check vrátil příliš velkou nebo nečitelnou odpověď.');
  }
  try { return JSON.parse(text); } catch { throw new FactCheckError('INVALID_RESPONSE', 'Fact Check vrátil neplatnou odpověď.'); }
}
