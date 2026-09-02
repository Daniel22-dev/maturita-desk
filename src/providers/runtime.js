export const RUNTIME_SCHEMA = 'maturita-desk-runtime-v1';
export const RUNTIME_VERSION = 1;
export const MAX_OFFLINE_LEASE_HOURS = 24;

const LOCALHOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const MODULE_ROOT_URL = new URL('../../', import.meta.url);

export async function loadRuntimeConfig({
  baked = globalThis.MATURITA_DESK_RUNTIME,
  configUrl = './config/deployment.json',
  fetchImpl = globalThis.fetch,
  locationLike = globalThis.location,
  timeoutMs = 2500
} = {}) {
  const trust = trustPolicyFromBaked(baked, locationLike);
  if (locationLike?.href && !deploymentOriginAllowed(locationLike, trust.appOrigins)) {
    return freezeRuntime({
      ...lockedRuntimeDefaults('deployment-origin-mismatch'),
      configurationSource: 'origin-lock',
      configurationLoadError: 'deployment-origin-not-pinned'
    });
  }
  if (!locationLike?.href || typeof fetchImpl !== 'function') {
    return freezeRuntime({ ...readRuntimeConfig(baked, locationLike, trust), configurationSource: 'baked-only' });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(250, Math.min(10000, Number(timeoutMs) || 2500)));
  try {
    const base = ['http:', 'https:'].includes(MODULE_ROOT_URL.protocol) ? MODULE_ROOT_URL : new URL('./', locationLike.href);
    const url = new URL(configUrl, base);
    const response = await fetchImpl(url.href, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      headers: { 'Accept': 'application/json', 'X-Maturita-Desk-Client': 'runtime-v1' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const network = readRuntimeConfig(await response.json(), locationLike, trust);
    return freezeRuntime({ ...network, configurationSource: 'network', configurationLoadError: '' });
  } catch (error) {
    const fallback = readRuntimeConfig(baked, locationLike, trust);
    return freezeRuntime({
      ...fallback,
      configurationSource: 'baked-fallback',
      configurationLoadError: publicConfigLoadError(error)
    });
  } finally {
    clearTimeout(timer);
  }
}

export function localRuntimeDefaults() {
  return {
    schema: RUNTIME_SCHEMA,
    version: RUNTIME_VERSION,
    environmentId: 'standalone-local',
    mode: 'standalone-local',
    serverBaseUrl: '',
    allowedOrigins: ['self'],
    auth: {
      provider: 'local-device',
      sessionEndpoint: '',
      loginUrl: '',
      logoutEndpoint: '',
      offlineLease: { enabled: false, publicKeys: {}, maxHours: MAX_OFFLINE_LEASE_HOURS }
    },
    content: {
      provider: 'encrypted-local',
      activePackEndpoint: '',
      allowManualImport: true,
      confidentialAllowed: false,
      requirePublisherSignatureFor: ['CONFIDENTIAL-EXAM'],
      publisherKeys: {}
    },
    factCheck: {
      provider: 'isolated-http',
      endpoint: '',
      timeoutMs: 18000
    },
    configurationError: ''
  };
}

export function lockedRuntimeDefaults(reason = 'runtime-configuration-invalid') {
  return {
    schema: RUNTIME_SCHEMA,
    version: RUNTIME_VERSION,
    environmentId: 'configuration-locked',
    mode: 'locked',
    serverBaseUrl: '',
    allowedOrigins: ['self'],
    auth: {
      provider: 'locked',
      sessionEndpoint: '',
      loginUrl: '',
      logoutEndpoint: '',
      offlineLease: { enabled: false, publicKeys: {}, maxHours: MAX_OFFLINE_LEASE_HOURS }
    },
    content: {
      provider: 'locked',
      activePackEndpoint: '',
      allowManualImport: false,
      confidentialAllowed: false,
      requirePublisherSignatureFor: ['CONFIDENTIAL-EXAM'],
      publisherKeys: {}
    },
    factCheck: {
      provider: 'locked',
      endpoint: '',
      timeoutMs: 18000
    },
    configurationError: String(reason || 'runtime-configuration-invalid').slice(0, 240)
  };
}

export function readRuntimeConfig(runtime = globalThis.MATURITA_DESK_RUNTIME, locationLike = globalThis.location, trustPolicy = {}) {
  if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime)) return freezeRuntime(lockedRuntimeDefaults('runtime-configuration-missing'));
  if (runtime.schema !== RUNTIME_SCHEMA || Number(runtime.version) !== RUNTIME_VERSION) {
    return freezeRuntime(lockedRuntimeDefaults('unsupported-runtime-schema'));
  }
  if (!['standalone-local', 'school-server'].includes(runtime.mode)) {
    return freezeRuntime(lockedRuntimeDefaults('unsupported-runtime-mode'));
  }
  const expectedMode = ['standalone-local', 'school-server'].includes(trustPolicy?.expectedMode) ? trustPolicy.expectedMode : '';
  if (expectedMode && runtime.mode !== expectedMode) {
    return freezeRuntime(lockedRuntimeDefaults('runtime-mode-mismatch'));
  }
  const expectedEnvironmentId = safeToken(trustPolicy?.expectedEnvironmentId, '');
  if (expectedEnvironmentId && safeToken(runtime.environmentId, '') !== expectedEnvironmentId) {
    return freezeRuntime(lockedRuntimeDefaults('runtime-environment-mismatch'));
  }

  const raw = runtime;
  const mode = raw.mode;
  const environmentId = safeToken(raw.environmentId, mode === 'school-server' ? 'school-server' : 'standalone-local');
  const trustedAllowedOrigins = normalizeAllowedOrigins(trustPolicy?.allowedOrigins || ['self'], locationLike);
  const allowedOrigins = narrowAllowedOrigins(raw.allowedOrigins, trustedAllowedOrigins, locationLike);
  const serverBaseUrl = normalizeBaseUrl(raw.serverBaseUrl, locationLike, allowedOrigins, mode);

  const authProvider = mode === 'school-server'
    ? (raw.auth?.provider === 'school-server-session' ? 'school-server-session' : '')
    : (raw.auth?.provider === 'local-device' ? 'local-device' : '');
  const contentProvider = mode === 'school-server'
    ? (raw.content?.provider === 'school-server-encrypted-pack' ? 'school-server-encrypted-pack' : '')
    : (raw.content?.provider === 'encrypted-local' ? 'encrypted-local' : '');
  const factProvider = mode === 'school-server'
    ? (raw.factCheck?.provider === 'school-server' ? 'school-server' : '')
    : (raw.factCheck?.provider === 'isolated-http' ? 'isolated-http' : '');

  const auth = {
    provider: authProvider,
    sessionEndpoint: safeEndpoint(raw.auth?.sessionEndpoint, serverBaseUrl, locationLike, allowedOrigins),
    loginUrl: safeNavigationUrl(raw.auth?.loginUrl, serverBaseUrl, locationLike, allowedOrigins),
    logoutEndpoint: safeEndpoint(raw.auth?.logoutEndpoint, serverBaseUrl, locationLike, allowedOrigins),
    offlineLease: {
      enabled: mode === 'school-server' && raw.auth?.offlineLease?.enabled === true,
      publicKeys: normalizePublicKeys(raw.auth?.offlineLease?.publicKeys),
      maxHours: clampInt(raw.auth?.offlineLease?.maxHours, 1, MAX_OFFLINE_LEASE_HOURS, MAX_OFFLINE_LEASE_HOURS)
    }
  };
  const trustedPublisherKeys = trustPolicy?.publisherKeys || {};
  const content = {
    provider: contentProvider,
    activePackEndpoint: safeEndpoint(raw.content?.activePackEndpoint, serverBaseUrl, locationLike, allowedOrigins),
    allowManualImport: mode === 'standalone-local' ? true : raw.content?.allowManualImport === true,
    confidentialAllowed: confidentialOriginAllowed(locationLike, trustPolicy?.confidentialContentOrigins, trustPolicy?.allowLocalhostConfidential === true),
    requirePublisherSignatureFor: Object.freeze([...(trustPolicy?.requirePublisherSignatureFor || ['CONFIDENTIAL-EXAM'])]),
    publisherKeys: narrowPublicKeys(raw.content?.publisherKeys, trustedPublisherKeys)
  };
  const factCheck = {
    provider: factProvider,
    endpoint: safeEndpoint(raw.factCheck?.endpoint, serverBaseUrl, locationLike, allowedOrigins),
    timeoutMs: clampInt(raw.factCheck?.timeoutMs, 3000, 60000, 18000)
  };

  const configurationErrors = [];
  if (mode === 'standalone-local') {
    if (auth.provider !== 'local-device') configurationErrors.push('auth');
    if (content.provider !== 'encrypted-local') configurationErrors.push('content');
    if (factCheck.provider !== 'isolated-http') configurationErrors.push('factCheck');
  } else {
    if (!serverBaseUrl) configurationErrors.push('serverBaseUrl');
    if (auth.provider !== 'school-server-session' || !auth.sessionEndpoint || !auth.loginUrl || !auth.logoutEndpoint) configurationErrors.push('auth');
    if (content.provider !== 'school-server-encrypted-pack' || !content.activePackEndpoint) configurationErrors.push('content');
    if (factCheck.provider !== 'school-server' || !factCheck.endpoint) configurationErrors.push('factCheck');
    if (auth.offlineLease.enabled && !Object.keys(auth.offlineLease.publicKeys).length) configurationErrors.push('offlineLease.publicKeys');
  }
  if (content.confidentialAllowed && content.requirePublisherSignatureFor.includes('CONFIDENTIAL-EXAM') && !Object.keys(content.publisherKeys).length) configurationErrors.push('content.publisherKeys');

  if (configurationErrors.length) {
    return freezeRuntime({
      ...lockedRuntimeDefaults(`invalid-${mode}-configuration:${configurationErrors.join(',')}`),
      environmentId,
      allowedOrigins
    });
  }

  return freezeRuntime({
    schema: RUNTIME_SCHEMA,
    version: RUNTIME_VERSION,
    environmentId,
    mode,
    serverBaseUrl,
    allowedOrigins,
    auth,
    content,
    factCheck,
    configurationError: ''
  });
}

export function endpointOriginAllowed(endpoint, allowedOrigins = ['self'], locationLike = globalThis.location) {
  if (!endpoint) return false;
  try {
    const base = locationHref(locationLike);
    const candidate = new URL(endpoint, base);
    if (!['https:', 'http:'].includes(candidate.protocol)) return false;
    if (candidate.protocol === 'http:' && !LOCALHOSTS.has(candidate.hostname)) return false;
    const selfOrigin = new URL(base).origin;
    return allowedOrigins.some(entry => entry === 'self'
      ? candidate.origin === selfOrigin
      : candidate.origin === new URL(entry, base).origin);
  } catch { return false; }
}

export function confidentialOriginAllowed(locationLike = globalThis.location, pinnedOrigins = [], allowLocalhost = false) {
  try {
    const url = new URL(locationHref(locationLike));
    if (allowLocalhost && LOCALHOSTS.has(url.hostname)) return true;
    if (url.protocol !== 'https:') return false;
    return Array.isArray(pinnedOrigins) && pinnedOrigins.includes(url.origin);
  } catch { return false; }
}

function trustPolicyFromBaked(baked, locationLike) {
  const raw = baked && typeof baked === 'object' && !Array.isArray(baked) ? baked : {};
  const expectedMode = ['standalone-local', 'school-server'].includes(raw?.trust?.expectedMode)
    ? raw.trust.expectedMode
    : (['standalone-local', 'school-server'].includes(raw.mode) ? raw.mode : '');
  const expectedEnvironmentId = safeToken(raw?.trust?.expectedEnvironmentId, safeToken(raw.environmentId, ''));
  const requirePublisherSignatureFor = normalizeClassificationList(raw?.content?.requirePublisherSignatureFor, ['CONFIDENTIAL-EXAM']);
  return Object.freeze({
    expectedMode,
    expectedEnvironmentId,
    allowedOrigins: Object.freeze(normalizeAllowedOrigins(raw.allowedOrigins || ['self'], locationLike)),
    appOrigins: Object.freeze(normalizePinnedAppOrigins(raw?.trust?.appOrigins)),
    confidentialContentOrigins: Object.freeze(normalizePinnedAppOrigins(raw?.trust?.confidentialContentOrigins)),
    allowLocalhostConfidential: raw?.trust?.allowLocalhostConfidential === true,
    publisherKeys: Object.freeze(normalizePublicKeys(raw?.content?.publisherKeys)),
    requirePublisherSignatureFor: Object.freeze(requirePublisherSignatureFor)
  });
}

function normalizePinnedAppOrigins(value) {
  if (!Array.isArray(value)) return [];
  const output = [];
  for (const entry of value) {
    try {
      const url = new URL(String(entry || '').trim());
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCALHOSTS.has(url.hostname))) continue;
      if (!output.includes(url.origin)) output.push(url.origin);
    } catch {}
  }
  return output;
}

function deploymentOriginAllowed(locationLike, pinnedOrigins) {
  try {
    const url = new URL(locationHref(locationLike));
    if (url.protocol === 'file:' || LOCALHOSTS.has(url.hostname)) return true;
    return Array.isArray(pinnedOrigins) && pinnedOrigins.includes(url.origin);
  } catch { return false; }
}

function narrowAllowedOrigins(requested, trusted, locationLike) {
  const trustedList = normalizeAllowedOrigins(trusted, locationLike);
  const requestedList = normalizeAllowedOrigins(requested, locationLike);
  const trustedSet = new Set(trustedList.map(entry => canonicalOriginEntry(entry, locationLike)).filter(Boolean));
  const output = [];
  for (const entry of requestedList) {
    const canonical = canonicalOriginEntry(entry, locationLike);
    if (canonical && trustedSet.has(canonical) && !output.includes(entry)) output.push(entry);
  }
  if (!output.includes('self') && trustedSet.has(canonicalOriginEntry('self', locationLike))) output.unshift('self');
  return output.length ? output : ['self'];
}

function canonicalOriginEntry(entry, locationLike) {
  try {
    const base = locationHref(locationLike);
    return entry === 'self' ? new URL(base).origin : new URL(entry, base).origin;
  } catch { return ''; }
}

function normalizeAllowedOrigins(value, locationLike) {
  const base = locationHref(locationLike);
  const output = ['self'];
  if (!Array.isArray(value)) return output;
  for (const entry of value) {
    if (entry === 'self') continue;
    try {
      const url = new URL(String(entry), base);
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCALHOSTS.has(url.hostname))) continue;
      if (!output.includes(url.origin)) output.push(url.origin);
    } catch {}
  }
  return output;
}

function normalizeBaseUrl(value, locationLike, allowedOrigins, mode) {
  if (mode !== 'school-server') return '';
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text.endsWith('/') ? text : `${text}/`, locationHref(locationLike));
    if (!endpointOriginAllowed(url.href, allowedOrigins, locationLike)) return '';
    return url.href;
  } catch { return ''; }
}

function safeEndpoint(value, baseUrl, locationLike, allowedOrigins) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const base = baseUrl || locationHref(locationLike);
    const url = new URL(text, base);
    if (!endpointOriginAllowed(url.href, allowedOrigins, locationLike)) return '';
    if (url.protocol === 'https:') return url.href;
    if (url.protocol === 'http:' && LOCALHOSTS.has(url.hostname)) return url.href;
    return '';
  } catch { return ''; }
}

function safeNavigationUrl(value, baseUrl, locationLike, allowedOrigins) {
  return safeEndpoint(value, baseUrl, locationLike, allowedOrigins);
}

function normalizePublicKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output = {};
  for (const [keyId, jwk] of Object.entries(value)) {
    if (!safeToken(keyId, '') || !jwk || typeof jwk !== 'object') continue;
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y || jwk.d) continue;
    output[keyId] = { kty: 'EC', crv: 'P-256', x: String(jwk.x), y: String(jwk.y), ext: true, key_ops: ['verify'] };
  }
  return output;
}

function narrowPublicKeys(requested, trusted) {
  const trustedKeys = normalizePublicKeys(trusted);
  const requestedKeys = normalizePublicKeys(requested);
  const output = {};
  for (const [keyId, jwk] of Object.entries(requestedKeys)) {
    const pinned = trustedKeys[keyId];
    if (!pinned) continue;
    if (pinned.x !== jwk.x || pinned.y !== jwk.y || pinned.crv !== jwk.crv || pinned.kty !== jwk.kty) continue;
    output[keyId] = pinned;
  }
  // A network configuration may omit keys (fail closed), but it can never add or replace a baked publisher key.
  return output;
}

function normalizeClassificationList(value, fallback = []) {
  if (!Array.isArray(value)) return [...fallback];
  const allowed = new Set(['CONFIDENTIAL-EXAM', 'SYNTHETIC-DEMO']);
  const output = [];
  for (const item of value) {
    const text = String(item || '').trim();
    if (allowed.has(text) && !output.includes(text)) output.push(text);
  }
  return output.length ? output : [...fallback];
}

function safeToken(value, fallback) {
  const text = String(value || '').trim();
  return /^[A-Za-z0-9._:-]{1,120}$/.test(text) ? text : fallback;
}

function clampInt(value, min, max, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num >= min && num <= max ? Math.round(num) : fallback;
}

function locationHref(locationLike) {
  return String(locationLike?.href || 'https://example.invalid/');
}

function publicConfigLoadError(error) {
  if (error?.name === 'AbortError') return 'deployment-config-timeout';
  return 'deployment-config-unavailable';
}

function freezeRuntime(value) {
  const locked = lockedRuntimeDefaults();
  const auth = value.auth || locked.auth;
  const content = value.content || locked.content;
  const factCheck = value.factCheck || locked.factCheck;
  value.allowedOrigins = Object.freeze([...(value.allowedOrigins || ['self'])]);
  value.auth = Object.freeze({ ...auth, offlineLease: Object.freeze({ ...(auth.offlineLease || locked.auth.offlineLease), publicKeys: Object.freeze({ ...(auth.offlineLease?.publicKeys || {}) }) }) });
  value.content = Object.freeze({
    ...content,
    requirePublisherSignatureFor: Object.freeze([...(content.requirePublisherSignatureFor || ['CONFIDENTIAL-EXAM'])]),
    publisherKeys: Object.freeze({ ...(content.publisherKeys || {}) })
  });
  value.factCheck = Object.freeze({ ...factCheck });
  return Object.freeze(value);
}
