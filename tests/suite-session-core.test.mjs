import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createSuitePlatform } from './suite-test-utils.mjs';

const DATA_MANIFEST = JSON.parse(fs.readFileSync(new URL('../src/config/data-manifest.json', import.meta.url), 'utf8'));
const CANARY_ID = process.env.GARP_CANARY_ID || crypto.randomUUID().slice(0, 12);
const CANARY = `GARP-STUDENT-CANARY-${CANARY_ID}`;
const CANARY_EMAIL = `garp.student.canary.${CANARY_ID}@example.invalid`;

class TrackingStorage {
  constructor(entries = []) { this.map = new Map(entries); this.history = []; this.failRemoveKey = ''; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); this.history.push({ op: 'set', key, value: String(value) }); }
  removeItem(key) {
    this.history.push({ op: 'remove', key });
    if (key === this.failRemoveKey) throw new Error('synthetic remove failure');
    this.map.delete(key);
  }
}

class FakeIndexedDb {
  constructor(names = []) { this.names = new Set(names); this.deleted = []; this.failDeleteName = ''; }
  deleteDatabase(name) {
    const request = {};
    queueMicrotask(() => {
      if (name === this.failDeleteName) {
        request.error = new Error('synthetic indexedDB delete failure');
        request.onerror?.();
        return;
      }
      this.names.delete(name);
      this.deleted.push(name);
      request.onsuccess?.();
    });
    return request;
  }
}

function seedSensitive(local, session) {
  local.setItem('ghrab.maturita-desk.session.v1', JSON.stringify({ notes: CANARY, email: CANARY_EMAIL }));
  local.setItem('ghrab.maturita-desk.session-owner.v1', CANARY);
  local.setItem('ghrab.maturita-desk.pilot-run.v1', JSON.stringify({ note: CANARY }));
  local.setItem('ghrab.maturita-desk.auth-lease.v1', `lease-${CANARY}`);
  session.setItem('ghrab.maturita-desk.fact-access.v1', `token-${CANARY}`);
}
function seedPreserved(local) {
  local.setItem('ghrab.maturita-desk.installation-id.v1', 'mdi-SYNTHETIC-INSTALLATION');
  local.setItem('ghrab.maturita-desk.ui-settings.v1', JSON.stringify({ theme: 'dark' }));
}
function assertSensitiveCleared(local, session, idb) {
  for (const key of ['ghrab.maturita-desk.session.v1','ghrab.maturita-desk.session-owner.v1','ghrab.maturita-desk.pilot-run.v1','ghrab.maturita-desk.auth-lease.v1']) assert.equal(local.getItem(key), null, `${key} should be cleared`);
  assert.equal(session.getItem('ghrab.maturita-desk.fact-access.v1'), null);
  assert.equal(idb.names.has('ghrab.maturita-desk.pedagogical-review.v1'), false);
}
function assertPreserved(local) {
  assert.equal(local.getItem('ghrab.maturita-desk.installation-id.v1'), 'mdi-SYNTHETIC-INSTALLATION');
  assert.equal(JSON.parse(local.getItem('ghrab.maturita-desk.ui-settings.v1')).theme, 'dark');
}
async function tick() { await new Promise(resolve => setTimeout(resolve, 0)); }
async function freshSuite(label) { return await import(`../src/suite-session.js?qa=${label}-${Date.now()}-${Math.random()}`); }

// 1) OPEN-CHILD SUITE END + F-02 ordering.
{
  const suite = await freshSuite('open');
  const local = new TrackingStorage(); const session = new TrackingStorage();
  seedSensitive(local, session); seedPreserved(local);
  const idb = new FakeIndexedDb(['ghrab.maturita-desk.pedagogical-review.v1','ghrab.maturita-desk.protected-content.v1']);
  const platform = createSuitePlatform(local);
  const controller = await suite.installSuiteSessionLifecycle({ platform, localStore: local, sessionStore: session, indexedDb: idb, dataManifest: DATA_MANIFEST });
  let memoryCanary = CANARY;
  controller.registerRuntimeReset(() => { memoryCanary = ''; return { ok: true }; });
  const result = await platform.session.testEnd('gen-open-child', 'qa-open-child');
  await tick();
  assert.equal(result.ok, true);
  assertSensitiveCleared(local, session, idb); assertPreserved(local);
  assert.equal(memoryCanary, '');
  assert.equal(idb.names.has('ghrab.maturita-desk.protected-content.v1'), true, 'encrypted Content Pack DB must survive end-work');
  assert.equal(platform.session.seen(), 'gen-open-child');
  const phases = local.history.filter(item => item.op === 'set' && item.key === suite.SUITE_SESSION_STATUS_KEY).map(item => JSON.parse(item.value).phase);
  assert.deepEqual(phases, ['observed','cleanup-complete','acknowledged']);
  const cleanupIndex = local.history.findIndex(item => item.op === 'set' && item.key === suite.SUITE_SESSION_STATUS_KEY && JSON.parse(item.value).phase === 'cleanup-complete');
  const seenIndex = local.history.findIndex(item => item.op === 'set' && item.key === suite.SUITE_SESSION_SEEN_KEY && item.value === 'gen-open-child');
  assert.ok(seenIndex > cleanupIndex, 'acknowledgement must be written after cleanup-complete');
}

// 2) DELAYED-OPEN REPLAY + reload/idempotence.
{
  const suite = await freshSuite('delayed');
  const local = new TrackingStorage(); const session = new TrackingStorage();
  seedSensitive(local, session); seedPreserved(local);
  local.setItem(suite.SUITE_SESSION_GENERATION_KEY, 'gen-delayed-open');
  const idb = new FakeIndexedDb(['ghrab.maturita-desk.pedagogical-review.v1']);
  const platform = createSuitePlatform(local);
  const controller = await suite.installSuiteSessionLifecycle({ platform, localStore: local, sessionStore: session, indexedDb: idb, dataManifest: DATA_MANIFEST });
  await tick();
  assertSensitiveCleared(local, session, idb); assertPreserved(local);
  assert.equal(platform.session.seen(), 'gen-delayed-open');
  const removesAfterReplay = local.history.filter(item => item.op === 'remove').length + session.history.filter(item => item.op === 'remove').length;
  const dbDeletesAfterReplay = idb.deleted.length;
  const reconciliation = await controller.reconcile('qa-reload');
  assert.deepEqual({ ok: reconciliation.ok, pending: reconciliation.pending }, { ok: true, pending: false });
  assert.equal(local.history.filter(item => item.op === 'remove').length + session.history.filter(item => item.op === 'remove').length, removesAfterReplay, 'same generation must not replay destructive cleanup');
  assert.equal(idb.deleted.length, dbDeletesAfterReplay, 'same generation must not re-delete IndexedDB');
}

// 3) MULTI-TAB/STALE WRITER GENERATION GUARD.
{
  const suiteA = await freshSuite('tab-a');
  const suiteB = await freshSuite('tab-b');
  const sharedLocal = new TrackingStorage();
  const platformA = createSuitePlatform(sharedLocal); const platformB = createSuitePlatform(sharedLocal);
  const sessionA = new TrackingStorage(); const sessionB = new TrackingStorage();
  const idbA = new FakeIndexedDb(); const idbB = new FakeIndexedDb();
  const ctlA = await suiteA.installSuiteSessionLifecycle({ platform: platformA, localStore: sharedLocal, sessionStore: sessionA, indexedDb: idbA, dataManifest: DATA_MANIFEST });
  const ctlB = await suiteB.installSuiteSessionLifecycle({ platform: platformB, localStore: sharedLocal, sessionStore: sessionB, indexedDb: idbB, dataManifest: DATA_MANIFEST });
  sharedLocal.setItem(suiteA.SUITE_SESSION_GENERATION_KEY, 'gen-cross-tab');
  assert.equal(ctlA.persistenceAllowed(), false, 'tab A must block writes immediately on generation mismatch');
  assert.equal(ctlB.persistenceAllowed(), false, 'tab B must block writes immediately on generation mismatch');
  assert.throws(() => suiteA.assertSuiteSessionPersistenceAllowed(sharedLocal), /pending/i);
  // Even if another tab/actor writes app-level seen, stale tab runtime generation must remain blocked until reconcile.
  sharedLocal.setItem(suiteA.SUITE_SESSION_SEEN_KEY, 'gen-cross-tab');
  assert.equal(ctlA.persistenceAllowed(), false);
  const reconciled = await ctlA.reconcile('qa-stale-tab');
  assert.equal(reconciled.ok, true);
  assert.equal(ctlA.persistenceAllowed(), true);
}

// 4) FAIL-CLOSED: storage delete fails -> no false acknowledgement and writers remain blocked.
{
  const suite = await freshSuite('fail-closed');
  const local = new TrackingStorage(); const session = new TrackingStorage(); seedSensitive(local, session);
  local.failRemoveKey = 'ghrab.maturita-desk.session.v1';
  const idb = new FakeIndexedDb(['ghrab.maturita-desk.pedagogical-review.v1']);
  const platform = createSuitePlatform(local);
  const controller = await suite.installSuiteSessionLifecycle({ platform, localStore: local, sessionStore: session, indexedDb: idb, dataManifest: DATA_MANIFEST });
  const result = await platform.session.testEnd('gen-fail-closed', 'qa-fail-closed');
  await tick();
  assert.equal(result.ok, false);
  assert.notEqual(platform.session.seen(), 'gen-fail-closed', 'failed cleanup must not be acknowledged');
  assert.equal(controller.persistenceAllowed(), false, 'failed generation keeps persistence fail-closed');
  assert.equal(JSON.parse(local.getItem(suite.SUITE_SESSION_STATUS_KEY)).phase, 'failed');
}

// 5) Manifest destructive plan refuses wildcards / foreign namespaces.
{
  const suite = await freshSuite('manifest');
  const hostile = structuredClone(DATA_MANIFEST);
  hostile.stores.push({ kind: 'localStorage', patterns: ['ghrab.*'], clearOnEndWork: true });
  assert.throws(() => suite.deriveSuiteCleanupPlan(hostile), /Unsafe destructive storage pattern/);
}

console.log(`Suite-session core QA: PASS | canary=${CANARY} | email=${CANARY_EMAIL}`);
