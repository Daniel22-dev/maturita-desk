export const SUITE_SESSION_CONTRACT = 'ghrab-suite-session-v1';
export const SUITE_SESSION_GENERATION_KEY = 'ghrab.platform.suite-session-generation.v1';
export const SUITE_SESSION_SEEN_KEY = 'ghrab.maturita-desk.suite-session-seen.v1';
export const SUITE_SESSION_STATUS_KEY = 'ghrab.maturita-desk.suite-session-status.v1';

export function deriveSuiteCleanupPlan(manifest) {
  if (!manifest || manifest.schema !== 'ghrab-data-manifest-v1' || manifest.appId !== 'maturita-desk') {
    throw new Error('Maturita Desk data manifest is invalid or belongs to another app.');
  }
  const plan = { localStorage: [], sessionStorage: [], indexedDB: [] };
  for (const store of Array.isArray(manifest.stores) ? manifest.stores : []) {
    if (store?.clearOnEndWork !== true) continue;
    if (!Object.prototype.hasOwnProperty.call(plan, store.kind)) throw new Error(`Unsupported clearOnEndWork store kind: ${String(store?.kind || '')}`);
    const patterns = Array.isArray(store.patterns) ? store.patterns : [];
    if (!patterns.length) throw new Error(`Missing owned storage pattern for ${store.kind}.`);
    for (const pattern of patterns) {
      const value = String(pattern || '');
      // Destructive suite cleanup intentionally accepts exact owned names only.
      if (!value || value.includes('*') || !value.startsWith('ghrab.maturita-desk.')) {
        throw new Error(`Unsafe destructive storage pattern in data manifest: ${value}`);
      }
      plan[store.kind].push(value);
    }
  }
  return Object.freeze({
    localStorage: Object.freeze([...new Set(plan.localStorage)]),
    sessionStorage: Object.freeze([...new Set(plan.sessionStorage)]),
    indexedDB: Object.freeze([...new Set(plan.indexedDB)])
  });
}

async function loadDataManifest(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('Data manifest cannot be loaded without Fetch API.');
  const response = await fetchImpl(new URL('./config/data-manifest.json', import.meta.url), {
    method: 'GET', credentials: 'same-origin', cache: 'no-cache', redirect: 'error', headers: { Accept: 'application/json' }
  });
  if (!response?.ok) throw new Error(`Data manifest load failed (HTTP ${response?.status || 0}).`);
  const text = await response.text();
  if (text.length > 128 * 1024) throw new Error('Data manifest is unexpectedly large.');
  return JSON.parse(text);
}

let runtimeGeneration = null;
let blockedGeneration = '';
let activeCleanup = null;
let activeCleanupGeneration = '';
const runtimeResetHandlers = new Set();

function readStorage(store, key) {
  try { return String(store?.getItem?.(key) || ''); } catch { return ''; }
}

function writeVerified(store, key, value) {
  try {
    if (!store?.setItem) return false;
    store.setItem(key, String(value));
    return store.getItem(key) === String(value);
  } catch { return false; }
}

function removeVerified(store, key) {
  try {
    if (!store?.removeItem) return false;
    store.removeItem(key);
    return store.getItem(key) === null;
  } catch { return false; }
}

function suiteGeneration(localStore = globalThis.localStorage) {
  return readStorage(localStore, SUITE_SESSION_GENERATION_KEY);
}

export function suiteSessionPersistenceAllowed(localStore = globalThis.localStorage) {
  const current = suiteGeneration(localStore);
  if (blockedGeneration) return false;
  if (runtimeGeneration === null) return current === '';
  return current === runtimeGeneration;
}

export function assertSuiteSessionPersistenceAllowed(localStore = globalThis.localStorage) {
  if (!suiteSessionPersistenceAllowed(localStore)) throw new Error('Suite-session cleanup is pending; persistence is fail-closed.');
  return true;
}

function statusRecord(generation, phase, extra = {}) {
  return JSON.stringify({
    schema: SUITE_SESSION_CONTRACT,
    appId: 'maturita-desk',
    generation: String(generation || ''),
    phase,
    at: new Date().toISOString(),
    ...extra
  });
}

function writeStatus(localStore, generation, phase, extra = {}) {
  return writeVerified(localStore, SUITE_SESSION_STATUS_KEY, statusRecord(generation, phase, extra));
}

async function deleteDatabaseVerified(indexedDb, name) {
  if (!indexedDb?.deleteDatabase) return false;
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(Boolean(value));
    };
    try {
      const request = indexedDb.deleteDatabase(name);
      request.onsuccess = () => finish(true);
      request.onerror = () => finish(false);
      request.onblocked = () => finish(false);
    } catch {
      finish(false);
    }
  });
}

async function resetRuntime(detail) {
  const failures = [];
  for (const handler of [...runtimeResetHandlers]) {
    try {
      const result = await handler(detail);
      if (result === false || result?.ok === false) failures.push('runtime-reset');
    } catch {
      failures.push('runtime-reset');
    }
  }
  return failures;
}

async function performCleanup(detail, {
  platform,
  localStore,
  sessionStore,
  indexedDb,
  remoteLogout,
  cleanupPlan
}) {
  const generation = String(detail?.generation || '');
  if (!generation || detail?.schema !== SUITE_SESSION_CONTRACT) return { ok: false, reason: 'invalid-suite-session-signal' };

  blockedGeneration = generation;
  const failures = [];
  if (!writeStatus(localStore, generation, 'observed', { reason: String(detail.reason || 'suite-end'), replay: Boolean(detail.replay) })) {
    failures.push('status-observed-write');
  }

  failures.push(...await resetRuntime(detail));

  for (const key of cleanupPlan.sessionStorage) {
    if (!removeVerified(sessionStore, key)) failures.push(`sessionStorage:${key}`);
  }
  for (const key of cleanupPlan.localStorage) {
    if (!removeVerified(localStore, key)) failures.push(`localStorage:${key}`);
  }
  for (const name of cleanupPlan.indexedDB) {
    if (!await deleteDatabaseVerified(indexedDb, name)) failures.push(`indexedDB:${name}`);
  }

  if (typeof remoteLogout === 'function') {
    try {
      const result = await remoteLogout(detail);
      if (result === false || result?.ok === false) failures.push(`remote-logout:${String(result?.reason || 'unconfirmed')}`);
    } catch {
      failures.push('remote-logout:error');
    }
  }

  if (failures.length) {
    writeStatus(localStore, generation, 'failed', { failures: [...new Set(failures)] });
    return { ok: false, generation, failures: [...new Set(failures)] };
  }

  if (!writeStatus(localStore, generation, 'cleanup-complete')) {
    writeStatus(localStore, generation, 'failed', { failures: ['status-cleanup-complete-write'] });
    return { ok: false, generation, failures: ['status-cleanup-complete-write'] };
  }

  runtimeGeneration = generation;
  blockedGeneration = '';

  // Platform 1.1.2 writes the per-app acknowledgement only after this handler
  // resolves successfully. Record the fourth F-02 phase after that platform write.
  globalThis.setTimeout?.(() => {
    try {
      if (platform?.session?.seen?.() === generation) writeStatus(localStore, generation, 'acknowledged');
    } catch {}
  }, 0);

  return { ok: true, generation };
}

export async function installSuiteSessionLifecycle({
  platform = globalThis.GHRAB_PLATFORM,
  localStore = globalThis.localStorage,
  sessionStore = globalThis.sessionStorage,
  indexedDb = globalThis.indexedDB,
  remoteLogout = null,
  dataManifest = null,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!platform || platform.version !== '1.1.2' || platform.contract !== 'ghrab-platform-v1') {
    throw new Error('Maturita Desk requires the verified GHRAB Platform 1.1.2 runtime.');
  }
  if (platform.session?.contract !== SUITE_SESSION_CONTRACT || typeof platform.session.onEnd !== 'function') {
    throw new Error('GHRAB Platform 1.1.2 suite-session contract is unavailable.');
  }
  const manifest = dataManifest || await loadDataManifest(fetchImpl);
  const cleanupPlan = deriveSuiteCleanupPlan(manifest);

  const current = String(platform.session.generation?.() || suiteGeneration(localStore));
  const seen = String(platform.session.seen?.() || readStorage(localStore, SUITE_SESSION_SEEN_KEY));
  runtimeGeneration = current && current !== seen ? seen : current;
  blockedGeneration = current && current !== seen ? current : '';

  const handler = (detail) => {
    const generation = String(detail?.generation || '');
    if (activeCleanup && activeCleanupGeneration === generation) return activeCleanup;
    activeCleanupGeneration = generation;
    activeCleanup = performCleanup(detail, { platform, localStore, sessionStore, indexedDb, remoteLogout, cleanupPlan })
      .finally(() => {
        activeCleanup = null;
        activeCleanupGeneration = '';
      });
    return activeCleanup;
  };

  const unsubscribe = platform.session.onEnd(handler, { replay: true });
  if (activeCleanup) await activeCleanup;

  return Object.freeze({
    contract: SUITE_SESSION_CONTRACT,
    cleanupPlan,
    registerRuntimeReset(callback) {
      if (typeof callback !== 'function') throw new TypeError('Runtime reset callback must be a function.');
      runtimeResetHandlers.add(callback);
      return () => runtimeResetHandlers.delete(callback);
    },
    persistenceAllowed: () => suiteSessionPersistenceAllowed(localStore),
    async reconcile(reason = 'runtime-reconcile') {
      const generation = String(platform.session.generation?.() || suiteGeneration(localStore));
      if (!generation || (generation === runtimeGeneration && !blockedGeneration)) return { ok: true, pending: false, generation };
      return await handler(Object.freeze({
        schema: SUITE_SESSION_CONTRACT,
        generation,
        reason,
        clearApplicationData: true,
        appId: 'maturita-desk',
        replay: true
      }));
    },
    status() {
      return Object.freeze({
        generation: String(platform.session.generation?.() || ''),
        seen: String(platform.session.seen?.() || ''),
        runtimeGeneration: String(runtimeGeneration || ''),
        blockedGeneration: String(blockedGeneration || ''),
        persistenceAllowed: suiteSessionPersistenceAllowed(localStore),
        statusRecord: readStorage(localStore, SUITE_SESSION_STATUS_KEY)
      });
    },
    unsubscribe
  });
}
