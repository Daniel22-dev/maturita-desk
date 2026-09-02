import { TOPICS } from './demo-content.js';
import {
  PHASES, PHASE_TARGETS, createSession, normalizeSession, getTotalElapsed,
  getPhaseElapsed, getTotalTarget, transitionSession, finishSessionState,
  setViewPhaseState, setSectionState, setNoteState, phaseStatus, timingClass,
  formatTime, getTimingSummary, touchClock
} from './exam-engine.js';
import { validateTopic, validateTopicCollection, safeImageSource } from './content-validator.js';
import { NOTE_MAX_LENGTH, noteUsage, hasNote, hasAnyNote, shouldPersistHeartbeat } from './notes.js';
import { decryptContentPack, MAX_ENVELOPE_BYTES, parseEnvelopeText } from './content-pack.js';
import { isProtectedStoreAvailable, saveEncryptedPack, getActivePackMeta, loadActiveEnvelope, removeActivePack } from './content-pack-store.js';
import { collectReviewItems, effectiveGuidance, filterReviewItems, reviewItemIdForQuestion, reviewItemIdForTask, reviewRecordMap, summarizeReview, REVIEW_NOTE_MAX } from './review-model.js';
import { clearReviewRecords, deleteReviewRecord, importReviewRecords, isReviewStoreAvailable, loadReviewRecords, saveReviewRecord } from './review-store.js';
import { createReviewPatch, parseReviewPatchText } from './review-patch.js';
import { FACT_CHECK_MAX_QUERY, factCheckAvailability, sanitizeFactQuery } from './fact-check.js';
import { loadRuntimeConfig } from './providers/runtime.js';
import { createProviderRegistry } from './providers/registry.js';
import { hasCapability } from './providers/auth-provider.js';
import { installDeviceRuntime } from './device-runtime.js';
import { PILOT_BUILD, PILOT_CHECKS, PILOT_STORAGE_KEY, PILOT_SYNTHETIC_ONLY, PILOT_INTERNAL_REVIEW, addPilotEvent, capturePilotDevice, createPilotRun, normalizePilotRun, pilotClassificationAllowed, pilotReportText, pilotSummary, recordPilotMetric, serializePilotReport, setPilotCheck } from './pilot.js';
import { SESSION_OWNER_HEARTBEAT_MS, claimSessionOwnership, readSessionOwner, refreshSessionOwnership, releaseSessionOwnership } from './session-coordinator.js';

const APP_ID = 'maturita-desk';
const APP_VERSION = '0.10.1';
const FACT_ACCESS_KEY = 'ghrab.maturita-desk.fact-access.v1';
const UI_KEY = 'ghrab.maturita-desk.ui-settings.v1';
const SESSION_KEY = 'ghrab.maturita-desk.session.v1';
const INSTANCE_ID = globalThis.crypto?.randomUUID?.() || `tab-${Date.now()}`;
const PHASE_LABELS = { pictures: 'Pictures', task: 'Task Box', topic: 'Topic' };
const PHASE_LABELS_CS = { pictures: 'Porovnání obrázků', task: 'Task Box', topic: 'Téma' };
const HEARTBEAT_MS = 10000;
const RUNTIME_CONFIG = await loadRuntimeConfig();
const CONTENT_STORE_ADAPTER = Object.freeze({
  saveEncryptedPack,
  getActivePackMeta,
  loadActiveEnvelope,
  removeActivePack
});
const PROVIDERS = createProviderRegistry(RUNTIME_CONFIG, { contentStore: CONTENT_STORE_ADAPTER, getFactAccessToken: loadFactAccessToken });
let FACT_CHECK_PROVIDER = PROVIDERS.factCheck;
let deviceRuntimeController = null;
let sessionChannel = null;
let lastSessionOwnerHeartbeatAt = 0;

const app = document.querySelector('#app');
const modalRoot = document.querySelector('#modal-root');
const toastRoot = document.querySelector('#toast-root');

const state = {
  screen: 'home',
  mode: null,
  topicId: 14,
  online: navigator.onLine,
  drawer: null,
  notesTab: 'topic',
  modal: null,
  pictureView: 'A',
  practiceChoice: 'untimed',
  factQuery: '',
  factState: 'idle',
  factResult: null,
  factError: '',
  auth: {
    status: RUNTIME_CONFIG.mode === 'school-server' ? 'checking' : RUNTIME_CONFIG.mode === 'standalone-local' ? 'local' : 'configuration-locked',
    authenticated: RUNTIME_CONFIG.mode === 'standalone-local',
    authoritative: RUNTIME_CONFIG.mode !== 'standalone-local',
    source: RUNTIME_CONFIG.mode === 'school-server' ? 'server-session' : RUNTIME_CONFIG.mode === 'standalone-local' ? 'local-device' : 'configuration',
    capabilities: RUNTIME_CONFIG.mode === 'standalone-local' ? ['exam', 'practice', 'review', 'content:local', 'fact-check'] : [],
    displayName: '', expiresAt: '', csrfToken: '', error: ''
  },
  content: {
    status: isProtectedStoreAvailable() ? 'checking' : 'unavailable',
    activeMeta: null,
    unlocked: null,
    error: '',
    busy: false
  },
  pilot: loadPilotRun(),
  review: {
    storeAvailable: isReviewStoreAvailable(),
    status: 'idle',
    items: [],
    records: new Map(),
    selectedId: null,
    busy: false,
    error: '',
    filters: { priority: 'HIGH', status: 'pending', topic: 'all', kind: 'all', query: '' }
  },
  notesSavedAt: 0,
  lastHeartbeatAt: Date.now(),
  theme: loadUi().theme || 'system',
  session: loadSession(),
  restored: false,
  runtime: {
    storage: storageWritable() ? 'ready' : 'error',
    shell: 'checking',
    content: validateTopicCollection(TOPICS),
    wakeLock: 'wakeLock' in navigator ? 'available' : 'unsupported',
    factCheck: { ready: false, code: 'checking', label: 'Kontrola provideru…' },
    deployment: RUNTIME_CONFIG.configurationError ? 'error' : RUNTIME_CONFIG.configurationLoadError ? 'fallback' : RUNTIME_CONFIG.mode,
    update: 'idle',
    lifecycle: 'active',
    device: { formFactor: 'desktop', orientation: 'landscape', displayMode: 'browser', standalone: false, keyboardOpen: false },
    sessionLock: 'idle'
  },
  confirmation: null
};

applyTheme(state.theme);
resumeSessionIfPresent();
render();
registerServiceWorker();
setupLifecyclePersistence();
setupSessionCoordination();
setupKeyboardShortcuts();
setupWakeLockLifecycle();
setupDeviceRuntime();
initializeContentManager();
initializeProviderLayer();

let clockHandle = window.setInterval(updateTimers, 250);

window.addEventListener('online', () => { state.online = true; handleConnectivityChange(true); });
window.addEventListener('offline', () => { state.online = false; handleConnectivityChange(false); });

document.addEventListener('click', handleClick);
app.addEventListener('change', handleChange);
document.addEventListener('input', handleInput);
modalRoot.addEventListener('click', handleModalClick);


function loadPilotRun() {
  const device = capturePilotDevice();
  try {
    const parsed = JSON.parse(localStorage.getItem(PILOT_STORAGE_KEY) || 'null');
    return normalizePilotRun(parsed, { appVersion: APP_VERSION, device });
  } catch {
    return createPilotRun({ appVersion: APP_VERSION, device });
  }
}

function loadFactAccessToken() {
  try { return String(sessionStorage.getItem(FACT_ACCESS_KEY) || '').trim().slice(0, 256); }
  catch { return ''; }
}

function saveFactAccessToken(value) {
  const token = String(value || '').trim();
  if (token.length < 32 || token.length > 256 || !/^[A-Za-z0-9._~+-]+$/.test(token)) return false;
  try { sessionStorage.setItem(FACT_ACCESS_KEY, token); return true; }
  catch { return false; }
}

function clearFactAccessToken() {
  try { sessionStorage.removeItem(FACT_ACCESS_KEY); } catch {}
}

function savePilotRun() {
  try {
    state.pilot.device = capturePilotDevice();
    localStorage.setItem(PILOT_STORAGE_KEY, JSON.stringify(state.pilot));
    return true;
  } catch {
    return false;
  }
}

function pilotMetric(key, value) {
  recordPilotMetric(state.pilot, key, value);
  savePilotRun();
}

function pilotEvent(type, detail = {}) {
  addPilotEvent(state.pilot, type, detail);
  savePilotRun();
}

function updatePilotCheck(id, status, note = '') {
  if (!setPilotCheck(state.pilot, id, status, note)) return false;
  savePilotRun();
  return true;
}

function loadUi() {
  try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}'); }
  catch { return {}; }
}

function saveUi() {
  localStorage.setItem(UI_KEY, JSON.stringify({ theme: state.theme }));
}

function loadSession() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    return normalizeSession(parsed);
  } catch {
    return null;
  }
}

function saveSession({ broadcast = true } = {}) {
  if (!state.session) {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    return true;
  }
  if (state.session.status === 'running') {
    const ownership = refreshSessionOwnership(localStorage, { instanceId: INSTANCE_ID, sessionId: state.session.id });
    if (!ownership.ok) {
      state.runtime.sessionLock = 'conflict';
      pilotEvent('session.write-blocked', { reason: ownership.reason || 'conflict' });
      return false;
    }
    state.runtime.sessionLock = 'owned';
  }
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
    state.runtime.storage = 'ready';
    state.lastHeartbeatAt = Date.now();
    if (broadcast) broadcastSessionPresence();
    return true;
  } catch (error) {
    console.warn('[Maturita Desk] Session persistence failed.', error);
    state.runtime.storage = 'error';
    return false;
  }
}

function clearSession() {
  const previousSessionId = state.session?.id || '';
  if (previousSessionId) releaseSessionOwnership(localStorage, { instanceId: INSTANCE_ID, sessionId: previousSessionId });
  state.runtime.sessionLock = 'idle';
  state.session = null;
  state.factQuery = '';
  state.factState = 'idle';
  state.factResult = null;
  state.factError = '';
  state.notesSavedAt = 0;
  try { localStorage.removeItem(SESSION_KEY); } catch {}
  releaseWakeLock();
}

function resumeSessionIfPresent() {
  const s = state.session;
  if (!s) return;
  if (!['running', 'finished'].includes(s.status)) return;
  state.mode = s.mode;
  state.topicId = s.topicId;
  state.screen = s.contentRef?.source === 'pack' ? 'resume-locked' : (s.status === 'finished' ? 'finished' : 'console');
  state.notesTab = s.viewPhase || s.activePhase || (s.mode === 'exam' ? 'pictures' : 'task');
  state.restored = true;
  if (s.status === 'running') {
    const ownership = claimSessionOwnership(localStorage, { instanceId: INSTANCE_ID, sessionId: s.id });
    if (!ownership.ok) {
      state.runtime.sessionLock = 'conflict';
      state.screen = 'session-conflict';
      pilotEvent('session.restore-conflict', { reason: ownership.reason || 'owned-by-other' });
      return;
    }
    state.runtime.sessionLock = 'owned';
  }
  if (s.contentRef?.source !== 'pack') {
    setTimeout(() => { toast('Pracovní relace byla obnovena.'); if (s.status === 'running') requestWakeLock(); }, 250);
  }
}


async function initializeProviderLayer() {
  try {
    const auth = await PROVIDERS.auth.initialize({ online: state.online });
    state.auth = auth;
    PROVIDERS.setAuthState(auth);
  } catch (error) {
    state.auth = {
      status: 'unavailable', authenticated: false, authoritative: RUNTIME_CONFIG.mode === 'school-server',
      source: RUNTIME_CONFIG.mode === 'school-server' ? 'server-session' : 'local-device', capabilities: [],
      displayName: '', expiresAt: '', csrfToken: '', error: error?.message || 'Přístupovou vrstvu nelze inicializovat.'
    };
    PROVIDERS.setAuthState(state.auth);
  }
  state.runtime.factCheck = currentFactCheckAvailability();
  render();
}

async function refreshAuthState({ silent = false } = {}) {
  if (RUNTIME_CONFIG.mode !== 'school-server') return state.auth;
  try {
    const auth = await PROVIDERS.auth.refresh({ online: state.online });
    state.auth = auth;
    PROVIDERS.setAuthState(auth);
    enforceAuthContentBoundary();
    state.runtime.factCheck = currentFactCheckAvailability();
    if (!silent) toast(auth.authenticated ? (auth.source === 'offline-lease' ? 'Offline oprávnění je platné.' : 'Školní relace byla ověřena.') : 'Školní relace není přihlášená.');
  } catch (error) {
    state.auth = { ...state.auth, status: 'unavailable', authenticated: false, capabilities: [], error: error?.message || 'Školní server není dostupný.' };
    PROVIDERS.setAuthState(state.auth);
    enforceAuthContentBoundary();
    state.runtime.factCheck = currentFactCheckAvailability();
    if (!silent) toast('Přístupovou relaci se nepodařilo ověřit.');
  }
  render();
  return state.auth;
}

async function handleConnectivityChange(online) {
  state.runtime.factCheck = currentFactCheckAvailability();
  if (!online) {
    cancelFactCheck(true);
    updateConnectivity();
    return;
  }
  if (RUNTIME_CONFIG.mode === 'school-server') await refreshAuthState({ silent: true });
  state.runtime.factCheck = currentFactCheckAvailability();
  updateConnectivity();
}

async function initializeContentManager() {
  if (!isProtectedStoreAvailable()) {
    state.content.status = 'unavailable';
    state.content.error = 'IndexedDB není na tomto zařízení dostupné.';
    if (state.screen === 'resume-locked') render();
    return;
  }
  try {
    const meta = await PROVIDERS.content.initialize();
    state.content.activeMeta = meta;
    state.content.unlocked = null;
    state.content.status = meta ? 'locked' : 'none';
    state.content.error = '';
    if (PILOT_SYNTHETIC_ONLY && meta && !pilotClassificationAllowed(meta.classification)) {
      state.content.status = 'error';
      state.content.error = 'Stage 13 pilot z bezpečnostních důvodů přijímá pouze SYNTHETIC-DEMO Content Pack. Ostrý pack zůstává v úložišti zamčený a nelze jej v této verzi použít.';
    }
    if (state.session?.contentRef?.source === 'pack') {
      if (!meta || meta.packId !== state.session.contentRef.packId || meta.contentVersion !== state.session.contentRef.version) {
        state.content.status = 'error';
        state.content.error = 'Balíček potřebný k obnovení relace na tomto zařízení chybí nebo má jinou verzi.';
      }
    }
  } catch (error) {
    console.warn('[Maturita Desk] Protected Content Store init failed.', error);
    state.content.status = 'error';
    state.content.error = error?.message || 'Chráněné úložiště se nepodařilo otevřít.';
  }
  render();
}

async function importContentPackFile(file) {
  if (state.content.busy) return;
  if (!file || file.size <= 0 || file.size > MAX_ENVELOPE_BYTES) {
    toast('Content Pack má neplatnou velikost.');
    return;
  }
  state.content.busy = true;
  state.content.error = '';
  renderDrawer();
  try {
    if (!PROVIDERS.content.allowManualImport) throw new Error('Ruční import je v tomto serverovém profilu vypnutý.');
    const importStarted = performance.now();
    const text = await file.text();
    const envelope = await parseEnvelopeText(text);
    if (PILOT_SYNTHETIC_ONLY && !pilotClassificationAllowed(envelope.classification)) throw new Error('Stage 13 pilot přijímá výhradně SYNTHETIC-DEMO Content Pack. Ostrý CONFIDENTIAL-EXAM pack je v pilotním buildu zablokovaný.');
    const meta = await PROVIDERS.content.importText(text);
    pilotMetric('content.import', { bytes: file.size, elapsedMs: Math.round(performance.now() - importStarted), classification: meta.classification });
    pilotEvent('content.imported', { bytes: file.size, classification: meta.classification });
    state.content.activeMeta = meta;
    state.content.unlocked = null;
    state.content.status = 'locked';
    state.runtime.content = validateTopicCollection(TOPICS);
    resetReviewRuntime(false);
    toast('Šifrovaný Content Pack byl uložen do tohoto zařízení. Nyní jej odemkněte.');
  } catch (error) {
    console.warn('[Maturita Desk] Content Pack import failed.', error);
    state.content.error = error?.message || 'Import Content Packu selhal.';
    toast('Content Pack se nepodařilo importovat.');
  } finally {
    state.content.busy = false;
    if (state.screen === 'home') render();
    if (state.drawer === 'content') renderDrawer();
  }
}

async function syncContentPackFromSchoolServer() {
  if (PILOT_SYNTHETIC_ONLY) { toast('Stage 13 pilot nepovoluje serverové stažení ostrého Content Packu.'); return; }
  if (!PROVIDERS.content.remote || state.content.busy) return;
  if (!state.online) { toast('Aktualizace Content Packu vyžaduje připojení ke školnímu serveru.'); return; }
  if (!canUse('content:download')) { toast('Školní účet nemá oprávnění stáhnout Content Pack.'); return; }
  if (state.session) { toast('Content Pack nelze měnit během rozpracované relace.'); return; }
  state.content.busy = true;
  state.content.error = '';
  renderDrawer();
  try {
    const meta = await PROVIDERS.content.sync();
    state.content.activeMeta = meta;
    state.content.unlocked = null;
    state.content.status = 'locked';
    state.runtime.content = validateTopicCollection(TOPICS);
    resetReviewRuntime(false);
    toast('Aktuální šifrovaný Content Pack byl bezpečně uložen do zařízení.');
  } catch (error) {
    console.warn('[Maturita Desk] School Content Provider sync failed.', error);
    state.content.error = error?.message || 'Aktualizace ze školního serveru selhala.';
    toast('Content Pack se nepodařilo aktualizovat. Lokální kopie zůstala beze změny.');
  } finally {
    state.content.busy = false;
    if (state.screen === 'home') render();
    if (state.drawer === 'content') renderDrawer();
  }
}

async function unlockActiveContentPack() {
  if (state.content.busy) return;
  if (RUNTIME_CONFIG.mode === 'school-server' && !state.auth.authenticated) {
    toast('Nejdříve ověřte školní přístup.');
    return;
  }
  if (!state.content.activeMeta) {
    toast('Na zařízení není uložen žádný chráněný Content Pack.');
    return;
  }
  if (PILOT_SYNTHETIC_ONLY && !pilotClassificationAllowed(state.content.activeMeta.classification)) {
    toast('Stage 13 pilot může odemknout pouze syntetický Content Pack.');
    return;
  }
  const passInput = document.querySelector('[data-pack-passphrase]');
  const passphrase = String(passInput?.value || '');
  if (passphrase.length < 10) {
    toast('Zadejte heslo Content Packu.');
    passInput?.focus();
    return;
  }
  state.content.busy = true;
  state.content.error = '';
  if (state.drawer === 'content') renderDrawer();
  if (state.screen === 'resume-locked') render();
  try {
    const envelope = await PROVIDERS.content.loadEnvelope();
    if (!envelope) throw new Error('Šifrovaný Content Pack nebyl v zařízení nalezen.');
    if (envelope.packId !== state.content.activeMeta.packId) throw new Error('Aktivní Content Pack není konzistentní s uloženými metadaty.');
    const unlockStarted = performance.now();
    const pack = await decryptContentPack(envelope, passphrase);
    if (PILOT_SYNTHETIC_ONLY && !pilotClassificationAllowed(pack.manifest.classification)) throw new Error('Stage 13 pilot blokuje neveřejný CONFIDENTIAL-EXAM obsah.');
    pilotMetric('content.unlock', { encryptedBytes: state.content.activeMeta.encryptedBytes || 0, elapsedMs: Math.round(performance.now() - unlockStarted), classification: pack.manifest.classification });
    pilotEvent('content.unlocked', { classification: pack.manifest.classification });
    const contentCheck = validateTopicCollection(pack.topics);
    if (!contentCheck.ok) throw new Error(`Obsah Content Packu neprošel validací: ${contentCheck.errors[0] || 'neznámá chyba'}`);
    state.content.unlocked = pack;
    state.content.status = 'unlocked';
    state.runtime.content = contentCheck;
    state.content.error = '';
    await initializeReviewManager(pack);
    if (passInput) passInput.value = '';

    if (state.screen === 'resume-locked' && state.session?.contentRef?.source === 'pack') {
      if (pack.manifest.packId !== state.session.contentRef.packId || pack.manifest.version !== state.session.contentRef.version) {
        state.content.unlocked = null;
        state.content.status = 'locked';
        throw new Error('Odemčený Content Pack neodpovídá rozpracované relaci.');
      }
      state.screen = state.session.status === 'finished' ? 'finished' : 'console';
      if (state.session.status === 'running') requestWakeLock();
      toast('Content Pack byl odemčen a pracovní relace obnovena.');
    } else {
      toast('Content Pack byl odemčen pouze v paměti této relace aplikace.');
    }
  } catch (error) {
    console.warn('[Maturita Desk] Content Pack unlock failed.', error);
    state.content.unlocked = null;
    state.content.status = state.content.activeMeta ? 'locked' : 'none';
    resetReviewRuntime(false);
    state.content.error = error?.message || 'Content Pack nelze odemknout.';
    toast('Content Pack se nepodařilo odemknout.');
  } finally {
    // Passphrase is intentionally not stored in application state or browser storage.
    state.content.busy = false;
    const reopenContentDrawer = state.drawer === 'content';
    render();
    if (reopenContentDrawer) renderDrawer();
  }
}

function lockContentPack() {
  if (state.session?.contentRef?.source === 'pack') {
    toast('Během relace s chráněným obsahem nelze Content Pack zamknout.');
    return;
  }
  state.content.unlocked = null;
  state.content.status = state.content.activeMeta ? 'locked' : 'none';
  state.runtime.content = validateTopicCollection(TOPICS);
  resetReviewRuntime(false);
  closeDrawer();
  state.mode = null;
  state.screen = 'home';
  render();
  toast('Content Pack byl zamknut. Dešifrovaný obsah byl odstraněn z aplikačního stavu.');
}

function requestRemoveContentPack() {
  if (!state.content.activeMeta) return;
  if (state.session?.contentRef?.source === 'pack') {
    toast('Nejdříve ukončete a smažte aktuální pracovní relaci.');
    return;
  }
  state.modal = { type: 'remove-pack' };
  renderModal();
}

async function removeCurrentContentPack() {
  if (state.content.busy) return;
  state.content.busy = true;
  const previousMeta = state.content.activeMeta;
  try {
    await PROVIDERS.content.remove();
    if (previousMeta && state.review.storeAvailable) {
      try { await clearReviewRecords(previousMeta.packId, previousMeta.contentVersion); }
      catch (reviewError) { console.warn('[Maturita Desk] Review cleanup after pack removal failed.', reviewError); }
    }
    state.content.activeMeta = null;
    state.content.unlocked = null;
    state.content.status = 'none';
    state.content.error = '';
    state.runtime.content = validateTopicCollection(TOPICS);
    resetReviewRuntime(true);
    closeDrawer();
    state.mode = null;
    state.screen = 'home';
    render();
    toast('Content Pack i lokální revizní záznamy byly z tohoto zařízení odstraněny.');
  } catch (error) {
    state.content.status = 'error';
    state.content.error = error?.message || 'Content Pack se nepodařilo odstranit.';
    toast('Odstranění Content Packu selhalo.');
  } finally {
    state.content.busy = false;
  }
}

function unlockedContentMetadata() {
  const value = state.content.unlocked?.metadata;
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function guidanceReviewLabel() {
  const declared = String(unlockedContentMetadata().guidanceReviewStatus || '').trim();
  if (!declared) return '';
  const summary = reviewSummary();
  if (summary?.complete) return 'Teacher Guidance · lokální lidská revize dokončena';
  if (summary?.reviewed) return `Teacher Guidance · revize ${summary.reviewed}/${summary.total}`;
  return 'Teacher Guidance · interní revize';
}

async function initializeReviewManager(pack = state.content.unlocked) {
  resetReviewRuntime(false);
  if (!pack?.manifest || !Array.isArray(pack?.topics)) return;
  state.review.items = collectReviewItems(pack.topics);
  if (!state.review.storeAvailable) {
    state.review.status = 'unavailable';
    state.review.error = 'Lokální revizní úložiště není na tomto zařízení dostupné.';
    return;
  }
  state.review.status = 'loading';
  state.review.error = '';
  try {
    const records = await loadReviewRecords(pack.manifest.packId, pack.manifest.version);
    state.review.records = reviewRecordMap(records);
    state.review.status = 'ready';
    ensureReviewSelection();
  } catch (error) {
    console.warn('[Maturita Desk] Pedagogical review store init failed.', error);
    state.review.status = 'error';
    state.review.error = error?.message || 'Revizní záznamy se nepodařilo načíst.';
  }
}

function resetReviewRuntime(clearFilters = false) {
  state.review.status = 'idle';
  state.review.items = [];
  state.review.records = new Map();
  state.review.selectedId = null;
  state.review.busy = false;
  state.review.error = '';
  if (clearFilters) state.review.filters = { priority: 'HIGH', status: 'pending', topic: 'all', kind: 'all', query: '' };
}

function reviewSummary() {
  if (!state.review.items.length) return null;
  return summarizeReview(state.review.items, state.review.records);
}

function filteredReviewItems() {
  return filterReviewItems(state.review.items, state.review.records, state.review.filters);
}

function ensureReviewSelection(preferNext = false) {
  const filtered = filteredReviewItems();
  if (!filtered.length) {
    state.review.selectedId = null;
    return null;
  }
  const currentIndex = filtered.findIndex(item => item.id === state.review.selectedId);
  if (currentIndex >= 0 && !preferNext) return filtered[currentIndex];
  if (currentIndex >= 0 && preferNext) {
    state.review.selectedId = filtered[Math.min(currentIndex + 1, filtered.length - 1)]?.id || filtered[0].id;
    return filtered.find(item => item.id === state.review.selectedId) || filtered[0];
  }
  state.review.selectedId = filtered[0].id;
  return filtered[0];
}

function selectedReviewItem() {
  return state.review.items.find(item => item.id === state.review.selectedId) || ensureReviewSelection();
}

function reviewRecordFor(itemId) {
  return state.review.records.get(String(itemId || '')) || null;
}

function reviewRef() {
  const manifest = state.content.unlocked?.manifest;
  if (!manifest?.packId || !manifest?.version) return null;
  return { packId: manifest.packId, contentVersion: manifest.version };
}

async function saveHumanReview(itemId, status) {
  const item = state.review.items.find(candidate => candidate.id === itemId);
  const ref = reviewRef();
  if (!item || !ref || state.review.status !== 'ready' || state.review.busy) return;
  let guidance;
  let followUp;
  let note = String(document.querySelector('[data-review-note]')?.value || '').trim().slice(0, REVIEW_NOTE_MAX);
  if (status === 'edited') {
    guidance = String(document.querySelector('[data-review-guidance]')?.value || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
    followUp = String(document.querySelector('[data-review-followup]')?.value || '').trim();
    if (!guidance.length) {
      toast('Upravená nápověda musí obsahovat alespoň jeden obsahový bod.');
      return;
    }
  }
  const record = {
    itemId,
    status,
    ...(status === 'edited' ? { guidance, followUp } : {}),
    ...(note ? { note } : {}),
    updatedAt: new Date().toISOString()
  };
  state.review.busy = true;
  try {
    const saved = await saveReviewRecord(ref.packId, ref.contentVersion, record);
    state.review.records.set(itemId, saved);
    toast(status === 'approved' ? 'Položka byla schválena.' : status === 'edited' ? 'Úprava byla uložena jako schválená.' : 'Draft byl odmítnut a zůstává otevřený k náhradě.');
    const filtered = filteredReviewItems();
    const current = filtered.findIndex(candidate => candidate.id === itemId);
    state.review.selectedId = filtered[current + 1]?.id || filtered[0]?.id || null;
  } catch (error) {
    console.warn('[Maturita Desk] Review save failed.', error);
    state.review.error = error?.message || 'Revizní záznam se nepodařilo uložit.';
    toast('Revizní záznam se nepodařilo uložit.');
  } finally {
    state.review.busy = false;
    render();
  }
}

async function resetHumanReview(itemId) {
  const ref = reviewRef();
  if (!ref || !itemId || state.review.busy) return;
  state.review.busy = true;
  try {
    await deleteReviewRecord(ref.packId, ref.contentVersion, itemId);
    state.review.records.delete(itemId);
    state.review.selectedId = itemId;
    toast('Položka byla vrácena do fronty.');
  } catch (error) {
    state.review.error = error?.message || 'Revizní záznam nelze odstranit.';
    toast('Položku se nepodařilo vrátit do fronty.');
  } finally {
    state.review.busy = false;
    render();
  }
}

async function exportReviewPatch() {
  if (!state.content.unlocked || state.review.status !== 'ready' || state.review.busy) return;
  state.review.busy = true;
  try {
    const patch = await createReviewPatch(state.content.unlocked, Array.from(state.review.records.values()), APP_VERSION);
    const date = new Date().toISOString().slice(0, 10);
    const safeVersion = String(patch.contentVersion).replace(/[^A-Za-z0-9._-]/g, '-');
    downloadTextFile(`Maturita-Desk-review-${safeVersion}-${date}.mdreview`, JSON.stringify(patch, null, 2), 'application/json');
    toast(`Revizní patch exportován: ${patch.summary.reviewed}/${patch.totalReviewableItems} položek.`);
  } catch (error) {
    console.warn('[Maturita Desk] Review patch export failed.', error);
    state.review.error = error?.message || 'Revizní patch se nepodařilo exportovat.';
    toast('Revizní patch se nepodařilo exportovat.');
  } finally {
    state.review.busy = false;
    if (state.screen === 'review') render();
  }
}

async function importReviewPatchFile(file) {
  if (!state.content.unlocked || !file || state.review.busy) return;
  if (file.size <= 2 || file.size > 4 * 1024 * 1024) {
    toast('Revizní patch má neplatnou velikost.');
    return;
  }
  const ref = reviewRef();
  if (!ref) return;
  state.review.busy = true;
  try {
    const patch = await parseReviewPatchText(await file.text(), state.content.unlocked);
    const result = await importReviewRecords(ref.packId, ref.contentVersion, patch.records.map(record => ({
      itemId: record.itemId,
      status: record.status,
      guidance: record.guidance,
      followUp: record.followUp,
      note: record.note,
      updatedAt: record.updatedAt
    })));
    state.review.records = reviewRecordMap(await loadReviewRecords(ref.packId, ref.contentVersion));
    ensureReviewSelection();
    toast(`Importováno ${result.imported} revizních záznamů${result.skippedOlder ? `, ${result.skippedOlder} novějších lokálních záznamů zachováno` : ''}.`);
  } catch (error) {
    console.warn('[Maturita Desk] Review patch import failed.', error);
    state.review.error = error?.message || 'Revizní patch se nepodařilo importovat.';
    toast('Revizní patch se nepodařilo importovat.');
  } finally {
    state.review.busy = false;
    render();
  }
}

async function clearAllHumanReview() {
  const ref = reviewRef();
  if (!ref || state.review.busy) return;
  state.review.busy = true;
  try {
    const removed = await clearReviewRecords(ref.packId, ref.contentVersion);
    state.review.records = new Map();
    state.review.selectedId = null;
    ensureReviewSelection();
    toast(`Lokální revize byla vymazána (${removed} záznamů).`);
  } catch (error) {
    state.review.error = error?.message || 'Lokální revizi nelze vymazat.';
    toast('Lokální revizi se nepodařilo vymazat.');
  } finally {
    state.review.busy = false;
    render();
  }
}

function practiceGuidanceState(reviewId, node) {
  const item = state.review.items.find(candidate => candidate.id === reviewId);
  const record = reviewRecordFor(reviewId);
  if (item) return effectiveGuidance(item, record);
  const embedded = String(node?.guidanceMeta?.humanReview || '');
  if (embedded === 'APPROVED') return { status: 'approved', guidance: Array.isArray(node?.guidance) ? node.guidance : [], followUp: String(node?.followUp || ''), note: '' };
  if (embedded === 'EDITED_APPROVED') return { status: 'edited', guidance: Array.isArray(node?.guidance) ? node.guidance : [], followUp: String(node?.followUp || ''), note: '' };
  if (embedded === 'REJECTED_REQUIRES_REPLACEMENT') return { status: 'rejected', guidance: [], followUp: '', note: '' };
  return { status: 'pending', guidance: Array.isArray(node?.guidance) ? node.guidance : [], followUp: String(node?.followUp || ''), note: '' };
}

function downloadTextFile(filename, text, mime = 'text/plain') {
  const blob = new Blob([String(text || '')], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function contentStatusLabel() {
  if (state.content.status === 'unlocked') return `${state.content.activeMeta?.label || 'Content Pack'} · odemčeno`;
  if (state.content.status === 'locked') return `${state.content.activeMeta?.label || 'Content Pack'} · zamčeno`;
  if (state.content.status === 'checking') return 'Content Pack · kontrola…';
  if (state.content.status === 'error') return 'Content Pack · chyba';
  if (state.content.status === 'unavailable') return 'Protected Store · nepodporován';
  return 'Demo Content · synthetic';
}

function usingProtectedContent() {
  return state.content.status === 'unlocked' && Boolean(state.content.unlocked?.manifest);
}

function enforceAuthContentBoundary() {
  const expiry = state.auth.expiresAt ? Date.parse(state.auth.expiresAt) : NaN;
  const validAuth = state.auth.authenticated && (!state.auth.expiresAt || (Number.isFinite(expiry) && expiry > Date.now()));
  if (RUNTIME_CONFIG.mode === 'standalone-local' || validAuth || state.session) return;
  if (state.content.unlocked) {
    state.content.unlocked = null;
    state.content.status = state.content.activeMeta ? 'locked' : 'none';
    state.runtime.content = validateTopicCollection(TOPICS);
    resetReviewRuntime(false);
  }
}

function canUse(capability) {
  if (RUNTIME_CONFIG.configurationError || RUNTIME_CONFIG.mode === 'locked') return false;
  if (RUNTIME_CONFIG.mode === 'standalone-local') return true;
  return RUNTIME_CONFIG.mode === 'school-server' && hasCapability(state.auth, capability);
}


function authStatusLabel() {
  if (RUNTIME_CONFIG.mode === 'locked') return 'Přístup uzamčen · chyba konfigurace';
  if (RUNTIME_CONFIG.mode !== 'school-server') return 'Lokální zařízení · bez centrální identity';
  if (state.auth.status === 'checking') return 'Školní přístup · kontrola…';
  if (state.auth.source === 'offline-lease' && state.auth.authenticated) return 'Školní přístup · offline oprávnění';
  if (state.auth.authenticated) return 'Školní přístup · ověřeno';
  if (state.auth.status === 'unavailable') return 'Školní přístup · server nedostupný';
  if (state.auth.status === 'offline') return 'Školní přístup · offline bez oprávnění';
  return 'Školní přístup · nepřihlášeno';
}

function authStatusClass() {
  if (RUNTIME_CONFIG.mode === 'locked') return 'off';
  if (RUNTIME_CONFIG.mode !== 'school-server') return 'warn';
  if (state.auth.authenticated && state.auth.source !== 'offline-lease') return '';
  if (state.auth.authenticated) return 'warn';
  return 'off';
}

async function handleClick(event) {
  const el = event.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  if (action === 'go-home') return requestLeaveSession('home');
  if (action === 'choose-mode') {
    const requestedMode = el.dataset.mode;
    if (!canUse(requestedMode === 'exam' ? 'exam' : 'practice')) { toast('Tato školní relace nemá oprávnění pro zvolený režim.'); return; }
    if (['locked', 'checking', 'error'].includes(state.content.status)) { toast('Nejdříve odemkněte chráněný Content Pack.'); return; }
    state.mode = requestedMode;
    state.screen = 'topic-select';
    state.drawer = null;
    render();
    return;
  }
  if (action === 'back-home') {
    state.screen = 'home'; state.mode = null; render(); return;
  }
  if (action === 'select-topic') {
    state.topicId = Number(el.dataset.topic);
    state.screen = state.mode === 'exam' ? 'preflight' : 'practice-preflight';
    render(); return;
  }
  if (action === 'back-topics') { state.screen = 'topic-select'; render(); return; }
  if (action === 'start-exam') { startSession('exam', true); return; }
  if (action === 'start-practice') {
    const timed = el.dataset.timed === 'true';
    state.practiceChoice = timed ? 'timed' : 'untimed';
    startSession('practice', timed);
    return;
  }
  if (action === 'view-phase') { setViewPhase(el.dataset.phase); return; }
  if (action === 'return-active') { setViewPhase(state.session?.activePhase); return; }
  if (action === 'transition') { requestTransition(el.dataset.next); return; }
  if (action === 'finish-session') { requestFinish(); return; }
  if (action === 'open-notes') {
    state.drawer = 'notes';
    state.notesTab = state.session?.viewPhase || state.session?.activePhase || 'topic';
    renderDrawer(); return;
  }
  if (action === 'open-fact') { state.drawer = 'fact'; renderDrawer(); return; }
  if (action === 'open-content') { state.drawer = 'content'; renderDrawer(); return; }
  if (action === 'open-access') { state.drawer = 'access'; renderDrawer(); return; }
  if (action === 'open-pilot') { state.drawer = 'pilot'; state.pilot.device = capturePilotDevice(); savePilotRun(); renderDrawer(); return; }
  if (action === 'pilot-mark') { updatePilotCheck(el.dataset.pilotId, el.dataset.status, Array.from(document.querySelectorAll('[data-pilot-note]')).find(node => node.dataset.pilotNote === (el.dataset.pilotId || ''))?.value || ''); renderDrawer(); return; }
  if (action === 'pilot-export-json') { downloadTextFile(`Maturita-Desk-Stage13-pilot-${new Date().toISOString().slice(0,10)}.json`, serializePilotReport(state.pilot), 'application/json'); return; }
  if (action === 'pilot-export-txt') { downloadTextFile(`Maturita-Desk-Stage13-pilot-${new Date().toISOString().slice(0,10)}.txt`, pilotReportText(state.pilot)); return; }
  if (action === 'pilot-reset') { state.pilot = createPilotRun({ appVersion: APP_VERSION, device: capturePilotDevice() }); savePilotRun(); renderDrawer(); return; }
  if (action === 'session-takeover') { takeOverSession(); return; }
  if (action === 'auth-refresh') { await refreshAuthState(); return; }
  if (action === 'auth-login') {
    const url = PROVIDERS.auth.loginUrl?.() || '';
    if (!url) { toast('Přihlašovací adresa není nakonfigurována.'); return; }
    globalThis.location?.assign?.(url);
    return;
  }
  if (action === 'auth-logout') {
    if (state.session) { toast('Nejdříve ukončete pracovní relaci.'); return; }
    state.auth = await PROVIDERS.auth.logout();
    PROVIDERS.setAuthState(state.auth);
    enforceAuthContentBoundary();
    state.runtime.factCheck = currentFactCheckAvailability();
    render();
    toast(state.auth.status === 'signed-out' ? 'Školní relace byla potvrzeně ukončena.' : (state.auth.error || 'Server nepotvrdil odhlášení.'));
    return;
  }
  if (action === 'content-sync-server') { await syncContentPackFromSchoolServer(); return; }
  if (action === 'open-review') {
    if (!canUse('review')) { toast('Tato školní relace nemá oprávnění k pedagogické revizi.'); return; }
    if (!state.content.unlocked) { toast('Nejdříve odemkněte Content Pack.'); return; }
    if (state.session) { toast('Pedagogickou revizi nelze otevřít během zkoušky nebo nácviku.'); return; }
    if (state.review.status === 'idle') await initializeReviewManager(state.content.unlocked);
    if (state.review.status !== 'ready') { toast(state.review.error || 'Revizní režim není na tomto zařízení dostupný.'); return; }
    closeDrawer();
    state.screen = 'review';
    ensureReviewSelection();
    render();
    return;
  }
  if (action === 'review-back') { state.screen = 'home'; state.mode = null; render(); return; }
  if (action === 'review-select') { state.review.selectedId = el.dataset.reviewId || null; render(); return; }
  if (action === 'review-topic') { state.review.filters.topic = el.dataset.topic || 'all'; state.review.filters.status = 'pending'; ensureReviewSelection(); render(); return; }
  if (action === 'review-approve') { await saveHumanReview(el.dataset.reviewId, 'approved'); return; }
  if (action === 'review-save-edit') { await saveHumanReview(el.dataset.reviewId, 'edited'); return; }
  if (action === 'review-reject') { await saveHumanReview(el.dataset.reviewId, 'rejected'); return; }
  if (action === 'review-reset') { await resetHumanReview(el.dataset.reviewId); return; }
  if (action === 'review-export') { await exportReviewPatch(); return; }
  if (action === 'review-import-trigger') { document.querySelector('[data-review-patch-file]')?.click(); return; }
  if (action === 'review-clear') { state.modal = { type: 'clear-review' }; renderModal(); return; }
  if (action === 'content-import-trigger') { document.querySelector('[data-content-pack-file]')?.click(); return; }
  if (action === 'content-unlock' || action === 'resume-unlock') { unlockActiveContentPack(); return; }
  if (action === 'content-lock') { lockContentPack(); return; }
  if (action === 'content-remove') { requestRemoveContentPack(); return; }
  if (action === 'resume-discard') { requestLeaveSession('home'); return; }
  if (action === 'close-drawer') { closeDrawer(); return; }
  if (action === 'clear-note') { requestClearNote(el.dataset.phase); return; }
  if (action === 'notes-tab') { state.notesTab = el.dataset.phase; renderDrawer(); return; }
  if (action === 'cycle-theme') { cycleTheme(); return; }
  if (action === 'apply-update') { applyPendingUpdate(); return; }
  if (action === 'picture-view') { state.pictureView = el.dataset.view; renderConsoleContent(); return; }
  if (action === 'lightbox') { openLightboxByRef(el.dataset.imageGroup, el.dataset.imageId); return; }
  if (action === 'close-lightbox') { closeLightbox(); return; }
  if (action === 'new-topic') { requestLeaveSession('topic-select'); return; }
  if (action === 'finish-home') { requestLeaveSession('home'); return; }
  if (action === 'fact-access-save') {
    const input = document.querySelector('[data-fact-access-token]');
    const token = String(input?.value || '').trim();
    if (token.length < 32) { toast('Přístupový kód musí mít alespoň 32 znaků.'); return; }
    if (!saveFactAccessToken(token)) { toast('Přístupový kód se nepodařilo uložit pro tuto relaci prohlížeče.'); return; }
    state.runtime.factCheck = currentFactCheckAvailability();
    toast('Přístup pro Ověřit / dohledat je aktivní pro tuto relaci prohlížeče.');
    renderDrawer();
    return;
  }
  if (action === 'fact-access-clear') {
    clearFactAccessToken();
    state.runtime.factCheck = currentFactCheckAvailability();
    toast('Přístupový kód pro Ověřit / dohledat byl z této relace odstraněn.');
    renderDrawer();
    return;
  }
  if (action === 'fact-submit') { await submitFactCheck(); return; }
  if (action === 'fact-cancel') { cancelFactCheck(false); return; }
  if (action === 'fact-clear') { resetFactCheck(); renderDrawer(); return; }
}

function handleChange(event) {
  const el = event.target;
  if (el.matches('[data-content-pack-file]')) {
    const file = el.files?.[0];
    if (file) importContentPackFile(file);
    el.value = '';
    return;
  }
  if (el.matches('[data-review-patch-file]')) {
    const file = el.files?.[0];
    if (file) importReviewPatchFile(file);
    el.value = '';
    return;
  }
  if (el.matches('[data-review-filter]')) {
    const key = el.dataset.reviewFilter;
    if (key && Object.hasOwn(state.review.filters, key)) state.review.filters[key] = el.value;
    state.review.selectedId = null;
    ensureReviewSelection();
    render();
    return;
  }
  if (el.matches('[data-section-select]')) {
    if (state.session) {
      setSectionState(state.session, el.value);
      saveSession();
      renderConsoleContent();
    }
  }
}

function handleInput(event) {
  const el = event.target;
  if (el.matches('[data-notes-input]')) {
    const phase = el.dataset.phase;
    if (!state.session?.notes || !phase) return;
    setNoteState(state.session, phase, el.value);
    if (el.value !== state.session.notes[phase]) el.value = state.session.notes[phase];
    const saved = saveSession({ broadcast: false });
    state.notesSavedAt = saved ? Date.now() : 0;
    updateNotesSaveStatus(phase);
    updateNoteIndicators();
    if (!saved) toast('Poznámku se nepodařilo uložit. Neobnovujte stránku, dokud úložiště nebude dostupné.');
  }
  if (el.matches('[data-fact-query]')) {
    state.factQuery = String(el.value || '').slice(0, FACT_CHECK_MAX_QUERY);
    if (el.value !== state.factQuery) el.value = state.factQuery;
    const counter = document.querySelector('[data-fact-counter]');
    if (counter) counter.textContent = `${state.factQuery.length} / ${FACT_CHECK_MAX_QUERY}`;
    if (state.factState === 'error') { state.factState = 'idle'; state.factError = ''; }
  }
}

function handleModalClick(event) {
  const el = event.target.closest('[data-modal-action]');
  if (!el) return;
  const action = el.dataset.modalAction;
  if (action === 'cancel') { state.modal = null; renderModal(); return; }
  if (action === 'confirm-transition') {
    const next = state.modal?.next;
    state.modal = null;
    renderModal();
    transitionPhase(next);
    return;
  }
  if (action === 'confirm-finish') {
    state.modal = null;
    renderModal();
    finishSession();
    return;
  }
  if (action === 'confirm-remove-pack') {
    state.modal = null;
    renderModal();
    removeCurrentContentPack();
    return;
  }
  if (action === 'confirm-clear-note') {
    const phase = state.modal?.phase;
    state.modal = null;
    renderModal();
    clearNote(phase);
    return;
  }
  if (action === 'confirm-clear-review') {
    state.modal = null;
    renderModal();
    clearAllHumanReview();
    return;
  }
  if (action === 'discard') {
    const destination = state.modal?.destination || 'home';
    state.modal = null;
    clearSession();
    state.drawer = null;
    state.screen = destination;
    state.restored = false;
    if (destination === 'home') state.mode = null;
    renderModal();
    render();
  }
}

function startSession(mode, timed) {
  const capability = mode === 'exam' ? 'exam' : 'practice';
  if (!canUse(capability)) {
    toast('Aktuální přístup už neumožňuje zahájit tuto relaci. Ověřte školní přihlášení.');
    return;
  }
  const topic = getTopic();
  const check = validateTopic(topic, mode);
  if (!check.ok) {
    toast('Téma není kompletní. Zkoušku nelze bezpečně zahájit.');
    return;
  }
  if (state.runtime.storage !== 'ready') {
    toast('Úložiště relace není dostupné. Zkoušku nelze bezpečně zahájit.');
    return;
  }
  if (mode === 'exam' && usingProtectedContent() && state.runtime.shell !== 'ready') {
    toast('Offline shell ještě není připravený. Před ostrou zkouškou vyčkejte na dokončení PWA cache.');
    return;
  }
  const firstSectionId = mode === 'exam' ? topic.exam.topic.sections[0].id : topic.practice.sections[0].id;
  const contentRef = currentContentRef();
  const nextSession = createSession({
    mode,
    topicId: topic.id,
    topicTitle: contentRef.source === 'pack' ? '' : topic.title,
    timed,
    firstSectionId,
    contentRef
  });
  const ownership = claimSessionOwnership(localStorage, { instanceId: INSTANCE_ID, sessionId: nextSession.id });
  if (!ownership.ok) {
    state.runtime.sessionLock = 'conflict';
    pilotEvent('session.start-blocked', { reason: ownership.reason || 'owned-by-other' });
    toast('Jiný panel nebo okno Maturita Desk má aktivní relaci. Novou zkoušku zde nespouštím.');
    return;
  }
  state.runtime.sessionLock = 'owned';
  state.session = nextSession;
  pilotEvent('session.started', { mode, timed: Boolean(timed), contentSource: contentRef.source });
  state.screen = 'console';
  state.drawer = null;
  state.pictureView = 'A';
  state.restored = false;
  state.factQuery = '';
  state.factState = 'idle';
  state.notesSavedAt = Date.now();
  saveSession();
  broadcastSessionPresence();
  requestWakeLock();
  render();
}

function setViewPhase(phase) {
  if (!state.session || !phase) return;
  if (!setViewPhaseState(state.session, phase)) return;
  if (phase === 'topic' && !state.session.activeSectionId) {
    const topic = getTopic();
    const sections = state.session.mode === 'exam' ? topic.exam.topic.sections : topic.practice.sections;
    setSectionState(state.session, sections[0]?.id || null);
  }
  saveSession();
  renderConsoleContent();
  updatePhaseNavigation();
  updateTimers();
}

function requestTransition(next) {
  const s = state.session;
  if (!s || s.status !== 'running') return;
  const phases = PHASES[s.mode];
  const index = phases.indexOf(s.activePhase);
  if (index < 0 || phases[index + 1] !== next) return;
  state.modal = { type: 'transition', next, from: s.activePhase };
  renderModal();
}

function requestFinish() {
  const s = state.session;
  if (!s || s.status !== 'running') return;
  state.modal = { type: 'finish' };
  renderModal();
}

function transitionPhase(next) {
  const s = state.session;
  if (!s) return;
  const result = transitionSession(s, next);
  if (!result.ok) return;
  if (next === 'topic') {
    const topic = getTopic();
    const sections = s.mode === 'exam' ? topic.exam.topic.sections : topic.practice.sections;
    setSectionState(s, sections[0]?.id || null);
  }
  saveSession();
  render();
}

function finishSession() {
  const s = state.session;
  if (!s) return;
  const result = finishSessionState(s);
  if (!result.ok) return;
  saveSession();
  const summary = getTimingSummary(s);
  pilotMetric('session.lastFinished', { mode: s.mode, totalSeconds: summary.total, timed: Boolean(s.timed) });
  pilotEvent('session.finished', { mode: s.mode, totalSeconds: summary.total });
  releaseSessionOwnership(localStorage, { instanceId: INSTANCE_ID, sessionId: s.id });
  state.runtime.sessionLock = 'idle';
  releaseWakeLock();
  state.screen = 'finished';
  state.drawer = null;
  render();
}

function requestLeaveSession(destination) {
  if (!state.session) {
    state.screen = destination;
    if (destination === 'home') state.mode = null;
    render();
    return;
  }
  if (hasNotes()) {
    state.modal = { type: 'discard', destination };
    renderModal();
    return;
  }
  clearSession();
  state.screen = destination;
  if (destination === 'home') state.mode = null;
  render();
}

function hasNotes() {
  const s = state.session;
  if (!s) return false;
  return hasAnyNote(s.notes, PHASES[s.mode]);
}

function requestClearNote(phase) {
  if (!state.session || !PHASES[state.session.mode].includes(phase) || !hasNote(state.session.notes, phase)) return;
  state.modal = { type: 'clear-note', phase };
  renderModal();
}

function clearNote(phase) {
  if (!state.session || !PHASES[state.session.mode].includes(phase)) return;
  setNoteState(state.session, phase, '');
  const saved = saveSession({ broadcast: false });
  state.notesSavedAt = saved ? Date.now() : 0;
  if (state.drawer === 'notes') renderDrawer();
  updateNoteIndicators();
  toast(saved ? 'Poznámka byla smazána.' : 'Poznámka byla smazána jen v paměti; lokální úložiště není dostupné.');
}

function currentTopics() {
  if (state.session?.contentRef?.source === 'pack') {
    if (!state.content.unlocked || state.content.unlocked.manifest.packId !== state.session.contentRef.packId) return [];
    return state.content.unlocked.topics;
  }
  if (!state.session && state.content.status === 'unlocked' && state.content.unlocked?.topics) return state.content.unlocked.topics;
  return TOPICS;
}

function currentContentRef() {
  if (state.content.status === 'unlocked' && state.content.unlocked?.manifest) {
    return { source: 'pack', packId: state.content.unlocked.manifest.packId, version: state.content.unlocked.manifest.version };
  }
  return { source: 'demo', packId: null, version: null };
}

function getTopic() {
  const topics = currentTopics();
  return topics.find(t => t.id === Number(state.topicId)) || topics[0] || null;
}

function getElapsedForPhase(phase) { return getPhaseElapsed(state.session, phase); }
function getTotalElapsedNow() { return getTotalElapsed(state.session); }
function getTotalTargetNow() { return getTotalTarget(state.session); }

function render() {
  closeDrawer(false);
  syncRootRuntimeFlags();
  switch (state.screen) {
    case 'topic-select': app.innerHTML = renderTopicSelect(); break;
    case 'preflight': app.innerHTML = renderExamPreflight(); break;
    case 'practice-preflight': app.innerHTML = renderPracticePreflight(); break;
    case 'console': app.innerHTML = renderConsole(); break;
    case 'finished': app.innerHTML = renderFinished(); break;
    case 'resume-locked': app.innerHTML = renderResumeLocked(); break;
    case 'session-conflict': app.innerHTML = renderSessionConflict(); break;
    case 'review': app.innerHTML = renderReviewScreen(); break;
    default: app.innerHTML = renderHome();
  }
  renderModal();
  if (state.screen === 'console') updateTimers();
  updateConnectivity();
}

function renderHome() {
  const conn = state.online ? 'Online' : 'Offline';
  const connDot = state.online ? '' : 'off';
  const contentBlocked = ['locked', 'checking', 'error'].includes(state.content.status);
  const examBlocked = contentBlocked || !canUse('exam');
  const practiceBlocked = contentBlocked || !canUse('practice');
  const protectedActive = usingProtectedContent();
  const contentClass = protectedActive ? '' : state.content.status === 'locked' ? 'warn' : state.content.status === 'error' ? 'off' : 'warn';
  return `
    <main class="home-page">
      <div class="home-topline">
        ${brandLockup()}
        <div style="display:flex;gap:8px;align-items:center">
          <button class="soft-button compact" data-action="open-access">Přístup</button>
          <button class="soft-button compact" data-action="open-content">Content Pack</button>
          <button class="soft-button compact" data-action="open-pilot">Pilot</button>
          <span class="prototype-pill">${PILOT_INTERNAL_REVIEW ? 'Stage 13R · Interní revize reálného obsahu' : 'Stage 13R · Serverless candidate / synthetic pilot'}</span>
          <button class="icon-button" data-action="cycle-theme" aria-label="Změnit vzhled" title="Vzhled: ${escapeHtml(state.theme)}">${icon('theme')}</button>
        </div>
      </div>
      <section class="home-hero">
        <p class="eyebrow">Examiner workspace</p>
        <h1 class="hero-title">Maturita<br>Desk</h1>
        <p class="hero-subtitle">Ústní zkouška z anglického jazyka. Klidné pracovní prostředí pro zkoušejícího a přísedícího – na iPadu, telefonu i počítači.</p>
        <div class="pilot-safety"><strong>${PILOT_INTERNAL_REVIEW ? 'Interní lokální revize: CONFIDENTIAL-EXAM je povolen pouze na localhostu.' : 'Veřejný Stage 13R build je pouze pro syntetická data.'}</strong><span>${PILOT_INTERNAL_REVIEW ? 'Reálný maturitní Content Pack zůstává šifrovaný a nesmí být nahrán na GitHub ani sdílen se studenty. Tato lokální varianta slouží k interní obsahové a UX revizi.' : 'CONFIDENTIAL-EXAM Content Pack je v této verzi záměrně zablokovaný. Pilot měří zařízení, lifecycle, offline režim, PWA update a souběh panelů.'}</span></div>
        ${RUNTIME_CONFIG.configurationLoadError ? `<div class="safety-block runtime-fallback-warning"><strong>Runtime konfigurace nebyla načtena ze sítě.</strong><span>Aplikace používá release-pinned baked profil (${escapeHtml(RUNTIME_CONFIG.mode)} / ${escapeHtml(RUNTIME_CONFIG.environmentId)}). Kód chyby: ${escapeHtml(RUNTIME_CONFIG.configurationLoadError)}. Před ostrým použitím na školním serveru ověřte deployment.</span></div>` : ''}
        <div class="secure-content-strip ${protectedActive ? 'unlocked' : state.content.status}">
          <div>
            <span class="secure-kicker">Protected Content</span>
            <strong>${escapeHtml(contentStatusLabel())}</strong>
            <p>${protectedActive ? `${state.content.activeMeta.topicCount}/20 témat · v${escapeHtml(state.content.activeMeta.contentVersion)} · dešifrovaný obsah pouze v paměti` : state.content.status === 'locked' ? 'Ostrý obsah je na zařízení uložen pouze šifrovaně. Před použitím jej odemkněte.' : state.content.status === 'none' || state.content.status === 'unavailable' ? 'Aplikace nyní používá pouze syntetickou demonstrační sadu.' : escapeHtml(state.content.error || 'Kontrola chráněného obsahu.')}</p>
          </div>
          <button class="soft-button" data-action="open-content">${state.content.status === 'locked' ? 'Odemknout' : protectedActive ? 'Spravovat' : 'Spravovat obsah'}</button>
        </div>
        <div class="mode-grid">
          <button class="mode-card exam" data-action="choose-mode" data-mode="exam" ${examBlocked ? 'disabled aria-disabled="true"' : ''}>
            <span class="mode-kicker">15 minut · 2 / 4 / 9</span>
            <h2>Ostrá zkouška</h2>
            <p>${protectedActive ? 'Chráněný maturitní obsah je odemčený. Řízený průběh, časomíra, učitelské vrstvy a poznámky.' : 'Syntetický demo režim pro bezpečné testování workflow bez ostrých zadání.'}</p>
            <span class="mode-arrow" aria-hidden="true">→</span>
          </button>
          <button class="mode-card practice" data-action="choose-mode" data-mode="practice" ${practiceBlocked ? 'disabled aria-disabled="true"' : ''}>
            <span class="mode-kicker">Teacher guidance</span>
            <h2>Nácvik</h2>
            <p>${protectedActive ? 'Cvičný materiál z aktivního Content Packu s rozšířenou učitelskou vrstvou.' : 'Syntetická demonstrace cvičného materiálu a Teacher Guidance.'}</p>
            <span class="mode-arrow" aria-hidden="true">→</span>
          </button>
        </div>
        <div class="home-status">
          <button class="status-item status-button" data-action="open-access"><span class="status-dot ${authStatusClass()}"></span>${escapeHtml(authStatusLabel())}</button>
          <button class="status-item status-button" data-action="open-content"><span class="status-dot ${contentClass}"></span>${escapeHtml(contentStatusLabel())}</button>
          <span class="status-item"><span class="status-dot ${state.runtime.shell === 'ready' ? '' : state.runtime.shell === 'checking' ? 'warn' : 'off'}"></span>Offline shell · ${runtimeShellLabel()}</span>
          <span class="status-item"><span class="status-dot ${state.runtime.storage === 'ready' ? '' : 'off'}"></span>Obnova relace · ${state.runtime.storage === 'ready' ? 'ready' : 'nedostupná'}</span>
          <span class="status-item" data-wake-status><span class="status-dot ${state.runtime.wakeLock === 'active' ? '' : state.runtime.wakeLock === 'denied' ? 'warn' : 'off'}"></span>Displej · ${wakeLockLabel()}</span>
          <span class="status-item" data-device-status><span class="status-dot"></span>${escapeHtml(deviceStatusLabel())}</span>
          <span class="status-item" data-connectivity><span class="status-dot ${connDot}"></span>${conn}</span>
          ${state.runtime.update === 'ready' ? '<button class="status-item status-button update-ready" data-action="apply-update"><span class="status-dot warn"></span>Aktualizace · připravena</button>' : ''}
          ${factCheckStatusItem()}
        </div>
      </section>
      ${footer()}
    </main>`;
}

function renderReviewScreen() {
  const pack = state.content.unlocked;
  if (!pack?.manifest || state.review.status !== 'ready') {
    return `
      <main class="page-shell review-page">
        <div class="content-frame narrow-frame">
          <div class="page-topline"><button class="back-button" data-action="review-back">${icon('back')} <span>Úvod</span></button><span class="prototype-pill">Pedagogická revize</span></div>
          <section class="unlock-resume-card"><p class="eyebrow">Review Mode</p><h1>Revizní režim není připraven</h1><p>${escapeHtml(state.review.error || 'Nejdříve odemkněte chráněný Content Pack.')}</p><button class="primary-button" data-action="review-back">Zpět na úvod</button></section>
        </div>
      </main>`;
  }
  const summary = reviewSummary();
  const filtered = filteredReviewItems();
  const selected = selectedReviewItem();
  const record = selected ? reviewRecordFor(selected.id) : null;
  const effective = selected ? effectiveGuidance(selected, record) : null;
  const reviewedPct = summary?.total ? Math.round((summary.reviewed / summary.total) * 100) : 0;
  const topicOptions = state.content.unlocked.topics.map(topic => `<option value="${topic.id}" ${String(state.review.filters.topic) === String(topic.id) ? 'selected' : ''}>${topicNumber(topic)} · ${escapeHtml(topic.title)}</option>`).join('');
  return `
    <main class="page-shell review-page">
      <div class="review-shell">
        <div class="page-topline review-topline">
          <button class="back-button" data-action="review-back">${icon('back')} <span>Úvod</span></button>
          <div class="review-top-actions">
            <span class="prototype-pill">Content ${escapeHtml(pack.manifest.version)}</span>
            <button class="soft-button compact" data-action="review-export" ${state.review.busy || !summary.reviewed ? 'disabled' : ''}>Exportovat .mdreview</button>
            <input type="file" data-review-patch-file accept=".mdreview,application/json" hidden>
            <button class="soft-button compact" data-action="review-import-trigger" ${state.review.busy ? 'disabled' : ''}>Importovat revizi</button>
          </div>
        </div>
        <header class="review-header">
          <div>
            <p class="eyebrow">Pedagogical Review</p>
            <h1>Teacher Guidance</h1>
            <p>Revize se ukládá lokálně odděleně od šifrovaného Content Packu. Samotný <code>.mdesk</code> se tím nemění.</p>
          </div>
          <div class="review-progress-card">
            <div class="review-progress-number"><strong>${summary.reviewed}</strong><span>/ ${summary.total}</span></div>
            <div class="review-progress-bar"><span style="width:${reviewedPct}%"></span></div>
            <p>${reviewedPct}% zkontrolováno · ${summary.highPending} HIGH zbývá · ${summary.rejected} odmítnuto</p>
          </div>
        </header>
        <section class="review-summary-grid">
          <div><span>Čeká</span><strong>${summary.pending}</strong></div>
          <div><span>Schváleno</span><strong>${summary.approved}</strong></div>
          <div><span>Upraveno</span><strong>${summary.edited}</strong></div>
          <div class="${summary.rejected ? 'review-alert-stat' : ''}"><span>Odmítnuto</span><strong>${summary.rejected}</strong></div>
        </section>
        <section class="review-topic-progress" aria-label="Průběh podle témat">
          <button class="review-topic-chip ${state.review.filters.topic === 'all' ? 'active' : ''}" data-action="review-topic" data-topic="all"><strong>ALL</strong><span>${summary.reviewed}/${summary.total}</span></button>
          ${state.content.unlocked.topics.map(topic => {
            const item = summary.byTopic[String(topic.id)] || { reviewed: 0, total: 0, rejected: 0 };
            return `<button class="review-topic-chip ${String(state.review.filters.topic) === String(topic.id) ? 'active' : ''} ${item.rejected ? 'has-rejected' : ''}" data-action="review-topic" data-topic="${escapeHtml(String(topic.id))}" title="${escapeHtml(topic.title)}"><strong>${topicNumber(topic)}</strong><span>${item.reviewed}/${item.total}</span></button>`;
          }).join('')}
        </section>
        <section class="review-filter-bar">
          <label><span>Priorita</span><select data-review-filter="priority"><option value="HIGH" ${state.review.filters.priority === 'HIGH' ? 'selected' : ''}>HIGH nejdřív</option><option value="NORMAL" ${state.review.filters.priority === 'NORMAL' ? 'selected' : ''}>NORMAL</option><option value="all" ${state.review.filters.priority === 'all' ? 'selected' : ''}>Všechny</option></select></label>
          <label><span>Stav</span><select data-review-filter="status"><option value="pending" ${state.review.filters.status === 'pending' ? 'selected' : ''}>Čeká na revizi</option><option value="reviewed" ${state.review.filters.status === 'reviewed' ? 'selected' : ''}>Zkontrolované</option><option value="approved" ${state.review.filters.status === 'approved' ? 'selected' : ''}>Schválené</option><option value="edited" ${state.review.filters.status === 'edited' ? 'selected' : ''}>Upravené</option><option value="rejected" ${state.review.filters.status === 'rejected' ? 'selected' : ''}>Odmítnuté</option><option value="all" ${state.review.filters.status === 'all' ? 'selected' : ''}>Všechny</option></select></label>
          <label><span>Téma</span><select data-review-filter="topic"><option value="all">Všechna témata</option>${topicOptions}</select></label>
          <label><span>Typ</span><select data-review-filter="kind"><option value="all" ${state.review.filters.kind === 'all' ? 'selected' : ''}>Otázky + Task</option><option value="question" ${state.review.filters.kind === 'question' ? 'selected' : ''}>Topic otázky</option><option value="task" ${state.review.filters.kind === 'task' ? 'selected' : ''}>Task Box</option></select></label>
          <div class="review-filter-count"><strong>${filtered.length}</strong><span>ve frontě</span></div>
        </section>
        ${state.review.error ? `<div class="safety-block"><strong>Revizní režim vyžaduje pozornost.</strong><span>${escapeHtml(state.review.error)}</span></div>` : ''}
        ${summary.complete ? `<div class="review-complete-banner"><strong>Lokální revize je kompletní.</strong><span>Všechny položky jsou schválené nebo upravené. Exportujte <code>.mdreview</code>; teprve jeho aplikace v soukromém pipeline může vytvořit pedagogicky zkontrolovaný Content Pack.</span></div>` : ''}
        <div class="review-workspace">
          <aside class="review-queue" aria-label="Revizní fronta">
            <div class="review-queue-head"><strong>Fronta</strong><span>HIGH → NORMAL</span></div>
            <div class="review-queue-list">
              ${filtered.length ? filtered.map(item => renderReviewQueueItem(item)).join('') : `<div class="review-empty"><strong>V tomto filtru nic nezbývá.</strong><p>Změňte filtr nebo pokračujte další prioritou.</p></div>`}
            </div>
          </aside>
          <section class="review-detail">
            ${selected ? renderReviewDetail(selected, record, effective) : `<div class="review-empty detail"><strong>Žádná položka není vybraná.</strong><p>V aktuálním filtru nejsou položky nebo je revize dokončena.</p></div>`}
          </section>
        </div>
        <div class="review-footer-actions">
          <div><strong>Lokální pracovní data revize</strong><p>Neobsahují jméno studenta. Do revizní poznámky nevkládejte žádné osobní údaje.</p></div>
          <button class="text-danger-button" data-action="review-clear" ${state.review.busy || !summary.reviewed ? 'disabled' : ''}>Vymazat lokální revizi</button>
        </div>
        ${footer()}
      </div>
    </main>`;
}

function renderReviewQueueItem(item) {
  const record = reviewRecordFor(item.id);
  const status = record?.status || 'pending';
  const statusLabel = status === 'approved' ? 'schváleno' : status === 'edited' ? 'upraveno' : status === 'rejected' ? 'odmítnuto' : 'čeká';
  return `<button class="review-queue-item ${state.review.selectedId === item.id ? 'active' : ''} status-${status}" data-action="review-select" data-review-id="${escapeHtml(item.id)}">
    <div class="review-queue-meta"><span class="review-priority-badge ${item.priority.toLowerCase()}">${item.priority}</span><span>${item.kind === 'task' ? 'TASK' : 'TOPIC'}</span><span>${item.position}</span></div>
    <strong>${String(item.topicId).padStart(2, '0')} · ${escapeHtml(item.contextLabel)}</strong>
    <p>${escapeHtml(item.prompt)}</p>
    <span class="review-queue-status">${statusLabel}</span>
  </button>`;
}

function renderReviewDetail(item, record, effective) {
  const status = record?.status || 'pending';
  const statusLabel = status === 'approved' ? 'Schváleno beze změny' : status === 'edited' ? 'Upraveno a schváleno' : status === 'rejected' ? 'Draft odmítnut' : 'Čeká na lidskou revizi';
  const editorGuidance = (effective?.status === 'rejected' ? item.originalGuidance : effective?.guidance || item.originalGuidance).join('\n');
  const editorFollow = effective?.status === 'rejected' ? item.originalFollowUp : (effective?.followUp ?? item.originalFollowUp);
  const note = record?.note || '';
  const basis = Array.isArray(item.basis) ? item.basis : item.basis ? [String(item.basis)] : [];
  return `
    <div class="review-detail-head">
      <div><span class="review-priority-badge ${item.priority.toLowerCase()}">${item.priority}</span><span class="review-kind">${item.kind === 'task' ? 'Practice Task Box' : 'Practice Topic Question'}</span></div>
      <span class="review-current-status status-${status}">${statusLabel}</span>
    </div>
    <p class="review-location">Téma ${String(item.topicId).padStart(2, '0')} · ${escapeHtml(item.topicTitle)} · ${escapeHtml(item.contextLabel)}</p>
    <article class="review-source-card">
      <span>Student prompt</span>
      <h2>${escapeHtml(item.prompt)}</h2>
    </article>
    <div class="review-columns">
      <section class="review-draft-card">
        <div class="review-card-title"><strong>Aktuální draft</strong><span>${item.priority === 'HIGH' ? 'vyžaduje přednostní kontrolu' : 'standardní kontrola'}</span></div>
        ${item.originalGuidance.length ? `<ul>${item.originalGuidance.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul>` : '<p>Bez návrhu nápovědy.</p>'}
        ${item.originalFollowUp ? `<div class="review-followup-preview"><strong>Follow-up</strong><span>${escapeHtml(item.originalFollowUp)}</span></div>` : ''}
      </section>
      <section class="review-evidence-card">
        <div class="review-card-title"><strong>Opora draftu</strong><span>${item.matchScore !== null ? `match ${item.matchScore.toFixed(3)}` : 'scaffold'}</span></div>
        ${basis.length ? `<ul>${basis.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul>` : '<p>Bez explicitní zdrojové vazby.</p>'}
        ${item.sourceMatches.length ? `<details class="review-source-matches"><summary>Zdrojové shody (${item.sourceMatches.length})</summary><div>${item.sourceMatches.slice(0, 5).map(match => `<p><strong>${escapeHtml(match.prompt || match.sourceType || 'source')}</strong>${Number.isFinite(Number(match.score)) ? `<span>score ${Number(match.score).toFixed(3)}</span>` : ''}</p>`).join('')}</div></details>` : ''}
      </section>
    </div>
    <section class="review-editor-card">
      <div class="review-card-title"><strong>Lidská revize</strong><span>Jeden obsahový bod na jeden řádek</span></div>
      <label><span>Návodná odpověď / obsahové body</span><textarea data-review-guidance rows="7" spellcheck="true">${escapeHtml(editorGuidance)}</textarea></label>
      <label><span>Follow-up</span><textarea data-review-followup rows="3" spellcheck="true">${escapeHtml(editorFollow)}</textarea></label>
      <label><span>Interní poznámka k revizi <small>(max. ${REVIEW_NOTE_MAX} znaků; bez údajů o studentech)</small></span><textarea data-review-note rows="2" maxlength="${REVIEW_NOTE_MAX}" spellcheck="true">${escapeHtml(note)}</textarea></label>
      <div class="review-decision-row">
        <button class="review-decision approve" data-action="review-approve" data-review-id="${escapeHtml(item.id)}" ${state.review.busy ? 'disabled' : ''}>✓ Schválit beze změny</button>
        <button class="review-decision edit" data-action="review-save-edit" data-review-id="${escapeHtml(item.id)}" ${state.review.busy ? 'disabled' : ''}>Uložit úpravu a schválit</button>
        <button class="review-decision reject" data-action="review-reject" data-review-id="${escapeHtml(item.id)}" ${state.review.busy ? 'disabled' : ''}>Odmítnout draft</button>
        ${record ? `<button class="soft-button" data-action="review-reset" data-review-id="${escapeHtml(item.id)}" ${state.review.busy ? 'disabled' : ''}>Vrátit do fronty</button>` : ''}
      </div>
      <p class="review-decision-help">„Odmítnout“ není schválení. Taková položka zůstává překážkou finálního pedagogického gate, dokud není nahrazena použitelnou úpravou.</p>
    </section>`;
}

function renderResumeLocked() {
  const s = state.session;
  const meta = state.content.activeMeta;
  const hasMatchingPack = meta && s?.contentRef?.source === 'pack' && meta.packId === s.contentRef.packId && meta.contentVersion === s.contentRef.version;
  return `
    <main class="page-shell protected-resume-page">
      <div class="content-frame narrow-frame">
        <div class="page-topline">${brandLockup()}<span class="prototype-pill">Obnova relace · obsah zamčen</span></div>
        <section class="unlock-resume-card">
          <div class="lock-emblem" aria-hidden="true">${icon('lock')}</div>
          <p class="eyebrow">Protected Content</p>
          <h1>Odemkněte Content Pack</h1>
          <p>Čas a anonymní pracovní poznámky byly obnoveny z lokální session, ale ostrý maturitní obsah se po reloadu z bezpečnostních důvodů neukládá v dešifrované podobě.</p>
          <div class="resume-meta">
            <span>Téma <strong>${String(s?.topicId || '').padStart(2, '0')}</strong></span>
            <span>${s?.status === 'running' ? 'Probíhající relace' : 'Ukončená relace'}</span>
            <span>${hasMatchingPack ? `${escapeHtml(meta.label)} · v${escapeHtml(meta.contentVersion)}` : 'Požadovaný Content Pack není dostupný'}</span>
          </div>
          ${state.content.error ? `<div class="safety-block"><strong>Obsah nelze obnovit automaticky.</strong><span>${escapeHtml(state.content.error)}</span></div>` : ''}
          ${hasMatchingPack ? `
            <label class="pack-pass-field"><span>Heslo Content Packu</span><input type="password" data-pack-passphrase autocomplete="current-password" spellcheck="false" placeholder="Heslo se nikam neukládá"></label>
            <button class="primary-button" data-action="resume-unlock" ${state.content.busy ? 'disabled' : ''}>${state.content.busy ? 'Odemknutí…' : 'Odemknout a obnovit relaci'}</button>` : ''}
          <button class="text-danger-button resume-discard" data-action="resume-discard">Zahodit tuto pracovní relaci</button>
          <p class="security-footnote">Dešifrovaný obsah existuje pouze v paměti běžící stránky. Po dalším reloadu bude znovu vyžadováno heslo.</p>
        </section>
      </div>
    </main>`;
}

function renderTopicSelect() {
  const exam = state.mode === 'exam';
  const topics = currentTopics();
  const protectedActive = usingProtectedContent();
  return `
    <main class="page-shell">
      <div class="content-frame">
        <div class="page-topline">
          <button class="back-button" data-action="back-home">${icon('back')} <span>Úvod</span></button>
          <span class="prototype-pill">${exam ? 'Ostrá zkouška' : 'Nácvik'} · ${protectedActive ? 'protected' : 'demo'}</span>
        </div>
        <header class="page-heading">
          <p class="eyebrow">${exam ? 'Exam Mode' : 'Practice Mode'}</p>
          <h1>Vyberte téma</h1>
          <p>Student oznámí číslo otázky. Jedno klepnutí otevře přípravu tématu; čas se zatím nespouští.</p>
        </header>
        <section class="topic-grid" aria-label="Maturitní témata">
          ${topics.map(topic => `
            <button class="topic-tile ${protectedActive ? 'protected' : ''}" data-action="select-topic" data-topic="${escapeHtml(String(topic.id))}">
              <span class="demo-chip">${protectedActive ? 'protected' : 'synthetic'}</span>
              <span class="number">${topicNumber(topic)}</span>
              <span class="topic-name">${escapeHtml(topic.title)}</span>
            </button>`).join('')}
        </section>
        <div style="margin-top:30px">${footer()}</div>
      </div>
    </main>`;
}

function renderExamPreflight() {
  const topic = getTopic();
  const health = getPreflightHealth(topic, 'exam');
  return `
    <main class="page-shell">
      <div class="content-frame">
        <div class="page-topline">
          <button class="back-button" data-action="back-topics">${icon('back')} <span>Jiné téma</span></button>
          <span class="prototype-pill">Exam Mode · ${health.blocked ? 'kontrola vyžaduje pozornost' : 'připraveno'}</span>
        </div>
        <section class="preflight-card">
          <div class="preflight-main">
            <p class="topic-number-big">Téma ${topicNumber(topic)}</p>
            <h1>${escapeHtml(topic.title)}</h1>
            <p class="lead">Materiály jsou otevřené a připravené. Časomíra začne až ve chvíli, kdy předáte studentovi obrázky a stisknete tlačítko <strong>Zahájit zkoušku</strong>.</p>
            ${health.blocked ? `<div class="safety-block"><strong>Start je dočasně zablokovaný.</strong><span>${escapeHtml(health.blockReason)}</span></div>` : ''}
            <div class="preflight-actions">
              <button class="primary-button" data-action="start-exam" ${health.blocked ? 'disabled aria-disabled="true"' : ''}>Zahájit zkoušku · 15:00</button>
              <button class="soft-button" data-action="back-topics">Zvolit jiné téma</button>
            </div>
            <p class="preflight-note">${usingProtectedContent() ? 'Ostrý obsah pochází z lokálně odemčeného šifrovaného Content Packu. Dešifrovaná data se neukládají do veřejné PWA cache.' : 'Demo režim používá pouze syntetickou demonstrační sadu. Žádné ostré maturitní zadání není součástí veřejného buildu.'}</p>
          </div>
          <aside class="preflight-side">
            <p class="eyebrow">Pre-flight safety gate</p>
            <div class="readiness">
              ${readinessRow('Content Pack', usingProtectedContent() ? `${state.content.activeMeta?.label || 'Protected'} · odemčeno` : 'Synthetic demo', usingProtectedContent() ? 'ok' : 'warn')}
              ${readinessRow('Obsah tématu', health.content.ok ? 'Struktura validní' : `${health.content.errors.length} chyb`, health.content.ok ? 'ok' : 'error')}
              ${readinessRow('Picture Comparison', health.content.ok ? '2/2 média' : 'Kontrola selhala', health.content.ok ? 'ok' : 'error')}
              ${readinessRow('Obnova relace', state.runtime.storage === 'ready' ? 'Dostupná' : 'Nedostupná', state.runtime.storage === 'ready' ? 'ok' : 'error')}
              ${readinessRow('Offline shell', runtimeShellLabel(), state.runtime.shell === 'ready' ? 'ok' : state.runtime.shell === 'checking' ? 'warn' : 'warn')}
              ${readinessRow('Zařízení', deviceStatusLabel(), deviceReadinessLevel())}
              ${readinessRow('Displej během relace', wakeLockLabel(), wakeLockReadinessLevel())}
              ${readinessRow('Poznámky', 'Prázdné', 'ok')}
              ${factCheckReadinessRow()}
            </div>
            ${health.content.errors.length ? `<details class="preflight-errors"><summary>Podrobnosti validace</summary><ul>${health.content.errors.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></details>` : ''}
          </aside>
        </section>
      </div>
    </main>`;
}

function renderPracticePreflight() {
  const topic = getTopic();
  const health = getPreflightHealth(topic, 'practice');
  return `
    <main class="page-shell">
      <div class="content-frame">
        <div class="page-topline">
          <button class="back-button" data-action="back-topics">${icon('back')} <span>Jiné téma</span></button>
          <span class="prototype-pill">Practice Mode · ${health.blocked ? 'kontrola vyžaduje pozornost' : 'připraveno'}</span>
        </div>
        <section class="preflight-card">
          <div class="preflight-main">
            <p class="topic-number-big">Cvičné téma ${topicNumber(topic)}</p>
            <h1>${escapeHtml(topic.title)}</h1>
            <p class="lead">Student pracuje se svým cvičným listem. Učitel má na zařízení rozšířenou učitelskou vrstvu se stručnými návodnými odpověďmi a follow-up otázkami.</p>
            ${health.blocked ? `<div class="safety-block"><strong>Start je dočasně zablokovaný.</strong><span>${escapeHtml(health.blockReason)}</span></div>` : ''}
            <div class="practice-choices">
              <button class="practice-choice" data-action="start-practice" data-timed="false" ${health.blocked ? 'disabled aria-disabled="true"' : ''}>
                <strong>Nácvik bez času</strong>
                <span>Volná práce s Task Boxem a tématem. Ideální pro výuku a rozbor odpovědí.</span>
              </button>
              <button class="practice-choice" data-action="start-practice" data-timed="true" ${health.blocked ? 'disabled aria-disabled="true"' : ''}>
                <strong>Časovaný nácvik · ~13 min</strong>
                <span>Task Box ~4 min + Topic ~9 min. Picture Comparison se přidá až s budoucím cvičným Picture Packem.</span>
              </button>
            </div>
            <p class="preflight-note">${usingProtectedContent() ? 'Cvičný obsah a Teacher Guidance pocházejí z aktivního Content Packu.' : 'Demo režim používá syntetické ukázkové otázky. Practice Teacher Layer je pouze demonstrace výsledného workflow.'}</p>
          </div>
          <aside class="preflight-side">
            <p class="eyebrow">Teacher layer · safety gate</p>
            <div class="readiness">
              ${readinessRow('Content Pack', usingProtectedContent() ? `${state.content.activeMeta?.label || 'Protected'} · odemčeno` : 'Synthetic demo', usingProtectedContent() ? 'ok' : 'warn')}
              ${readinessRow('Cvičný obsah', health.content.ok ? 'Struktura validní' : `${health.content.errors.length} chyb`, health.content.ok ? 'ok' : 'error')}
              ${readinessRow('Obnova relace', state.runtime.storage === 'ready' ? 'Dostupná' : 'Nedostupná', state.runtime.storage === 'ready' ? 'ok' : 'error')}
              ${readinessRow('Offline shell', runtimeShellLabel(), state.runtime.shell === 'ready' ? 'ok' : 'warn')}
              ${readinessRow('Zařízení', deviceStatusLabel(), deviceReadinessLevel())}
              ${readinessRow('Displej během relace', wakeLockLabel(), wakeLockReadinessLevel())}
              ${readinessRow('Teacher Guidance', guidanceReviewLabel() || 'Připraveno', guidanceReviewLabel() ? 'warn' : 'ok')}
              ${factCheckReadinessRow()}
            </div>
          </aside>
        </section>
      </div>
    </main>`;
}

function getPreflightHealth(topic, mode) {
  const content = validateTopic(topic, mode);
  const storageOk = state.runtime.storage === 'ready';
  const contentReady = currentContentRef().source === 'demo' || usingProtectedContent();
  const shellRequired = mode === 'exam' && usingProtectedContent();
  const shellReady = state.runtime.shell === 'ready';
  const blocked = !content.ok || !storageOk || !contentReady || (shellRequired && !shellReady);
  return {
    content,
    blocked,
    blockReason: !contentReady ? 'Chráněný Content Pack není odemčen.' : !content.ok ? 'Obsah tématu neprošel strukturální validací.' : !storageOk ? 'Zařízení nedovoluje bezpečně uložit a obnovit probíhající relaci.' : shellRequired && !shellReady ? 'Offline shell ještě není připravený. Před ostrou zkouškou vyčkejte na dokončení PWA cache.' : ''
  };
}

function runtimeShellLabel() {
  if (state.runtime.shell === 'ready') return 'Připraven';
  if (state.runtime.shell === 'checking') return 'Kontrola…';
  if (state.runtime.shell === 'unsupported') return 'Nepodporován';
  return 'Nepřipraven';
}

function deviceStatusLabel() {
  const device = state.runtime.device || {};
  const form = { phone: 'Telefon', tablet: 'Tablet', desktop: 'Počítač' }[device.formFactor] || 'Zařízení';
  const orientation = device.orientation === 'portrait' ? 'na výšku' : 'na šířku';
  const display = device.standalone ? 'PWA' : 'prohlížeč';
  return `${form} · ${orientation} · ${display}`;
}

function deviceReadinessLevel() {
  return state.runtime.device?.formFactor === 'tablet' && state.runtime.device?.orientation === 'portrait' ? 'warn' : 'ok';
}

function updateDeviceStatus() {
  document.querySelectorAll('[data-device-status]').forEach(node => {
    node.innerHTML = `<span class="status-dot"></span>${escapeHtml(deviceStatusLabel())}`;
  });
}

function syncRootRuntimeFlags() {
  const root = document.documentElement;
  if (!root?.dataset) return;
  root.dataset.screen = state.screen;
  root.dataset.sessionState = state.session?.status === 'running' ? 'running' : state.session?.status === 'finished' ? 'finished' : 'none';
}

function setupDeviceRuntime() {
  try {
    deviceRuntimeController = installDeviceRuntime({
      onChange(snapshot) {
        state.runtime.device = snapshot;
        syncRootRuntimeFlags();
        updateDeviceStatus();
      }
    });
    state.runtime.device = deviceRuntimeController.snapshot || state.runtime.device;
    syncRootRuntimeFlags();
  } catch (error) {
    console.warn('[Maturita Desk] Device runtime hardening unavailable.', error);
  }
}

function wakeLockLabel() {
  if (state.runtime.wakeLock === 'active') return 'udržován aktivní';
  if (state.runtime.wakeLock === 'available') return 'lze udržet aktivní';
  if (state.runtime.wakeLock === 'denied') return 'nelze vynutit';
  return 'Wake Lock nepodporován';
}

function wakeLockReadinessLevel() {
  return ['active', 'available'].includes(state.runtime.wakeLock) ? 'ok' : 'warn';
}

function readinessRow(label, status, level = 'ok') {
  const iconMark = level === 'ok' ? '✓' : level === 'error' ? '!' : '•';
  return `<div class="readiness-row ${level}"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(status)} ${iconMark}</span></div>`;
}

function renderConsole() {
  const s = state.session;
  if (!s) { state.screen = 'home'; return renderHome(); }
  const topic = getTopic();
  const phases = s.mode === 'exam' ? ['pictures', 'task', 'topic'] : ['task', 'topic'];
  const totalTarget = getTotalTargetNow();
  return `
    <main class="console-page">
      <header class="console-header">
        <div class="console-row">
          <div class="console-topic">
            <span class="topic-no">${topicNumber(topic)}</span>
            <div class="console-topic-copy">
              <strong>${escapeHtml(topic.title)}</strong>
              <span>${s.mode === 'exam' ? 'Ostrá zkouška' : 'Nácvik'}${state.restored ? ' · obnoveno' : ''}</span>
            </div>
          </div>
          <nav class="phase-tabs" aria-label="Část zkoušky">
            ${phases.map(phase => phaseTab(phase)).join('')}
          </nav>
          <div class="console-tools">
            ${s.timed ? `<div class="exam-clock" data-exam-clock><span>${s.mode === 'exam' ? 'Exam' : 'Nácvik'}</span><strong>${formatTime(getTotalElapsedNow())} / ${formatTime(totalTarget)}</strong></div>` : `<div class="exam-clock"><span>Nácvik</span><strong>bez času</strong></div>`}
            <span class="wake-chip ${state.runtime.wakeLock}" data-wake-status title="${escapeHtml(wakeLockLabel())}"><span class="status-dot ${state.runtime.wakeLock === 'active' ? '' : state.runtime.wakeLock === 'denied' ? 'warn' : 'off'}"></span><span>Displej</span></span>
            <button class="icon-button note-tool ${hasNotes() ? 'has-note' : ''}" data-action="open-notes" aria-label="Poznámky" title="Poznámky" data-notes-global>${icon('notes')}<span class="note-dot" aria-hidden="true"></span></button>
            <button class="icon-button" data-action="open-fact" aria-label="Ověřit / dohledat" title="Ověřit / dohledat">${icon('search')}</button>
            <button class="icon-button" data-action="cycle-theme" aria-label="Změnit vzhled" title="Vzhled">${icon('theme')}</button>
          </div>
        </div>
        ${s.timed ? renderTimeRail() : '<div style="height:12px"></div>'}
      </header>
      <div class="orientation-hint" role="status">Pro pohodlnější práci na tabletu doporučujeme orientaci na šířku. Zkouška ale může pokračovat i na výšku.</div>
      <section class="console-main" id="console-content">${renderPhaseContent()}</section>
      ${renderPhaseActionBar()}
      ${renderMobileNav()}
    </main>`;
}

function phaseTab(phase) {
  const s = state.session;
  const active = s.viewPhase === phase ? 'active' : '';
  const timed = s.activePhase === phase && s.timed && s.status === 'running' ? 'timed' : '';
  const status = phaseStatus(s, phase);
  const noted = hasNote(s.notes, phase);
  return `<button class="phase-tab ${active} ${timed} ${status} ${noted ? 'has-note' : ''}" data-action="view-phase" data-phase="${phase}" data-note-indicator-phase="${phase}"><span>${PHASE_LABELS[phase]}</span><span class="note-dot" aria-label="${noted ? 'obsahuje poznámku' : 'bez poznámky'}"></span>${status === 'completed' ? '<span class="phase-check" aria-label="dokončeno">✓</span>' : ''}</button>`;
}

function renderTimeRail() {
  const s = state.session;
  if (s.mode === 'exam') {
    return `<div class="time-rail" data-time-rail style="--exam-progress:0%">
      <div class="time-rail-track"><span class="seg pictures"></span><span class="seg task"></span><span class="seg topic"></span></div>
      <div class="time-rail-fill"></div><div class="time-rail-dot"></div>
    </div>`;
  }
  return `<div class="time-rail practice-rail" data-time-rail style="--exam-progress:0%">
    <div class="time-rail-track" style="grid-template-columns:4fr 9fr"><span class="seg task"></span><span class="seg topic"></span></div>
    <div class="time-rail-fill"></div><div class="time-rail-dot"></div>
  </div>`;
}

function renderConsoleContent() {
  const node = document.querySelector('#console-content');
  if (!node || state.screen !== 'console') return;
  node.innerHTML = renderPhaseContent();
  updatePhaseNavigation();
  updateTimers();
}

function renderPhaseContent() {
  const s = state.session;
  if (!s) return '';
  const phase = s.viewPhase || s.activePhase;
  const peek = s.status === 'running' && phase !== s.activePhase;
  const elapsed = getElapsedForPhase(phase);
  const target = PHASE_TARGETS[phase] || 0;
  const timerClass = s.timed ? timingClass(elapsed, target) : '';
  const timer = s.timed
    ? `<div class="phase-timer ${timerClass}" data-phase-clock data-phase="${phase}"><span>${PHASE_LABELS_CS[phase]}</span><strong>${formatTime(elapsed)} / ~${formatTime(target)}</strong></div>`
    : `<div class="phase-timer"><span>${PHASE_LABELS_CS[phase]}</span><strong>bez času</strong></div>`;
  const headerTitle = phase === 'pictures' ? 'Picture Comparison' : phase === 'task' ? 'Task Box' : 'Topic';
  const eyebrow = s.mode === 'exam' ? 'Exam Mode' : 'Practice Mode';
  return `
    ${peek ? `<div class="peek-banner"><span><strong>Pouze náhled.</strong> Čas stále běží v části ${escapeHtml(PHASE_LABELS[s.activePhase])}.</span><button data-action="return-active">Vrátit se</button></div>` : ''}
    <div class="phase-header">
      <div><p class="eyebrow">${eyebrow}</p><h1>${headerTitle}</h1></div>
      <div class="phase-header-tools">
        ${timer}
        <button class="phase-note-button ${hasNote(s.notes, phase) ? 'has-note' : ''}" data-action="open-notes" data-note-indicator-phase="${phase}">${icon('notes')}<span>Poznámka</span><span class="note-dot" aria-hidden="true"></span></button>
      </div>
    </div>
    ${phase === 'pictures' ? renderPictures() : phase === 'task' ? renderTask() : renderTopic()}
  `;
}

function renderPictures() {
  const data = getTopic().exam.pictures;
  const view = state.pictureView;
  const images = Array.isArray(data.images) ? data.images : [];
  const target = String(data.targetQuestion || data.intro || 'Compare both photographs and answer the target question.').trim();
  const instruction = String(data.instruction || '').trim();
  const support = Array.isArray(data.support)
    ? data.support
    : (Array.isArray(data.guidePoints) ? data.guidePoints.map(point => ({ label: point, detail: '' })) : []);
  return `
    <section class="picture-target" aria-label="Zadání porovnání obrázků">
      <span>Target question</span>
      <h2>${escapeHtml(target)}</h2>
      ${instruction ? `<p>${escapeHtml(instruction)}</p>` : ''}
    </section>
    <div class="picture-mobile-tabs" aria-label="Zobrazení obrázků">
      ${['A', 'B', 'both'].map(v => `<button class="picture-tab ${view === v ? 'active' : ''}" data-action="picture-view" data-view="${v}">${v === 'both' ? 'A + B' : `Picture ${v}`}</button>`).join('')}
    </div>
    <div class="picture-stage ${view === 'both' ? 'mobile-both' : ''}">
      ${images.map(img => {
        const src = mediaSource(img.src);
        return `<figure class="picture-card ${view === img.id ? 'mobile-show' : ''}">
          ${src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(img.alt || '')}" ${Number(img.width) > 0 ? `width="${Number(img.width)}"` : ''} ${Number(img.height) > 0 ? `height="${Number(img.height)}"` : ''} decoding="async">` : '<div class="picture-missing">Obrázek není dostupný.</div>'}
          <figcaption class="picture-label">${escapeHtml(img.id)}</figcaption>
          ${src ? `<button class="picture-expand" data-action="lightbox" data-image-group="comparison" data-image-id="${escapeHtml(img.id)}">Zvětšit</button>` : ''}
        </figure>`;
      }).join('')}
    </div>
    ${(support.length || data.teacherPrompt) ? `<div class="picture-support">
      ${support.length ? `<details class="disclosure picture-guide"><summary>Ideas that may help</summary><div class="disclosure-content support-grid">${support.map(item => `<div class="support-item"><strong>${escapeHtml(item.label)}</strong>${item.detail ? `<span>${escapeHtml(item.detail)}</span>` : ''}</div>`).join('')}</div></details>` : ''}
      ${data.teacherPrompt ? `<details class="disclosure"><summary>Teacher prompt</summary><div class="disclosure-content"><p>${escapeHtml(data.teacherPrompt)}</p></div></details>` : ''}
    </div>` : ''}`;
}

function renderTask() {
  const s = state.session;
  const isExam = s.mode === 'exam';
  const topic = getTopic();
  const data = isExam ? topic.exam.task : topic.practice.task;
  const blocks = Array.isArray(data.blocks) ? data.blocks : [];
  const fallbackLead = !blocks.length ? String(data.scenario || data.intro || '').trim() : '';
  const draftGuidance = usingProtectedContent() && (
    isExam
      ? topic.contentStatus?.examTaskGuidance === 'AI_ASSISTED_DRAFT_REQUIRES_TEACHER_REVIEW'
      : topic.contentStatus?.practiceGuidance === 'AI_ASSISTED_DRAFT_REQUIRES_TEACHER_REVIEW'
  );
  return `
    ${!isExam ? `<div class="practice-banner"><span><strong>Teacher Layer</strong> · Student má svůj cvičný list; níže vidíte naváděcí podporu pro učitele.</span><span>${s.timed ? 'Časovaný nácvik' : 'Bez času'}</span></div>` : ''}
    ${draftGuidance ? `<div class="review-banner"><strong>Interní revize nápověd.</strong><span>Zdrojové zadání je převzaté z podkladů; učitelská guidance je pracovní návrh a před produkčním použitím vyžaduje kontrolu angličtinářem.</span></div>` : ''}
    <div class="task-layout">
      <article class="task-sheet">
        <header class="task-sheet-head">
          <span class="task-type">${escapeHtml(data.type || (isExam ? 'Task Box' : 'Practice task'))}</span>
          <h2>${escapeHtml(data.title)}</h2>
          ${fallbackLead ? `<p>${escapeHtml(fallbackLead)}</p>` : ''}
        </header>
        ${blocks.length ? `<div class="task-source-blocks">${blocks.map(renderTaskBlock).join('')}</div>` : ''}
        <div class="task-steps">
          ${data.steps.map((step, idx) => {
            const reviewId = !isExam ? reviewItemIdForTask(topic.id, idx) : '';
            const reviewed = !isExam ? practiceGuidanceState(reviewId, step) : null;
            const guidance = isExam ? (Array.isArray(step.guidance) ? step.guidance : []) : reviewed.guidance;
            const followUp = isExam ? String(step.followUp || '') : reviewed.followUp;
            const highReview = !isExam && reviewed.status === 'pending' && step?.guidanceMeta?.reviewPriority === 'HIGH';
            const reviewChip = !isExam && reviewed.status !== 'pending' ? `<span class="review-chip status-${reviewed.status}">${reviewed.status === 'approved' ? 'ověřeno' : reviewed.status === 'edited' ? 'upraveno' : 'odmítnuto'}</span>` : (highReview ? '<span class="review-chip">zkontrolovat</span>' : '');
            const labelSuffix = !isExam ? (reviewed.status === 'approved' ? ' · ověřeno' : reviewed.status === 'edited' ? ' · upraveno' : reviewed.status === 'rejected' ? '' : draftGuidance ? ' · draft' : '') : (draftGuidance ? ' · draft' : '');
            return `<section class="task-step ${!isExam ? `review-status-${reviewed.status}` : ''}">
              <div class="step-row"><span class="step-number">${idx + 1}</span><div><p class="step-prompt">${escapeHtml(step.prompt)}</p>${Array.isArray(step.substeps) && step.substeps.length ? `<ol class="task-substeps">${step.substeps.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol>` : ''}</div></div>
              <div class="teacher-tools">
                ${guidance.length ? `<details class="disclosure"><summary>${isExam ? 'Teacher guidance' : 'Návodná odpověď'}${labelSuffix}${reviewChip}</summary><div class="disclosure-content"><ul>${guidance.map(g => `<li>${escapeHtml(g)}</li>`).join('')}</ul></div></details>` : (!isExam && reviewed.status === 'rejected' ? '<div class="review-inline-warning">Draft nápovědy byl při lokální revizi odmítnut a není během nácviku zobrazován.</div>' : '')}
                ${followUp ? `<details class="disclosure"><summary>Follow-up</summary><div class="disclosure-content"><p>${escapeHtml(followUp)}</p></div></details>` : ''}
              </div>
            </section>`;
          }).join('')}
        </div>
      </article>
      <aside class="task-aside">
        <h3>Workflow</h3>
        <p>${isExam ? 'Nechte studenta úkol vést. Učitelskou podporu rozbalujte jen v případě potřeby. Přechod na téma je vždy ruční.' : 'Nápovědy jsou záměrně stručné. Nejde o modelový monolog, ale o rychlou oporu pro vedení nácviku.'}</p>
      </aside>
    </div>`;
}

function renderTaskBlock(block) {
  if (!block || typeof block !== 'object') return '';
  const kind = String(block.kind || '');
  const type = String(block.type || '');
  if (kind === 'text' || type === 'paragraph') return `<p class="task-source-text">${escapeHtml(block.text || '')}</p>`;
  if (kind === 'quote' || type === 'quote') return `<blockquote class="task-quote">${escapeHtml(block.text || '')}</blockquote>`;
  if (kind === 'bullet') return `<div class="task-source-bullet"><span aria-hidden="true">•</span><p>${escapeHtml(block.text || '')}</p></div>`;
  if (type === 'list') return `<ul class="task-rich-list">${(block.items || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  if (type === 'cards') return `<div class="task-cards">${(block.items || []).map(item => `<div class="task-data-card">${escapeHtml(item)}</div>`).join('')}</div>`;
  if (kind === 'table' || type === 'table') {
    const rawRows = Array.isArray(block.rows) ? block.rows : [];
    const headers = Array.isArray(block.headers) ? block.headers : [];
    const rows = headers.length ? rawRows : rawRows.slice(1);
    const inferredHeaders = headers.length ? headers : (rawRows[0] || []);
    return `<div class="task-table-wrap" tabindex="0" aria-label="Datová tabulka k úkolu"><table class="task-data-table">${inferredHeaders.length ? `<thead><tr>${inferredHeaders.map(cell => `<th>${formatCell(cell)}</th>`).join('')}</tr></thead>` : ''}<tbody>${rows.map(row => `<tr>${(Array.isArray(row) ? row : []).map(cell => `<td>${formatCell(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  return '';
}

function renderTopic() {
  const s = state.session;
  const isExam = s.mode === 'exam';
  const topic = getTopic();
  const sections = isExam ? topic.exam.topic.sections : topic.practice.sections;
  const guidanceDraft = !isExam && usingProtectedContent() && topic.contentStatus?.practiceGuidance === 'AI_ASSISTED_DRAFT_REQUIRES_TEACHER_REVIEW';
  let active = sections.find(x => x.id === s.activeSectionId);
  if (!active) { active = sections[0]; s.activeSectionId = active.id; saveSession(); }
  const references = isExam && Array.isArray(topic.exam.topic.referenceImages) ? topic.exam.topic.referenceImages : [];
  return `
    ${!isExam ? `<div class="practice-banner"><span><strong>Practice Teacher Layer</strong> · Každá otázka má stručné směry odpovědi a podle potřeby follow-up.</span><span>${s.timed ? 'Topic ~9 min' : 'Volný nácvik'}</span></div>` : ''}
    ${guidanceDraft ? `<div class="review-banner"><strong>Teacher Guidance · interní návrh.</strong><span>Položky označené „zkontrolovat“ neměly dostatečně přesnou oporu v ostré učitelské verzi a musí je ověřit předmětová komise.</span></div>` : ''}
    <div class="topic-layout">
      <nav class="section-nav" aria-label="Podtémata">
        ${sections.map((section, idx) => `<button class="section-button ${section.id === active.id ? 'active' : ''}" data-section-button="${escapeHtml(section.id)}"><span class="idx">${String(idx + 1).padStart(2, '0')}</span><span class="label">${escapeHtml(section.shortLabel || section.label)}</span></button>`).join('')}
      </nav>
      <div>
        <select class="mobile-section-select" data-section-select aria-label="Vyberte podtéma">
          ${sections.map((section, idx) => `<option value="${escapeHtml(section.id)}" ${section.id === active.id ? 'selected' : ''}>${idx + 1}. ${escapeHtml(section.label)}</option>`).join('')}
        </select>
        <article class="question-sheet">
          <header class="question-sheet-head"><span>Podtéma ${String(sections.indexOf(active) + 1).padStart(2, '0')}</span><h2>${escapeHtml(active.label)}</h2></header>
          <div class="question-list">
            ${active.questions.map((q, idx) => renderQuestion(q, isExam, guidanceDraft, !isExam ? reviewItemIdForQuestion(topic.id, active.id, idx) : '')).join('')}
            ${renderSectionExtraPrompts(active)}
          </div>
        </article>
        ${references.length ? renderReferenceGallery(references) : ''}
      </div>
    </div>`;
}

function renderSectionExtraPrompts(section) {
  const values = [];
  if (section?.extraPrompt !== undefined) values.push(section.extraPrompt);
  if (Array.isArray(section?.extraPrompts)) values.push(...section.extraPrompts);
  if (!values.length) return '';
  return `<section class="section-extra-prompts"><p class="section-extra-label">Extra prompts</p>${values.map(renderExtraPrompt).join('')}</section>`;
}

function renderExtraPrompt(q) {
  const value = typeof q === 'string' ? { prompt: q, answer: [] } : (q || {});
  const answer = Array.isArray(value.answer) ? value.answer : [];
  return `<article class="extra-prompt-card"><p><strong>Extra prompt</strong> ${escapeHtml(value.prompt || '')}</p>${answer.length ? `<details class="disclosure extra"><summary>Suggested answer</summary><div class="disclosure-content"><ul>${answer.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div></details>` : ''}</article>`;
}

function renderReferenceGallery(images) {
  return `<details class="reference-panel"><summary>Referenční obrázky ze studentského listu <span>${images.length}</span></summary><div class="reference-copy">Plný ostrý studentský list není v aplikaci. Tato šifrovaná galerie zachovává pouze obrázky, které mohou být důležité pro orientaci zkoušejícího.</div><div class="reference-gallery">${images.map(img => {
    const src = mediaSource(img.src);
    return src ? `<button class="reference-thumb" data-action="lightbox" data-image-group="reference" data-image-id="${escapeHtml(img.id)}"><img src="${escapeHtml(src)}" alt="${escapeHtml(img.alt || '')}" loading="lazy" decoding="async"><span>${escapeHtml(img.id)}</span></button>` : '';
  }).join('')}</div></details>`;
}

function renderQuestion(q, isExam, guidanceDraft = false, reviewId = '') {
  const reviewed = !isExam ? practiceGuidanceState(reviewId, q) : null;
  const answer = isExam ? (Array.isArray(q?.answer) ? q.answer : (Array.isArray(q?.guidance) ? q.guidance : [])) : reviewed.guidance;
  const extra = isExam ? (q?.extra || q?.followUp || '') : reviewed.followUp;
  const highReview = !isExam && reviewed.status === 'pending' && q?.guidanceMeta?.reviewPriority === 'HIGH';
  const statusChip = !isExam && reviewed.status !== 'pending'
    ? `<span class="review-chip status-${reviewed.status}">${reviewed.status === 'approved' ? 'ověřeno' : reviewed.status === 'edited' ? 'upraveno' : 'odmítnuto'}</span>`
    : (highReview ? '<span class="review-chip">zkontrolovat</span>' : '');
  const answerLabel = isExam
    ? 'Suggested answer'
    : reviewed.status === 'approved'
      ? 'Návodná odpověď · ověřeno'
      : reviewed.status === 'edited'
        ? 'Návodná odpověď · upraveno'
        : `Návodná odpověď${guidanceDraft ? ' · draft' : ''}`;
  return `
    <section class="question-item ${isExam ? '' : `practice-question review-status-${reviewed.status}`} ${highReview ? 'review-priority' : ''}">
      <div class="question-line"><p class="question">${escapeHtml(q?.prompt || '')}</p>${statusChip}</div>
      <div class="question-tools">
        ${answer.length ? `<details class="disclosure"><summary>${answerLabel}</summary><div class="disclosure-content"><ul>${answer.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul></div></details>` : (!isExam && reviewed.status === 'rejected' ? '<div class="review-inline-warning">Draft nápovědy byl při lokální revizi odmítnut a není během nácviku zobrazován.</div>' : '')}
        ${extra ? `<details class="disclosure extra"><summary>${isExam ? 'Extra prompt' : 'Follow-up'}</summary><div class="disclosure-content"><p>${escapeHtml(extra)}</p></div></details>` : ''}
      </div>
    </section>`;
}

function renderPhaseActionBar() {
  const s = state.session;
  if (!s || s.status !== 'running') return '';
  const active = s.activePhase;
  const viewMatches = s.viewPhase === active;
  if (!viewMatches) {
    return `<div class="phase-action-bar"><div class="phase-action-inner"><div class="phase-action-copy"><strong>Čas běží jinde</strong><span>Aktivní část: ${PHASE_LABELS[active]}</span></div><button class="primary-button" data-action="return-active">Vrátit se</button></div></div>`;
  }
  if (s.mode === 'exam' && active === 'pictures') return actionBar('První část', 'Přechod je ruční; timer se přepne až po potvrzení.', 'Přejít na Task Box', 'transition', 'task');
  if (active === 'task') return actionBar('Task Box', 'Čas je orientační; aplikace nic neukončí sama.', 'Přejít na téma', 'transition', 'topic');
  return actionBar('Poslední část', 'Ukončením se zastaví čas a zobrazí se pracovní souhrn.', s.mode === 'exam' ? 'Ukončit zkoušku' : 'Ukončit nácvik', 'finish-session');
}

function actionBar(title, text, button, action, next = '') {
  return `<div class="phase-action-bar"><div class="phase-action-inner"><div class="phase-action-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div><button class="primary-button" data-action="${action}" ${next ? `data-next="${next}"` : ''}>${escapeHtml(button)}</button></div></div>`;
}

function renderMobileNav() {
  const s = state.session;
  const phases = s.mode === 'exam' ? ['pictures', 'task', 'topic'] : ['task', 'topic'];
  return `<nav class="mobile-phase-nav ${s.mode === 'practice' ? 'practice' : ''}" aria-label="Mobilní navigace">
    ${phases.map(phase => `<button class="mobile-phase ${s.viewPhase === phase ? 'active' : ''} ${hasNote(s.notes, phase) ? 'has-note' : ''}" data-action="view-phase" data-phase="${phase}" data-note-indicator-phase="${phase}">${PHASE_LABELS[phase]}<span class="note-dot" aria-hidden="true"></span></button>`).join('')}
    <button class="mobile-phase icon ${hasNotes() ? 'has-note' : ''}" data-action="open-notes" aria-label="Poznámky" data-notes-global>${icon('notes')}<span class="note-dot" aria-hidden="true"></span></button>
    <button class="mobile-phase icon" data-action="open-fact" aria-label="Ověřit / dohledat">${icon('search')}</button>
  </nav>`;
}

function updatePhaseNavigation() {
  const s = state.session;
  if (!s) return;
  document.querySelectorAll('[data-action="view-phase"]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.phase === s.viewPhase);
    btn.classList.toggle('timed', btn.classList.contains('phase-tab') && s.timed && btn.dataset.phase === s.activePhase && s.status === 'running');
  });
  const action = document.querySelector('.phase-action-bar');
  if (action) action.outerHTML = renderPhaseActionBar();
}

function updateTimers() {
  const s = state.session;
  if (!s || state.screen !== 'console' || !s.timed) return;
  touchClock(s);
  if (!heartbeatSessionOwnership()) return;
  const totalElapsed = getTotalElapsedNow();
  const totalTarget = getTotalTargetNow();
  document.querySelectorAll('[data-exam-clock]').forEach(node => {
    node.classList.remove('near', 'over');
    const c = timingClass(totalElapsed, totalTarget);
    if (c) node.classList.add(c);
    const strong = node.querySelector('strong');
    if (strong) strong.textContent = `${formatTime(totalElapsed)} / ${formatTime(totalTarget)}`;
  });
  document.querySelectorAll('[data-phase-clock]').forEach(node => {
    const phase = node.dataset.phase;
    const elapsed = getElapsedForPhase(phase);
    const target = PHASE_TARGETS[phase];
    node.classList.remove('near', 'over');
    const c = timingClass(elapsed, target);
    if (c) node.classList.add(c);
    const strong = node.querySelector('strong');
    if (strong) strong.textContent = `${formatTime(elapsed)} / ~${formatTime(target)}`;
  });
  const rail = document.querySelector('[data-time-rail]');
  if (rail) {
    const pct = totalTarget ? Math.min(100, Math.max(0, totalElapsed / totalTarget * 100)) : 0;
    rail.style.setProperty('--exam-progress', `${pct}%`);
  }
  if (s.status === 'running' && shouldPersistHeartbeat(state.lastHeartbeatAt, Date.now(), HEARTBEAT_MS)) {
    saveSession({ broadcast: false });
  }
}

function renderFinished() {
  const s = state.session;
  if (!s) { state.screen = 'home'; return renderHome(); }
  const topic = getTopic();
  const timed = s.timed;
  const phases = PHASES[s.mode];
  const timing = getTimingSummary(s);
  return `
    <main class="page-shell">
      <div class="content-frame">
        <div class="page-topline">${brandLockup()}<span class="prototype-pill">Relace ukončena</span></div>
        <section class="finish-card">
          <p class="eyebrow">${s.mode === 'exam' ? 'Exam finished' : 'Practice finished'}</p>
          <h1>${topicNumber(topic)} · ${escapeHtml(topic.title)}</h1>
          <p>${s.mode === 'exam' ? 'Časomíra je zastavena. Souhrn je pouze pracovní – nic se nearchivuje ani neodesílá.' : 'Nácvik je ukončen. Pracovní poznámky zůstávají jen do přechodu na další téma.'}</p>
          ${timed ? `<div class="time-summary">
            <div class="time-cell"><span>Celkem</span><strong>${formatTime(timing.total)}</strong></div>
            ${phases.map(phase => `<div class="time-cell"><span>${PHASE_LABELS[phase]}</span><strong>${formatTime(timing.phases[phase].elapsed)}</strong><small>${timing.phases[phase].elapsed > timing.phases[phase].target ? `+${formatTime(timing.phases[phase].elapsed - timing.phases[phase].target)}` : `~${formatTime(timing.phases[phase].target)}`}</small></div>`).join('')}
          </div>` : '<div class="practice-banner"><span><strong>Nácvik bez času.</strong> Časový souhrn se nevytváří.</span></div>'}
          <div class="finish-notes">
            <h2>Pracovní poznámky</h2>
            ${renderAllNotes()}
          </div>
          <div class="finish-actions">
            <button class="primary-button" data-action="new-topic">Nové téma</button>
            <button class="soft-button" data-action="open-notes">Otevřít poznámky</button>
            <button class="soft-button" data-action="finish-home">Zpět na úvod</button>
          </div>
        </section>
      </div>
    </main>`;
}

function renderDrawer() {
  if (!state.drawer) { closeDrawer(false); return; }
  let backdrop = document.querySelector('.drawer-backdrop');
  let drawer = document.querySelector('.drawer');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'drawer-backdrop';
    backdrop.dataset.action = 'close-drawer';
    document.body.appendChild(backdrop);
  }
  if (!drawer) {
    drawer = document.createElement('aside');
    drawer.className = 'drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    document.body.appendChild(drawer);
  }
  drawer.innerHTML = state.drawer === 'notes' ? renderNotesDrawer() : state.drawer === 'content' ? renderContentDrawer() : state.drawer === 'access' ? renderAccessDrawer() : state.drawer === 'pilot' ? renderPilotDrawer() : renderFactDrawer();
  const focusTarget = state.drawer === 'notes'
    ? drawer.querySelector('textarea') || drawer.querySelector('button')
    : state.drawer === 'content'
      ? drawer.querySelector('[data-pack-passphrase]') || drawer.querySelector('button')
      : state.drawer === 'access'
        ? drawer.querySelector('button')
        : state.drawer === 'pilot'
          ? drawer.querySelector('button')
          : drawer.querySelector('textarea') || drawer.querySelector('input') || drawer.querySelector('button');
  focusTarget?.focus({ preventScroll: true });
}

function closeDrawer(clearState = true) {
  document.querySelector('.drawer-backdrop')?.remove();
  document.querySelector('.drawer')?.remove();
  if (clearState) state.drawer = null;
}

function renderNotesDrawer() {
  const s = state.session;
  const phases = s?.mode === 'exam' ? ['pictures', 'task', 'topic'] : ['task', 'topic'];
  const tab = state.notesTab === 'all' || phases.includes(state.notesTab) ? state.notesTab : phases[0];
  state.notesTab = tab;
  const current = tab === 'all' ? '' : String(s?.notes?.[tab] || '');
  const usage = noteUsage(current);
  return `
    <div class="drawer-head"><div><h2>Poznámky</h2><p>Dočasná lokální pracovní vrstva. Bez cloudu a bez exportu.</p></div><button class="icon-button" data-action="close-drawer" aria-label="Zavřít">${icon('close')}</button></div>
    <div class="drawer-body">
      <div class="privacy-note"><strong>Bez identifikace studenta.</strong> Do poznámek nevkládejte jméno, třídu ani jiný identifikátor maturanta.</div>
      <div class="notes-tabs">
        ${phases.map(phase => `<button class="${tab === phase ? 'active' : ''} ${hasNote(s?.notes, phase) ? 'has-note' : ''}" data-action="notes-tab" data-phase="${phase}" data-note-indicator-phase="${phase}">${PHASE_LABELS[phase]}<span class="note-dot" aria-hidden="true"></span></button>`).join('')}
        <button class="${tab === 'all' ? 'active' : ''} ${hasNotes() ? 'has-note' : ''}" data-action="notes-tab" data-phase="all" data-notes-global>Vše<span class="note-dot" aria-hidden="true"></span></button>
      </div>
      ${tab === 'all' ? renderAllNotes() : `
        <textarea class="notes-field" data-notes-input data-phase="${tab}" maxlength="${NOTE_MAX_LENGTH}" autocomplete="off" autocapitalize="sentences" spellcheck="true" placeholder="Rychlá pracovní poznámka…">${escapeHtml(current)}</textarea>
        <div class="notes-meta">
          <span data-notes-save-status>${state.runtime.storage === 'ready' ? 'Ukládá se automaticky pouze do tohoto zařízení.' : 'Lokální uložení není dostupné.'}</span>
          <span data-notes-counter>${usage.used} / ${usage.max}</span>
        </div>
        <div class="notes-actions">
          <p class="notes-hint">Poznámka přežije refresh nebo krátké uspání zařízení. Při přechodu na nové téma bude po potvrzení odstraněna.</p>
          ${hasNote(s?.notes, tab) ? `<button class="text-danger-button" data-action="clear-note" data-phase="${tab}">Smazat tuto poznámku</button>` : ''}
        </div>`}
    </div>`;
}

function renderAllNotes() {
  const s = state.session;
  if (!s) return '<p class="notes-hint">Žádné poznámky.</p>';
  const phases = s.mode === 'exam' ? ['pictures', 'task', 'topic'] : ['task', 'topic'];
  return `<div class="all-notes">${phases.map(phase => {
    const text = String(s.notes?.[phase] || '').trim();
    return `<div class="note-summary ${text ? 'has-note' : ''}"><strong>${PHASE_LABELS[phase]}</strong><p>${text ? escapeHtml(text) : '— bez poznámky —'}</p></div>`;
  }).join('')}</div>`;
}

function updateNotesSaveStatus(phase) {
  if (state.drawer !== 'notes' || state.notesTab !== phase || !state.session) return;
  const usage = noteUsage(state.session.notes?.[phase] || '');
  const status = document.querySelector('[data-notes-save-status]');
  const counter = document.querySelector('[data-notes-counter]');
  if (status) status.textContent = state.runtime.storage === 'ready' ? 'Uloženo lokálně právě teď.' : 'Lokální uložení není dostupné.';
  if (counter) {
    counter.textContent = `${usage.used} / ${usage.max}`;
    counter.classList.toggle('limit', usage.atLimit);
  }
}

function updateNoteIndicators() {
  const s = state.session;
  if (!s) return;
  document.querySelectorAll('[data-note-indicator-phase]').forEach(node => {
    const phase = node.dataset.noteIndicatorPhase;
    const noted = hasNote(s.notes, phase);
    node.classList.toggle('has-note', noted);
    node.querySelector('.note-dot')?.setAttribute('aria-label', noted ? 'obsahuje poznámku' : 'bez poznámky');
  });
  document.querySelectorAll('[data-notes-global]').forEach(node => node.classList.toggle('has-note', hasNotes()));
}

function renderAccessDrawer() {
  const school = RUNTIME_CONFIG.mode === 'school-server';
  const locked = RUNTIME_CONFIG.mode === 'locked';
  const auth = state.auth;
  const capabilities = Array.isArray(auth.capabilities) ? auth.capabilities : [];
  const expiry = auth.expiresAt ? new Date(auth.expiresAt).toLocaleString('cs-CZ') : '';
  const runtimeError = RUNTIME_CONFIG.configurationError;
  const runtimeLoadError = RUNTIME_CONFIG.configurationLoadError;
  return `
    <div class="drawer-head"><div><h2>Přístup</h2><p>Provider vrstva Maturita Desk. Identita není součástí Exam Engine ani Notes.</p></div><button class="icon-button" data-action="close-drawer" aria-label="Zavřít">${icon('close')}</button></div>
    <div class="drawer-body access-drawer">
      <div class="pack-security-banner"><strong>${locked ? 'Konfigurace uzamčena' : school ? 'Školní serverový profil' : 'Lokální serverless profil'}</strong><span>${locked ? 'Bez platné runtime konfigurace nejsou dostupné zkouška, nácvik, chráněný obsah ani Fact Check.' : school ? 'Přístup se ověřuje serverovou relací; klient neukládá heslo ani bearer token do localStorage.' : 'Aplikace běží bez centrální identity. Jde o provozní režim zařízení, nikoli o ověření konkrétního učitele.'}</span></div>
      ${runtimeError ? `<div class="safety-block"><strong>Runtime konfigurace není úplná.</strong><span>${escapeHtml(runtimeError)}</span></div>` : ''}
      ${runtimeLoadError ? `<div class="safety-block"><strong>Deployment konfigurace není dostupná.</strong><span>Používá se release-pinned baked profil. ${escapeHtml(runtimeLoadError)} · ${escapeHtml(RUNTIME_CONFIG.mode)} · ${escapeHtml(RUNTIME_CONFIG.environmentId)}</span></div>` : ''}
      <div class="pack-status-card ${auth.authenticated ? 'unlocked' : 'locked'}">
        <span class="secure-kicker">Stav přístupu</span>
        <h3>${escapeHtml(authStatusLabel())}</h3>
        ${school && auth.displayName ? `<p>Přihlášený účet: <strong>${escapeHtml(auth.displayName)}</strong>. Jméno se drží pouze v paměti této stránky.</p>` : ''}
        ${school && expiry ? `<p>Platnost aktuálního oprávnění: ${escapeHtml(expiry)}</p>` : ''}
        ${auth.source === 'offline-lease' ? '<p><strong>Offline lease:</strong> podpis byl ověřen lokálně. Dokud je zařízení offline, server nemůže provést okamžitou revokaci; po expiraci se přístup uzavře.</p>' : ''}
        ${auth.error ? `<p>${escapeHtml(auth.error)}</p>` : ''}
      </div>
      <div class="pack-actions-block">
        <h3>Oprávnění aplikace</h3>
        <p>${capabilities.length ? capabilities.map(item => `<code>${escapeHtml(item)}</code>`).join(' · ') : 'Žádná aktivní oprávnění.'}</p>
      </div>
      ${school ? `<div class="pack-actions-block"><h3>Školní relace</h3><div class="fact-actions">${auth.authenticated ? `<button class="soft-button" data-action="auth-refresh" ${!state.online ? 'disabled' : ''}>Ověřit znovu</button><button class="text-danger-button" data-action="auth-logout" ${state.session ? 'disabled' : ''}>Odhlásit</button>` : `<button class="primary-button" data-action="auth-login" ${!state.online ? 'disabled' : ''}>Přihlásit přes školu</button><button class="soft-button" data-action="auth-refresh" ${!state.online ? 'disabled' : ''}>Zkontrolovat relaci</button>`}</div></div>` : ''}
      <div class="privacy-note"><strong>Minimalizace identity.</strong> Maturita Desk nepotřebuje jméno maturanta. Serverová identita učitele slouží pouze k autorizaci funkcí a distribuci chráněného obsahu; aplikace ji nepřidává do pracovních poznámek ani do dotazu Ověřit / dohledat.</div>
    </div>`;
}

function renderContentDrawer() {
  const meta = state.content.activeMeta;
  const unlocked = state.content.status === 'unlocked' && state.content.unlocked;
  const locked = state.content.status === 'locked';
  const statusText = contentStatusLabel();
  const contentMeta = unlockedContentMetadata();
  const reviewLabel = guidanceReviewLabel();
  const localReview = reviewSummary();
  const remote = PROVIDERS.content.remote;
  const manualImport = PROVIDERS.content.allowManualImport;
  return `
    <div class="drawer-head"><div><h2>Content Pack</h2><p>${PILOT_INTERNAL_REVIEW ? 'Interní lokální revize: povolen SYNTHETIC-DEMO i CONFIDENTIAL-EXAM.' : 'Veřejný Stage 13R: pouze šifrované syntetické pilotní balíčky.'}</p></div><button class="icon-button" data-action="close-drawer" aria-label="Zavřít">${icon('close')}</button></div>
    <div class="drawer-body content-pack-drawer">
      <div class="pack-security-banner"><strong>${PILOT_INTERNAL_REVIEW ? 'Ostrý obsah je povolen pouze v této lokální interní revizi.' : 'Ostrý obsah je ve veřejném Stage 13R zablokovaný.'}</strong><span>${remote ? 'Školní server doručuje pouze šifrovaný .mdesk envelope. Lokální kopie zůstává šifrovaná a serverová session se neposílá do payloadu.' : 'Importovaný balíček je uložen v IndexedDB pouze jako AES-256-GCM šifrovaný payload. Heslo se neukládá.'}</span></div>
      <div class="pack-status-card ${state.content.status}">
        <span class="secure-kicker">Stav</span>
        <h3>${escapeHtml(statusText)}</h3>
        ${meta ? `<dl class="pack-meta"><div><dt>Verze</dt><dd>${escapeHtml(meta.contentVersion)}</dd></div><div><dt>Témata</dt><dd>${meta.topicCount}</dd></div><div><dt>Klasifikace</dt><dd>${escapeHtml(meta.classification)}</dd></div>${contentMeta.sourceDocumentCount ? `<div><dt>Zdrojové dokumenty</dt><dd>${Number(contentMeta.sourceDocumentCount)}</dd></div>` : ''}${contentMeta.examMinutes ? `<div><dt>Zkouška</dt><dd>${Number(contentMeta.examMinutes)} min</dd></div>` : ''}<div><dt>Šifrování</dt><dd>AES-256-GCM</dd></div><div><dt>KDF</dt><dd>PBKDF2-SHA-256 · ${Number(meta.iterations).toLocaleString('cs-CZ')}×</dd></div><div><dt>Payload</dt><dd>${formatBytes(meta.encryptedBytes)}</dd></div></dl>` : '<p>Na tomto zařízení zatím není uložen žádný chráněný Content Pack. Aplikace používá syntetickou demonstrační sadu.</p>'}
      </div>
      ${state.content.error ? `<div class="safety-block"><strong>Content Pack vyžaduje pozornost.</strong><span>${escapeHtml(state.content.error)}</span></div>` : ''}
      ${remote ? `<div class="pack-actions-block"><h3>Školní distribuce</h3><p>Stáhne aktuální šifrovaný pack podle oprávnění školní relace. Při chybě se existující lokální kopie nemaže.</p><button class="primary-button" data-action="content-sync-server" ${state.content.busy || !state.online || !canUse('content:download') || state.session ? 'disabled' : ''}>${state.content.busy ? 'Aktualizuji…' : meta ? 'Zkontrolovat a stáhnout aktuální pack' : 'Stáhnout aktuální pack'}</button></div>` : ''}
      ${reviewLabel ? `<div class="content-review"><strong>${escapeHtml(reviewLabel)}</strong><span>Ostrý zdrojový obsah je převeden, ale automaticky připravené Practice/Task nápovědy nejsou pedagogicky schválené.</span></div>` : ''}
      ${unlocked && reviewLabel ? `<div class="pack-review-actions"><div><h3>Pedagogická revize</h3><p>${localReview ? `${localReview.reviewed}/${localReview.total} položek zkontrolováno · ${localReview.highPending} HIGH zbývá · ${localReview.rejected} odmítnuto` : 'Připravuje se revizní fronta…'}</p></div><button class="primary-button" data-action="open-review" ${state.review.status !== 'ready' || state.session || !canUse('review') ? 'disabled' : ''}>Otevřít revizi</button></div>` : ''}
      ${locked ? `<div class="pack-unlock-box"><label class="pack-pass-field"><span>Heslo Content Packu</span><input type="password" data-pack-passphrase autocomplete="current-password" spellcheck="false" placeholder="Min. 10 znaků"></label><button class="primary-button" data-action="content-unlock" ${state.content.busy ? 'disabled' : ''}>${state.content.busy ? 'Odemknutí…' : 'Odemknout Content Pack'}</button><p>Po reloadu nebo novém spuštění se obsah znovu zamkne. Timer rozpracované relace přitom zůstane zachován.</p></div>` : ''}
      ${unlocked ? `<div class="pack-unlock-box unlocked"><strong>Obsah je odemčen.</strong><p>Dešifrovaná data jsou pouze v paměti této stránky. Nejsou zapisována do localStorage, IndexedDB ani service-worker cache.</p><button class="soft-button" data-action="content-lock">Zamknout obsah</button></div>` : ''}
      ${manualImport ? `<div class="pack-actions-block"><h3>Ruční import do zařízení</h3><p>Vyberte pouze soubor <code>.mdesk</code> vytvořený nástrojem Maturita Desk. Import sám balíček neodemyká.</p><input type="file" data-content-pack-file accept=".mdesk,application/json" hidden><button class="soft-button" data-action="content-import-trigger" ${state.content.busy || state.content.status === 'unavailable' ? 'disabled' : ''}>${meta ? 'Nahradit Content Pack…' : 'Importovat Content Pack…'}</button></div>` : `<div class="privacy-note"><strong>Ruční import je vypnutý.</strong> V tomto serverovém profilu určuje distribuovanou verzi školní backend.</div>`}
      ${meta ? `<div class="pack-danger-zone"><h3>Odstranit ze zařízení</h3><p>Smaže pouze šifrovanou lokální kopii Content Packu. Veřejná aplikace zůstane zachována.</p><button class="text-danger-button" data-action="content-remove" ${state.content.busy ? 'disabled' : ''}>Odstranit Content Pack</button></div>` : ''}
      <div class="privacy-note"><strong>${remote ? 'Server-ready hranice.' : 'Serverless hranice.'}</strong> ${remote ? 'Server autorizuje doručení, ale dešifrování stále probíhá lokálně. Běžící zkouška po výpadku sítě pokračuje; po novém spuštění offline je serverový přístup možný jen s platným podepsaným offline lease.' : 'Po odemčení může obsah číst běžící JavaScript této aplikace. Proto zůstává důležitý audit veřejného buildu a integrita nasazení.'}</div>
    </div>`;
}


function renderPilotDrawer() {
  const summary = pilotSummary(state.pilot);
  const device = state.pilot.device || capturePilotDevice();
  const metricImport = state.pilot.metrics?.['content.import'];
  const metricUnlock = state.pilot.metrics?.['content.unlock'];
  return `
    <div class="drawer-head"><div><h2>Stage 13R Pilot / Review</h2><p>${PILOT_INTERNAL_REVIEW ? 'Lokální interní obsahová/UX revize; pilotní záznam může obsahovat pouze technické poznámky bez opisování ostrého zadání.' : 'Řízený acceptance test zařízení. Výhradně syntetická data.'}</p></div><button class="icon-button" data-action="close-drawer" aria-label="Zavřít">${icon('close')}</button></div>
    <div class="drawer-body pilot-drawer">
      <div class="pilot-safety"><strong>${PILOT_INTERNAL_REVIEW ? 'Žádná reálná studentská data. Reálný Content Pack pouze lokálně.' : 'Žádná reálná studentská data ani ostrý Content Pack.'}</strong><span>Report neobsahuje jméno testera ani studenta. Do poznámek checklistu nevkládejte osobní údaje ani text ostrého zadání.</span></div>
      <div class="pilot-summary"><div><span>PASS</span><strong>${summary.pass}</strong></div><div><span>FAIL</span><strong>${summary.fail}</strong></div><div><span>BLOCKED</span><strong>${summary.blocked}</strong></div><div><span>Povinné zbývá</span><strong>${summary.mandatoryPending}</strong></div></div>
      <div class="pack-status-card ${summary.complete ? 'unlocked' : 'locked'}"><span class="secure-kicker">Pilot gate</span><h3>${summary.complete ? 'PASS – všechny povinné scénáře' : 'OPEN – fyzické testy nejsou dokončené'}</h3><p>${escapeHtml(PILOT_BUILD)} · ${escapeHtml(APP_VERSION)}</p></div>
      <div class="pack-actions-block"><h3>Zařízení</h3><dl class="pack-meta"><div><dt>Viewport</dt><dd>${Number(device.viewport?.width || 0)} × ${Number(device.viewport?.height || 0)}</dd></div><div><dt>Standalone PWA</dt><dd>${device.standalone ? 'ano' : 'ne'}</dd></div><div><dt>Touch points</dt><dd>${Number(device.touchPoints || 0)}</dd></div><div><dt>Service Worker</dt><dd>${device.serviceWorker ? 'ano' : 'ne'}</dd></div><div><dt>Wake Lock</dt><dd>${device.wakeLock ? 'ano' : 'ne'}</dd></div><div><dt>BroadcastChannel</dt><dd>${device.broadcastChannel ? 'ano' : 'ne'}</dd></div></dl></div>
      ${(metricImport || metricUnlock) ? `<div class="pack-actions-block"><h3>Automaticky naměřeno</h3><p>${metricImport ? `Import: ${formatBytes(metricImport.bytes || 0)} · ${Number(metricImport.elapsedMs || 0)} ms` : 'Import: zatím bez měření'}<br>${metricUnlock ? `Odemčení: ${formatBytes(metricUnlock.encryptedBytes || 0)} · ${Number(metricUnlock.elapsedMs || 0)} ms` : 'Odemčení: zatím bez měření'}</p></div>` : ''}
      <div class="pilot-checklist">${summary.rows.map(item => {
        const current = state.pilot.checks[item.id] || { status: 'not-run', note: '' };
        return `<section class="pilot-check ${current.status}"><div class="pilot-check-head"><div><span>${escapeHtml(item.area)}${item.mandatory ? ' · POVINNÉ' : ''}</span><strong>${escapeHtml(item.label)}</strong></div><em>${escapeHtml(current.status.toUpperCase())}</em></div><textarea data-pilot-note="${escapeHtml(item.id)}" maxlength="1000" placeholder="Bez osobních údajů: zařízení, krok, co se stalo…">${escapeHtml(current.note || '')}</textarea><div class="pilot-check-actions"><button class="soft-button" data-action="pilot-mark" data-pilot-id="${escapeHtml(item.id)}" data-status="pass">PASS</button><button class="soft-button" data-action="pilot-mark" data-pilot-id="${escapeHtml(item.id)}" data-status="fail">FAIL</button><button class="soft-button" data-action="pilot-mark" data-pilot-id="${escapeHtml(item.id)}" data-status="blocked">BLOCKED</button><button class="text-button" data-action="pilot-mark" data-pilot-id="${escapeHtml(item.id)}" data-status="not-run">Reset</button></div></section>`;
      }).join('')}</div>
      <div class="pack-actions-block"><h3>Export výsledku</h3><p>Po testu exportujte JSON nebo čitelný TXT a vraťte jej k vyhodnocení Stage 13R. Report je lokální a neodesílá se automaticky.</p><div class="fact-actions"><button class="primary-button" data-action="pilot-export-json">Export JSON</button><button class="soft-button" data-action="pilot-export-txt">Export TXT</button><button class="text-danger-button" data-action="pilot-reset">Vymazat pilotní záznam</button></div></div>
    </div>`;
}

function renderFactDrawer() {
  const availability = currentFactCheckAvailability();
  const result = state.factResult;
  const busy = state.factState === 'loading';
  const standalone = RUNTIME_CONFIG.factCheck.provider === 'isolated-http';
  const accessConfigured = Boolean(loadFactAccessToken());
  return `
    <div class="drawer-head"><div><h2>Ověřit / dohledat</h2><p>Rychlé dohledání aktuální informace nebo ověření tvrzení bez opuštění Maturita Desk.</p></div><button class="icon-button" data-action="close-drawer" aria-label="Zavřít">${icon('close')}</button></div>
    <div class="drawer-body fact-drawer">
      <div class="fact-security"><strong>Izolováno od zkoušky.</strong> Online služba dostane pouze text, který sem výslovně napíšete. Číslo tématu, zadání, Teacher Answers, Content Pack ani pracovní poznámky se k požadavku nepřipojují.<br><strong>Nevkládejte jméno, třídu ani jiný identifikátor maturanta.</strong></div>
      <div class="fact-provider-status ${availability.code}"><span class="status-dot ${availability.ready ? '' : availability.code === 'offline' ? 'off' : 'warn'}"></span><strong>${escapeHtml(availability.label)}</strong><span>${RUNTIME_CONFIG.factCheck.endpoint ? (RUNTIME_CONFIG.factCheck.provider === 'school-server' ? 'Požadavek jde přes školní session; tělo obsahuje pouze query.' : 'Serverless služba je oddělená od Exam Engine a vyžaduje samostatný učitelský přístupový kód.') : 'Online služba zatím není připojená. Exam, Practice a Notes fungují bez ní.'}</span></div>
      ${standalone && RUNTIME_CONFIG.factCheck.endpoint ? `<div class="pack-actions-block"><h3>Serverless přístup</h3><p>Přístupový kód není OpenAI API klíč. Je to dočasné oprávnění k serverless službě a ukládá se pouze do sessionStorage tohoto panelu.</p><label class="fact-query-label"><span>Učitelský přístupový kód</span><input type="password" data-fact-access-token minlength="32" maxlength="256" autocomplete="off" placeholder="Vložte přístupový kód…" value=""></label><div class="fact-actions"><button class="soft-button" data-action="fact-access-save">${accessConfigured ? 'Nahradit přístupový kód' : 'Aktivovat přístup'}</button>${accessConfigured ? '<button class="text-danger-button" data-action="fact-access-clear">Zapomenout kód</button>' : ''}</div></div>` : ''}
      <div class="fact-form">
        <label class="fact-query-label"><span>Co chcete ověřit nebo dohledat?</span><textarea data-fact-query maxlength="${FACT_CHECK_MAX_QUERY}" autocomplete="off" autocapitalize="sentences" spellcheck="true" placeholder="Např. Jaký je aktuální počet obyvatel Austrálie? Nebo: Student tvrdí, že Sydney je hlavní město Austrálie. Je to správně?">${escapeHtml(state.factQuery)}</textarea><small data-fact-counter>${state.factQuery.length} / ${FACT_CHECK_MAX_QUERY}</small></label>
        <div class="fact-actions">
          <button class="primary-button" data-action="fact-submit" ${!availability.ready || busy ? 'disabled' : ''}>${busy ? 'Dohledávám na webu…' : availability.code === 'offline' ? 'Online ověření je offline' : availability.code === 'unconfigured' ? 'Online služba není připojena' : availability.code === 'access-required' ? 'Zadejte přístupový kód' : availability.code === 'auth-required' ? 'Vyžaduje školní oprávnění' : availability.code === 'checking' ? 'Kontrola přístupu…' : 'Ověřit / dohledat'}</button>
          ${busy ? '<button class="soft-button" data-action="fact-cancel">Zrušit</button>' : (state.factQuery || result || state.factError ? '<button class="soft-button" data-action="fact-clear">Vyčistit</button>' : '')}
        </div>
      </div>
      ${busy ? '<div class="fact-progress" role="status"><span class="fact-spinner" aria-hidden="true"></span><div><strong>Probíhá dohledání</strong><p>Služba vyhledává aktuální zdroje. Zkouška i časomíra mezitím pokračují nezávisle.</p></div></div>' : ''}
      ${state.factState === 'error' && state.factError ? `<div class="fact-error"><strong>Ověření / dohledání se nepodařilo.</strong><span>${escapeHtml(state.factError)}</span></div>` : ''}
      ${result ? renderFactResult(result) : ''}
      <div class="fact-footnote"><strong>Rychlá opora, ne důkazní autorita.</strong> U nejasného nebo sporného výsledku otevřete zdroje. Ověřit / dohledat není součástí hodnocení studenta a jeho výpadek nesmí přerušit zkoušku.</div>
    </div>`;
}

let factAbortController = null;

async function submitFactCheck() {
  const availability = currentFactCheckAvailability();
  if (!availability.ready || !FACT_CHECK_PROVIDER) { toast(availability.code === 'offline' ? 'Ověřit / dohledat není bez internetu dostupné.' : 'Online služba Ověřit / dohledat není nakonfigurována.'); return; }
  let query;
  try { query = sanitizeFactQuery(state.factQuery); }
  catch (error) { toast(error?.message || 'Dotaz nelze odeslat.'); return; }
  cancelFactCheck(true);
  factAbortController = new AbortController();
  state.factState = 'loading';
  state.factResult = null;
  state.factError = '';
  renderDrawer();
  try {
    // Privacy boundary: the provider receives ONLY the explicit query string.
    // No topic, Content Pack, Teacher Guidance, Notes or session object is passed here.
    const result = await FACT_CHECK_PROVIDER.check(query, { signal: factAbortController.signal });
    state.factResult = result;
    state.factState = 'done';
  } catch (error) {
    if (error?.code === 'CANCELLED') {
      state.factState = 'idle';
      state.factError = '';
    } else {
      state.factState = 'error';
      state.factError = error?.message || 'Ověření / dohledání se nepodařilo dokončit.';
    }
  } finally {
    factAbortController = null;
    if (state.drawer === 'fact') renderDrawer();
  }
}

function cancelFactCheck(silent = false) {
  if (factAbortController) factAbortController.abort();
  factAbortController = null;
  if (state.factState === 'loading') state.factState = 'idle';
  if (!silent && state.drawer === 'fact') { toast('Ověření bylo zrušeno.'); renderDrawer(); }
}

function resetFactCheck() {
  cancelFactCheck(true);
  state.factQuery = '';
  state.factState = 'idle';
  state.factResult = null;
  state.factError = '';
}

function currentFactCheckAvailability() {
  if (RUNTIME_CONFIG.mode === 'locked' || RUNTIME_CONFIG.configurationError) return { ready: false, code: 'configuration-locked', label: 'Konfigurace uzamčena' };
  if (RUNTIME_CONFIG.factCheck.provider === 'school-server' && !canUse('fact-check')) {
    return { ready: false, code: state.auth.status === 'checking' ? 'checking' : 'auth-required', label: state.auth.status === 'checking' ? 'Kontrola přístupu…' : 'Vyžaduje školní oprávnění' };
  }
  const base = factCheckAvailability({ online: state.online, endpoint: RUNTIME_CONFIG.factCheck.endpoint });
  if (base.ready && RUNTIME_CONFIG.factCheck.provider === 'isolated-http' && !loadFactAccessToken()) return { ready: false, code: 'access-required', label: 'Vyžaduje učitelský přístupový kód' };
  return base;
}

function factCheckStatusItem() {
  const availability = currentFactCheckAvailability();
  const dot = availability.ready ? '' : availability.code === 'offline' ? 'off' : 'warn';
  return `<button class="status-item status-button" data-action="open-fact"><span class="status-dot ${dot}"></span>Ověřit / dohledat · ${escapeHtml(availability.label)}</button>`;
}

function factCheckReadinessRow() {
  const availability = currentFactCheckAvailability();
  return readinessRow('Ověřit / dohledat', availability.label, availability.ready ? 'ok' : 'warn');
}

function renderFactResult(result) {
  const verdicts = {
    confirmed: ['Potvrzeno', 'confirmed'],
    inaccurate: ['Nepřesné', 'inaccurate'],
    mixed: ['Záleží na kontextu', 'mixed'],
    uncertain: ['Nejisté', 'uncertain'],
    not_verifiable: ['Nelze spolehlivě ověřit', 'uncertain'],
    informational: ['Dohledáno', 'confirmed']
  };
  const [label, cls] = verdicts[result.verdict] || verdicts.uncertain;
  const confidence = { high: 'vysoká', medium: 'střední', low: 'nízká' }[result.confidence] || 'nízká';
  const sources = Array.isArray(result.sources) ? result.sources : [];
  return `<section class="fact-result ${cls}" aria-live="polite">
    <div class="fact-result-head"><span class="fact-verdict ${cls}">${escapeHtml(label)}</span><span>Jistota: ${escapeHtml(confidence)}</span></div>
    <p class="fact-answer">${escapeHtml(result.answer)}</p>
    <div class="fact-sources"><h3>Zdroje ${sources.length ? `(${sources.length})` : ''}</h3>${sources.length ? `<ol>${sources.map(source => `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title || source.publisher || source.url)}</a>${source.publisher ? `<span>${escapeHtml(source.publisher)}</span>` : ''}</li>`).join('')}</ol>` : '<p>Provider nevrátil dohledatelný zdroj; výsledek proto nelze považovat za potvrzený.</p>'}</div>
    <div class="fact-result-meta"><span>${result.checkedAt ? `Ověřeno ${escapeHtml(new Date(result.checkedAt).toLocaleString('cs-CZ'))}` : 'Ověřeno online'}</span>${result.model ? `<span>Model ${escapeHtml(result.model)}</span>` : ''}</div>
  </section>`;
}

function openLightboxByRef(group, imageId) {
  const topic = getTopic();
  const images = group === 'reference'
    ? topic?.exam?.topic?.referenceImages
    : topic?.exam?.pictures?.images;
  const image = Array.isArray(images) ? images.find(item => String(item.id) === String(imageId)) : null;
  if (!image) {
    toast('Obrázek se nepodařilo najít.');
    return;
  }
  openLightbox(image.src, image.alt, image.id);
}

function openLightbox(src, alt, caption = '') {
  const safeSrc = mediaSource(src);
  if (!safeSrc) { toast('Tento obrázek nelze bezpečně zobrazit.'); return; }
  const box = document.createElement('div');
  box.className = 'image-lightbox';
  box.innerHTML = `<figure><img src="${escapeHtml(safeSrc)}" alt="${escapeHtml(alt || '')}">${caption ? `<figcaption class="lightbox-caption">${escapeHtml(caption)}</figcaption>` : ''}</figure><button class="icon-button" data-action="close-lightbox" aria-label="Zavřít">${icon('close')}</button>`;
  box.addEventListener('click', e => {
    if (e.target === box || e.target.closest('[data-action="close-lightbox"]')) closeLightbox();
  });
  document.body.appendChild(box);
}

function closeLightbox() { document.querySelector('.image-lightbox')?.remove(); }

function renderModal() {
  if (!state.modal) { modalRoot.innerHTML = ''; return; }
  if (state.modal.type === 'transition') {
    const from = PHASE_LABELS_CS[state.modal.from] || state.modal.from;
    const next = PHASE_LABELS_CS[state.modal.next] || state.modal.next;
    modalRoot.innerHTML = `<div class="modal-backdrop" role="presentation"><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="transition-title"><p class="eyebrow">Časová hranice</p><h2 id="transition-title">Přejít na ${escapeHtml(next)}?</h2><p>Potvrzením uzavřete čas části <strong>${escapeHtml(from)}</strong> a okamžitě spustíte čas části <strong>${escapeHtml(next)}</strong>. Obsah předchozí části zůstane dostupný jako náhled.</p><div class="modal-actions"><button class="soft-button" data-modal-action="cancel">Ještě ne</button><button class="primary-button" data-modal-action="confirm-transition">Přejít a spustit čas</button></div></section></div>`;
    return;
  }
  if (state.modal.type === 'clear-note') {
    const phase = PHASE_LABELS_CS[state.modal.phase] || state.modal.phase;
    modalRoot.innerHTML = `<div class="modal-backdrop" role="presentation"><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="clear-note-title"><p class="eyebrow">Pracovní poznámka</p><h2 id="clear-note-title">Smazat poznámku · ${escapeHtml(phase)}?</h2><p>Smazání je okamžité a poznámka se neukládá do koše ani do historie.</p><div class="modal-actions"><button class="soft-button" data-modal-action="cancel">Ponechat</button><button class="danger-button" data-modal-action="confirm-clear-note">Smazat poznámku</button></div></section></div>`;
    return;
  }
  if (state.modal.type === 'remove-pack') {
    modalRoot.innerHTML = `<div class="modal-backdrop" role="presentation"><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="remove-pack-title"><p class="eyebrow">Protected Content</p><h2 id="remove-pack-title">Odstranit Content Pack z tohoto zařízení?</h2><p>Smaže se lokální šifrovaná kopie balíčku. Tuto operaci nelze vrátit zpět; původní soubor <code>.mdesk</code> zůstává pouze tam, kde jste jej uložili mimo aplikaci.</p><div class="modal-actions"><button class="soft-button" data-modal-action="cancel">Ponechat</button><button class="danger-button" data-modal-action="confirm-remove-pack">Odstranit z tohoto zařízení</button></div></section></div>`;
    return;
  }
  if (state.modal.type === 'clear-review') {
    modalRoot.innerHTML = `<div class="modal-backdrop" role="presentation"><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="clear-review-title"><p class="eyebrow">Pedagogická revize</p><h2 id="clear-review-title">Vymazat všechny lokální revizní záznamy?</h2><p>Schválení, úpravy, odmítnutí i interní poznámky k aktuální verzi Content Packu budou z tohoto zařízení odstraněny. Samotný šifrovaný <code>.mdesk</code> se nemění.</p><div class="modal-actions"><button class="soft-button" data-modal-action="cancel">Ponechat</button><button class="danger-button" data-modal-action="confirm-clear-review">Vymazat revizi</button></div></section></div>`;
    return;
  }
  if (state.modal.type === 'finish') {
    modalRoot.innerHTML = `<div class="modal-backdrop" role="presentation"><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="finish-title"><p class="eyebrow">Konec relace</p><h2 id="finish-title">Ukončit ${state.session?.mode === 'exam' ? 'zkoušku' : 'nácvik'}?</h2><p>Potvrzením se zastaví celkový i sekční čas. Pracovní poznámky zůstanou dostupné v souhrnu, dokud nepřejdete na nové téma.</p><div class="modal-actions"><button class="soft-button" data-modal-action="cancel">Pokračovat</button><button class="primary-button" data-modal-action="confirm-finish">Ukončit a zastavit čas</button></div></section></div>`;
    return;
  }
  modalRoot.innerHTML = `<div class="modal-backdrop" role="presentation"><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="discard-title"><h2 id="discard-title">Smazat pracovní poznámky?</h2><p>Přechodem na ${state.modal.destination === 'home' ? 'úvod' : 'nové téma'} budou všechny poznámky z aktuální relace trvale odstraněny. Aplikace je nikam nearchivuje.</p><div class="modal-actions"><button class="soft-button" data-modal-action="cancel">Zrušit</button><button class="danger-button" data-modal-action="discard">Smazat a pokračovat</button></div></section></div>`;
}

function updateConnectivity() {
  document.querySelectorAll('[data-connectivity]').forEach(node => {
    node.innerHTML = `<span class="status-dot ${state.online ? '' : 'off'}"></span>${state.online ? 'Online' : 'Offline'}`;
  });
  if (state.drawer === 'fact') renderDrawer();
}

function cycleTheme() {
  const order = ['system', 'light', 'dark'];
  state.theme = order[(order.indexOf(state.theme) + 1) % order.length];
  applyTheme(state.theme);
  saveUi();
  toast(`Vzhled: ${state.theme === 'system' ? 'podle systému' : state.theme === 'light' ? 'světlý' : 'tmavý'}`);
}

function applyTheme(theme) { document.documentElement.dataset.theme = theme; }

function brandLockup() {
  return `<div class="brand-lockup"><img class="brand-mark" src="./assets/icons/app-mark.svg" alt=""><div class="brand-copy"><strong>Maturita Desk</strong><span>Ústní zkouška z anglického jazyka</span></div></div>`;
}

function footer() {
  return `<footer class="home-footer"><span>Gymnázium, Ostrava-Hrabůvka · Součást AI Studia GHRAB</span><span>Maturita Desk ${APP_VERSION} · ${PILOT_INTERNAL_REVIEW ? 'Stage 13R · Internal Review Local' : 'Stage 13R · Serverless Candidate'}</span></footer>`;
}

function toast(message) {
  toastRoot.innerHTML = `<div class="toast">${escapeHtml(message)}</div>`;
  window.clearTimeout(toast._timer);
  toast._timer = window.setTimeout(() => { toastRoot.innerHTML = ''; }, 2600);
}

function topicNumber(topic) {
  const id = Number(topic?.id);
  return Number.isInteger(id) && id >= 0 ? String(id).padStart(2, '0') : '--';
}

function formatBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function formatCell(value) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

function mediaSource(value) {
  return safeImageSource(value) ? String(value) : '';
}

function icon(name) {
  const common = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const map = {
    back: `<svg ${common}><path d="m15 18-6-6 6-6"/><path d="M9 12h11"/></svg>`,
    notes: `<svg ${common}><path d="M5 4h10l4 4v12H5z"/><path d="M15 4v5h5"/><path d="M8 13h8M8 17h6"/></svg>`,
    search: `<svg ${common}><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/><path d="M8.5 11h5"/></svg>`,
    theme: `<svg ${common}><path d="M20 15.5A8.5 8.5 0 1 1 8.5 4 6.5 6.5 0 0 0 20 15.5Z"/></svg>`,
    close: `<svg ${common}><path d="m6 6 12 12M18 6 6 18"/></svg>`,
    lock: `<svg ${common}><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>`
  };
  return map[name] || '';
}

let serviceWorkerRegistration = null;
let reloadAfterControllerChange = false;

function markServiceWorkerUpdateReady(registration) {
  if (!registration?.waiting) return;
  state.runtime.update = 'ready';
  pilotEvent('sw.update-ready', { runningSession: state.session?.status === 'running' });
  if (!state.session && state.screen === 'home') render();
  else if (state.session?.status === 'running') toast('Aktualizace aplikace je připravena. Použije se až po ukončení relace.');
}

function watchServiceWorkerUpdate(registration) {
  if (!registration) return;
  if (registration.waiting) markServiceWorkerUpdateReady(registration);
  registration.addEventListener?.('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener?.('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker?.controller) markServiceWorkerUpdateReady(registration);
    });
  });
}

async function applyPendingUpdate() {
  if (state.session?.status === 'running') {
    toast('Aktualizaci neprovádím během zkoušky. Nejdříve relaci ukončete.');
    return false;
  }
  const waiting = serviceWorkerRegistration?.waiting;
  if (!waiting) {
    state.runtime.update = 'idle';
    toast('Žádná čekající aktualizace není k dispozici.');
    return false;
  }
  pilotEvent('sw.update-apply-requested');
  reloadAfterControllerChange = true;
  state.runtime.update = 'applying';
  waiting.postMessage({ type: 'GHRAB_SKIP_WAITING' });
  return true;
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    state.runtime.shell = 'unsupported';
    if (['preflight', 'practice-preflight', 'home', 'review'].includes(state.screen)) render();
    return;
  }
  navigator.serviceWorker.addEventListener?.('controllerchange', () => {
    state.runtime.update = 'idle';
    if (reloadAfterControllerChange && state.session?.status !== 'running') {
      reloadAfterControllerChange = false;
      globalThis.location?.reload?.();
    }
  });
  const run = async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      serviceWorkerRegistration = registration;
      watchServiceWorkerUpdate(registration);
      await navigator.serviceWorker.ready;
      state.runtime.shell = 'ready';
      pilotMetric('pwa.shellReady', { online: state.online, displayMode: state.runtime.device.displayMode || 'unknown' });
      if (['preflight', 'practice-preflight', 'home', 'review'].includes(state.screen)) render();
    } catch (error) {
      state.runtime.shell = 'error';
      console.warn('[Maturita Desk] Service worker registration failed.', error);
      if (['preflight', 'practice-preflight', 'home', 'review'].includes(state.screen)) render();
    }
  };
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
}

function storageWritable() {
  try {
    const key = 'ghrab.maturita-desk.storage-probe';
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return true;
  } catch { return false; }
}

let wakeLockSentinel = null;

async function requestWakeLock() {
  if (!state.session || state.session.status !== 'running') return false;
  if (!('wakeLock' in navigator) || typeof navigator.wakeLock?.request !== 'function') {
    state.runtime.wakeLock = 'unsupported';
    updateWakeStatus();
    return false;
  }
  if (document.visibilityState && document.visibilityState !== 'visible') return false;
  try {
    if (wakeLockSentinel && !wakeLockSentinel.released) {
      state.runtime.wakeLock = 'active';
      updateWakeStatus();
      return true;
    }
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    state.runtime.wakeLock = 'active';
    wakeLockSentinel.addEventListener?.('release', () => {
      wakeLockSentinel = null;
      if (state.session?.status === 'running') state.runtime.wakeLock = 'available';
      else state.runtime.wakeLock = 'available';
      updateWakeStatus();
    });
    updateWakeStatus();
    return true;
  } catch (error) {
    console.warn('[Maturita Desk] Screen Wake Lock unavailable.', error);
    state.runtime.wakeLock = 'denied';
    updateWakeStatus();
    return false;
  }
}

async function releaseWakeLock() {
  const sentinel = wakeLockSentinel;
  wakeLockSentinel = null;
  if (sentinel && !sentinel.released) {
    try { await sentinel.release(); } catch {}
  }
  if ('wakeLock' in navigator) state.runtime.wakeLock = 'available';
  else state.runtime.wakeLock = 'unsupported';
  updateWakeStatus();
}

function updateWakeStatus() {
  document.querySelectorAll('[data-wake-status]').forEach(node => {
    if (node.classList.contains('wake-chip')) {
      node.className = `wake-chip ${state.runtime.wakeLock}`;
      node.title = wakeLockLabel();
      const dot = node.querySelector('.status-dot');
      if (dot) dot.className = `status-dot ${state.runtime.wakeLock === 'active' ? '' : state.runtime.wakeLock === 'denied' ? 'warn' : 'off'}`.trim();
      return;
    }
    node.innerHTML = `<span class="status-dot ${state.runtime.wakeLock === 'active' ? '' : state.runtime.wakeLock === 'denied' ? 'warn' : 'off'}"></span>Displej · ${escapeHtml(wakeLockLabel())}`;
  });
}

function setupWakeLockLifecycle() {
  if (!('wakeLock' in navigator)) state.runtime.wakeLock = 'unsupported';
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.session?.status === 'running') requestWakeLock();
    else if (document.visibilityState === 'hidden' && wakeLockSentinel) releaseWakeLock();
  });
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', event => {
    const target = event.target;
    const tag = String(target?.tagName || '').toLowerCase();
    const typing = ['input', 'textarea', 'select'].includes(tag) || target?.isContentEditable;
    if (event.key === 'Escape') {
      if (state.drawer) { event.preventDefault(); closeDrawer(); return; }
      if (document.querySelector('.image-lightbox')) { event.preventDefault(); closeLightbox(); return; }
      if (state.modal) { event.preventDefault(); state.modal = null; renderModal(); return; }
    }
    if (typing || !state.session || !event.altKey) return;
    if (event.key.toLowerCase() === 'n') { event.preventDefault(); state.drawer = 'notes'; state.notesTab = state.session.viewPhase || state.session.activePhase; renderDrawer(); }
    if (event.key.toLowerCase() === 'f') { event.preventDefault(); state.drawer = 'fact'; state.factState = 'idle'; renderDrawer(); }
  });
}

function persistSessionForLifecycle(reason = 'lifecycle') {
  state.runtime.lifecycle = reason;
  pilotEvent('lifecycle.background', { reason });
  if (!state.session) return true;
  if (state.session.status === 'running') touchClock(state.session);
  return saveSession({ broadcast: false });
}

function restoreSessionForeground(reason = 'foreground') {
  state.runtime.lifecycle = 'active';
  pilotEvent('lifecycle.foreground', { reason });
  deviceRuntimeController?.refresh?.();
  if (state.session?.status === 'running') {
    touchClock(state.session);
    saveSession({ broadcast: false });
    if (state.screen === 'console') updateTimers();
    requestWakeLock();
  } else if (state.screen === 'console') {
    updateTimers();
  }
  syncRootRuntimeFlags();
}

function setupLifecyclePersistence() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistSessionForLifecycle('hidden');
    else restoreSessionForeground('visible');
  });
  document.addEventListener('freeze', () => persistSessionForLifecycle('freeze'));
  document.addEventListener('resume', () => restoreSessionForeground('resume'));
  window.addEventListener('pagehide', () => persistSessionForLifecycle('pagehide'));
  window.addEventListener('pageshow', () => restoreSessionForeground('pageshow'));
  window.addEventListener('focus', () => restoreSessionForeground('focus'));
  window.addEventListener('beforeunload', () => persistSessionForLifecycle('beforeunload'));
}

function setupSessionCoordination() {
  if (typeof globalThis.BroadcastChannel === 'function') {
    sessionChannel = new BroadcastChannel('ghrab.maturita-desk.session-presence.v2');
    sessionChannel.addEventListener('message', event => {
      const msg = event.data;
      if (!msg || msg.instanceId === INSTANCE_ID || !['active-session', 'takeover'].includes(msg.type)) return;
      if (!state.session || state.session.status !== 'running') return;
      const owner = readSessionOwner(localStorage);
      if (owner?.fresh && owner.instanceId !== INSTANCE_ID) {
        state.runtime.sessionLock = 'conflict';
        pilotEvent('session.conflict-detected', { messageType: msg.type, sameSession: msg.sessionId === state.session.id });
        state.screen = 'session-conflict';
        render();
        toast('Jiný panel převzal zápis aktivní relace. Tento panel už data nepřepisuje.');
      }
    });
  }
  if (state.session?.status === 'running' && state.runtime.sessionLock !== 'conflict') {
    const result = claimSessionOwnership(localStorage, { instanceId: INSTANCE_ID, sessionId: state.session.id });
    state.runtime.sessionLock = result.ok ? 'owned' : 'conflict';
    if (!result.ok) state.screen = 'session-conflict';
  }
  broadcastSessionPresence();
}

function heartbeatSessionOwnership(now = Date.now()) {
  if (!state.session || state.session.status !== 'running' || state.runtime.sessionLock === 'conflict') return false;
  if (now - lastSessionOwnerHeartbeatAt < SESSION_OWNER_HEARTBEAT_MS) return true;
  lastSessionOwnerHeartbeatAt = now;
  const result = refreshSessionOwnership(localStorage, { instanceId: INSTANCE_ID, sessionId: state.session.id, now });
  if (!result.ok) {
    state.runtime.sessionLock = 'conflict';
    pilotEvent('session.ownership-lost', { reason: result.reason || 'conflict' });
    state.screen = 'session-conflict';
    render();
    return false;
  }
  state.runtime.sessionLock = 'owned';
  return true;
}

function broadcastSessionPresence(type = 'active-session') {
  if (!sessionChannel || state.session?.status !== 'running') return;
  sessionChannel.postMessage({ type, instanceId: INSTANCE_ID, sessionId: state.session.id, at: Date.now() });
}

function takeOverSession() {
  if (!state.session?.id) return;
  const result = claimSessionOwnership(localStorage, { instanceId: INSTANCE_ID, sessionId: state.session.id, force: true });
  if (!result.ok) {
    toast('Relaci se nepodařilo převzít. Zavřete ostatní panely a zkuste to znovu.');
    return;
  }
  state.runtime.sessionLock = 'owned';
  state.screen = state.session.contentRef?.source === 'pack' && !state.content.unlocked ? 'resume-locked' : (state.session.status === 'finished' ? 'finished' : 'console');
  pilotEvent('session.takeover', { sessionId: state.session.id });
  broadcastSessionPresence('takeover');
  saveSession({ broadcast: false });
  render();
}

function renderSessionConflict() {
  const owner = readSessionOwner(localStorage);
  const fresh = owner?.fresh;
  return `<main class="page-shell"><div class="content-frame"><div class="page-topline">${brandLockup()}<span class="prototype-pill">Stage 13R · Multi-tab guard</span></div><section class="unlock-resume-card session-conflict-card"><p class="eyebrow">Concurrency guard</p><h1>Aktivní relaci zapisuje jiný panel</h1><p>Tento panel je zablokovaný pro zápis, aby nemohl přepsat timer nebo Notes. ${fresh ? 'Jiný panel má čerstvý zápisový lease.' : 'Původní lease už není čerstvý.'}</p><div class="safety-block"><strong>Nejbezpečnější postup</strong><span>Vraťte se do původního panelu. Převzetí použijte pouze tehdy, pokud je původní panel zavřený nebo nereaguje.</span></div><div class="finish-actions"><button class="primary-button" data-action="session-takeover">Převzít zápis této relace</button><button class="soft-button" data-action="go-home">Zpět</button></div></section></div></main>`;
}

// Section buttons use event delegation but are intentionally not data-action controls,
// because changing a section must never affect the active exam phase/timer.
app.addEventListener('click', event => {
  const button = event.target.closest('[data-section-button]');
  if (!button || !state.session) return;
  setSectionState(state.session, button.dataset.sectionButton);
  saveSession();
  renderConsoleContent();
});

