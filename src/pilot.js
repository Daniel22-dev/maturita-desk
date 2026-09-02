export const PILOT_SCHEMA = 'maturita-desk-pilot-run-v1';
export const PILOT_STORAGE_KEY = 'ghrab.maturita-desk.pilot-run.v1';
const INTERNAL_REVIEW_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
export const PILOT_INTERNAL_REVIEW = globalThis.MATURITA_DESK_INTERNAL_REVIEW === true && INTERNAL_REVIEW_HOSTS.has(String(globalThis.location?.hostname || ''));
export const PILOT_BUILD = PILOT_INTERNAL_REVIEW ? 'stage13r-internal-review-local' : 'stage13r-serverless-candidate-public';
export const PILOT_SYNTHETIC_ONLY = true && !PILOT_INTERNAL_REVIEW;
export const PILOT_NOTE_MAX = 1000;

export const PILOT_CHECKS = Object.freeze([
  { id: 'content.import-stress', area: 'Content Pack', label: 'Import velkého syntetického .mdesk', mandatory: true },
  { id: 'content.unlock-stress', area: 'Content Pack', label: 'Odemčení velkého syntetického .mdesk bez pádu', mandatory: true },
  { id: 'exam.full-15', area: 'Exam Engine', label: 'Celá 15minutová relace 2 + 4 + 9 bez resetu', mandatory: true },
  { id: 'lifecycle.background', area: 'Lifecycle', label: 'Background / návrat zachová čas a Notes', mandatory: true },
  { id: 'lifecycle.lock', area: 'Lifecycle', label: 'Zamknutí displeje / návrat zachová čas', mandatory: true },
  { id: 'lifecycle.back-restore', area: 'Lifecycle', label: 'Back / Restore bez ztráty relace', mandatory: true },
  { id: 'lifecycle.reopen', area: 'Lifecycle', label: 'Úplné zavření / reopen obnoví session', mandatory: true },
  { id: 'multitab.guard', area: 'Concurrency', label: 'Druhý panel nepřepíše aktivní relaci ani Notes', mandatory: true },
  { id: 'sw.update', area: 'PWA', label: 'Service Worker update se odloží během relace a obnoví po ní', mandatory: true },
  { id: 'offline.cold-start', area: 'PWA', label: 'Offline start po úplném zavření aplikace', mandatory: true },
  { id: 'ipad.landscape', area: 'iPad', label: 'iPad landscape – hlavní workflow', mandatory: true },
  { id: 'ipad.portrait', area: 'iPad', label: 'iPad portrait – workflow zůstává dostupný', mandatory: false },
  { id: 'phone.portrait', area: 'Telefon', label: 'Telefon portrait – celý Exam workflow', mandatory: true },
  { id: 'phone.keyboard', area: 'Telefon', label: 'Soft keyboard / Notes bez překryvu a auto-zoomu', mandatory: true },
  { id: 'pictures.zoom', area: 'Média', label: 'Picture A/B bez cropu + zoom/pan', mandatory: true },
  { id: 'offline.running', area: 'PWA', label: 'Core zkoušky pokračuje po ztrátě sítě', mandatory: true },
  { id: 'wake-lock', area: 'Zařízení', label: 'Wake Lock nebo zdokumentovaný MDM Auto-Lock fallback', mandatory: false },
  { id: 'fact-check-isolation', area: 'Ověřit / dohledat', label: 'Nedostupné Ověřit / dohledat neovlivní Exam Engine', mandatory: true }
]);

const VALID_STATUS = new Set(['not-run', 'pass', 'fail', 'blocked']);

export function pilotClassificationAllowed(classification) {
  return !PILOT_SYNTHETIC_ONLY || String(classification || '') === 'SYNTHETIC-DEMO';
}

export function createPilotRun({ appVersion, build = PILOT_BUILD, device = {}, now = Date.now() } = {}) {
  return {
    schema: PILOT_SCHEMA,
    appVersion: String(appVersion || ''),
    build: String(build || PILOT_BUILD),
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    syntheticOnly: PILOT_SYNTHETIC_ONLY,
    device: sanitizeDevice(device),
    checks: Object.fromEntries(PILOT_CHECKS.map(item => [item.id, { status: 'not-run', note: '', updatedAt: '' }])),
    metrics: {},
    events: []
  };
}

export function normalizePilotRun(value, { appVersion, device = {}, now = Date.now() } = {}) {
  if (!value || value.schema !== PILOT_SCHEMA) return createPilotRun({ appVersion, device, now });
  const run = createPilotRun({ appVersion: appVersion || value.appVersion, build: value.build || PILOT_BUILD, device: { ...value.device, ...device }, now });
  run.createdAt = safeIso(value.createdAt) || run.createdAt;
  run.updatedAt = safeIso(value.updatedAt) || run.updatedAt;
  for (const item of PILOT_CHECKS) {
    const current = value.checks?.[item.id];
    if (!current || !VALID_STATUS.has(current.status)) continue;
    run.checks[item.id] = {
      status: current.status,
      note: sanitizePilotNote(current.note),
      updatedAt: safeIso(current.updatedAt) || ''
    };
  }
  run.metrics = sanitizeMetrics(value.metrics);
  run.events = Array.isArray(value.events) ? value.events.slice(-120).map(sanitizeEvent).filter(Boolean) : [];
  return run;
}

export function setPilotCheck(run, id, status, note = '', now = Date.now()) {
  if (!run?.checks || !PILOT_CHECKS.some(item => item.id === id)) return false;
  if (!VALID_STATUS.has(status)) return false;
  run.checks[id] = { status, note: sanitizePilotNote(note), updatedAt: new Date(now).toISOString() };
  run.updatedAt = new Date(now).toISOString();
  return true;
}

export function recordPilotMetric(run, key, value, now = Date.now()) {
  if (!run || !safeMetricKey(key)) return false;
  run.metrics[key] = sanitizeMetricValue(value);
  run.updatedAt = new Date(now).toISOString();
  return true;
}

export function addPilotEvent(run, type, detail = {}, now = Date.now()) {
  if (!run || !safeMetricKey(type)) return false;
  run.events ||= [];
  run.events.push({ at: new Date(now).toISOString(), type, detail: sanitizeMetricValue(detail) });
  if (run.events.length > 120) run.events.splice(0, run.events.length - 120);
  run.updatedAt = new Date(now).toISOString();
  return true;
}

export function pilotSummary(run) {
  const rows = PILOT_CHECKS.map(item => ({ ...item, ...(run?.checks?.[item.id] || { status: 'not-run', note: '', updatedAt: '' }) }));
  const mandatory = rows.filter(item => item.mandatory);
  const counts = rows.reduce((acc, item) => { acc[item.status] = (acc[item.status] || 0) + 1; return acc; }, { pass: 0, fail: 0, blocked: 0, 'not-run': 0 });
  const mandatoryPending = mandatory.filter(item => item.status !== 'pass').length;
  return {
    total: rows.length,
    mandatory: mandatory.length,
    pass: counts.pass || 0,
    fail: counts.fail || 0,
    blocked: counts.blocked || 0,
    notRun: counts['not-run'] || 0,
    mandatoryPending,
    complete: mandatoryPending === 0 && (counts.fail || 0) === 0 && (counts.blocked || 0) === 0,
    rows
  };
}

export function capturePilotDevice({ navigatorLike = globalThis.navigator, windowLike = globalThis.window, documentLike = globalThis.document } = {}) {
  const ua = String(navigatorLike?.userAgent || '').slice(0, 500);
  const platform = String(navigatorLike?.platform || '').slice(0, 120);
  const width = Number(windowLike?.innerWidth || 0);
  const height = Number(windowLike?.innerHeight || 0);
  const standalone = Boolean(windowLike?.matchMedia?.('(display-mode: standalone)')?.matches || navigatorLike?.standalone === true);
  return sanitizeDevice({
    userAgent: ua,
    platform,
    viewport: { width, height },
    touchPoints: Number(navigatorLike?.maxTouchPoints || 0),
    online: navigatorLike?.onLine !== false,
    standalone,
    visibility: String(documentLike?.visibilityState || ''),
    serviceWorker: Boolean(navigatorLike?.serviceWorker),
    wakeLock: Boolean(navigatorLike?.wakeLock),
    indexedDb: typeof globalThis.indexedDB !== 'undefined',
    broadcastChannel: typeof globalThis.BroadcastChannel === 'function'
  });
}

export function sanitizePilotNote(value) {
  return Array.from(String(value || '').replace(/\r\n?/g, '\n')).slice(0, PILOT_NOTE_MAX).join('');
}

export function serializePilotReport(run) {
  const summary = pilotSummary(run);
  return JSON.stringify({ ...normalizePilotRun(run, { appVersion: run?.appVersion, device: run?.device }), summary: { ...summary, rows: undefined } }, null, 2);
}

export function pilotReportText(run) {
  const summary = pilotSummary(run);
  const lines = [
    'MATURITA DESK — STAGE 13 PILOT REPORT',
    `App: ${run?.appVersion || '-'}`,
    `Build: ${run?.build || '-'}`,
    `Synthetic only: ${run?.syntheticOnly === true ? 'ANO' : 'NE'}`,
    `Created: ${run?.createdAt || '-'}`,
    `Updated: ${run?.updatedAt || '-'}`,
    '',
    `PASS ${summary.pass} | FAIL ${summary.fail} | BLOCKED ${summary.blocked} | NOT RUN ${summary.notRun}`,
    `Mandatory pending: ${summary.mandatoryPending}`,
    `Pilot gate: ${summary.complete ? 'PASS' : 'OPEN'}`,
    '',
    'CHECKS'
  ];
  for (const item of summary.rows) lines.push(`[${item.status.toUpperCase()}] ${item.area} — ${item.label}${item.note ? ` | ${item.note}` : ''}`);
  lines.push('', 'METRICS', JSON.stringify(run?.metrics || {}, null, 2));
  return lines.join('\n');
}

function sanitizeDevice(value) {
  const v = value && typeof value === 'object' ? value : {};
  return {
    userAgent: String(v.userAgent || '').slice(0, 500),
    platform: String(v.platform || '').slice(0, 120),
    viewport: { width: clampNumber(v.viewport?.width, 0, 10000), height: clampNumber(v.viewport?.height, 0, 10000) },
    touchPoints: clampNumber(v.touchPoints, 0, 50),
    online: v.online !== false,
    standalone: v.standalone === true,
    visibility: String(v.visibility || '').slice(0, 40),
    serviceWorker: v.serviceWorker === true,
    wakeLock: v.wakeLock === true,
    indexedDb: v.indexedDb === true,
    broadcastChannel: v.broadcastChannel === true
  };
}

function sanitizeMetrics(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key]) => safeMetricKey(key)).slice(0, 80).map(([key, item]) => [key, sanitizeMetricValue(item)]));
}

function sanitizeMetricValue(value, depth = 0) {
  if (depth > 3) return null;
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return value.slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 20).map(item => sanitizeMetricValue(item, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, item]) => [String(key).slice(0, 80), sanitizeMetricValue(item, depth + 1)]));
  return null;
}

function sanitizeEvent(value) {
  if (!value || typeof value !== 'object' || !safeIso(value.at) || !safeMetricKey(value.type)) return null;
  return { at: value.at, type: value.type, detail: sanitizeMetricValue(value.detail || {}) };
}

function safeMetricKey(value) { return /^[A-Za-z0-9._:-]{1,100}$/.test(String(value || '')); }
function safeIso(value) { const t = Date.parse(String(value || '')); return Number.isFinite(t) ? new Date(t).toISOString() : ''; }
function clampNumber(value, min, max) { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0; }
