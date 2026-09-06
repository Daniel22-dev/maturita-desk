import assert from 'node:assert/strict';
import fs from 'node:fs';
import { deriveSuiteCleanupPlan } from '../src/suite-session.js';

const root = new URL('../', import.meta.url);
const read = rel => fs.readFileSync(new URL(rel, root), 'utf8');
const manifest = JSON.parse(read('src/config/data-manifest.json'));
const plan = deriveSuiteCleanupPlan(manifest);

assert.deepEqual([...plan.localStorage].sort(), [
  'ghrab.maturita-desk.auth-lease.v1',
  'ghrab.maturita-desk.pilot-run.v1',
  'ghrab.maturita-desk.session-owner.v1',
  'ghrab.maturita-desk.session.v1'
].sort());
assert.deepEqual([...plan.sessionStorage], ['ghrab.maturita-desk.fact-access.v1']);
assert.deepEqual([...plan.indexedDB], ['ghrab.maturita-desk.pedagogical-review.v1']);

const allStores = manifest.stores.flatMap(store => (store.patterns || []).map(pattern => ({ ...store, pattern })));
function entry(kind, pattern) { return allStores.find(item => item.kind === kind && item.pattern === pattern); }
for (const [kind, pattern] of [
  ['localStorage','ghrab.maturita-desk.session.v1'],
  ['localStorage','ghrab.maturita-desk.session-owner.v1'],
  ['localStorage','ghrab.maturita-desk.pilot-run.v1'],
  ['localStorage','ghrab.maturita-desk.auth-lease.v1'],
  ['localStorage','ghrab.maturita-desk.installation-id.v1'],
  ['localStorage','ghrab.maturita-desk.ui-settings.v1'],
  ['sessionStorage','ghrab.maturita-desk.fact-access.v1'],
  ['indexedDB','ghrab.maturita-desk.protected-content.v1'],
  ['indexedDB','ghrab.maturita-desk.pedagogical-review.v1'],
  ['cacheStorage','ghrab-maturita-desk-v*']
]) assert.ok(entry(kind, pattern), `PC-01 manifest missing ${kind}:${pattern}`);
assert.equal(entry('indexedDB','ghrab.maturita-desk.protected-content.v1').clearOnEndWork, false);
assert.equal(entry('cacheStorage','ghrab-maturita-desk-v*').clearOnEndWork, false);
assert.equal(entry('localStorage','ghrab.maturita-desk.installation-id.v1').clearOnEndWork, false);

// PC-01: every real writer/sink must remain represented and guarded where content can be restored.
const main = read('src/main.js');
const sessionCoordinator = read('src/session-coordinator.js');
const authLease = read('src/providers/auth-lease.js');
const reviewStore = read('src/review-store.js');
const protectedStore = read('src/content-pack-store.js');
const sw = read('sw.js');
assert.match(main, /localStorage\.setItem\(PILOT_STORAGE_KEY/);
assert.match(main, /localStorage\.setItem\(SESSION_KEY/);
assert.match(main, /sessionStorage\.setItem\(FACT_ACCESS_KEY/);
assert.match(main, /SUITE_LIFECYCLE\.persistenceAllowed\(\)/);
assert.match(sessionCoordinator, /suiteSessionPersistenceAllowed\(storage\)/);
assert.match(authLease, /assertSuiteSessionPersistenceAllowed\(storage\)/);
assert.match(reviewStore, /assertSuiteSessionPersistenceAllowed\(\)/);
assert.match(protectedStore, /ghrab\.maturita-desk\.protected-content\.v1/);
assert.match(sw, /ghrab-maturita-desk-v1\.0\.2/);
assert.match(sw, /src\/config\/data-manifest\.json/);

// F-02: local phases are distinguishable; Platform retains authority for final seen acknowledgement.
const suite = read('src/suite-session.js');
for (const phase of ["'observed'","'cleanup-complete'","'acknowledged'","'failed'"]) assert.ok(suite.includes(phase));
assert.ok(suite.includes('platform?.session?.seen?.() === generation'));
assert.doesNotMatch(suite, /setItem\s*\([^\n]*suite-session-seen/i);

// F-03 local controls: app never writes the global tombstone or invokes session.end.
const srcFiles = ['src/main.js','src/suite-session.js','src/session-coordinator.js','src/providers/auth-lease.js','src/review-store.js'];
const combined = srcFiles.map(read).join('\n');
assert.doesNotMatch(combined, /\.session\.end\s*\(/);
assert.doesNotMatch(combined, /setItem\s*\(\s*['"]ghrab\.platform\.suite-session-generation\.v1['"]/);

// Shared handoff is not consumed/owned in this release, so it is not destructively cleared.
assert.equal(manifest.handoff.consumedByRuntime, false);
assert.equal(manifest.handoff.sharedPlatformKeysOwnedByApp, false);
assert.equal(manifest.sharedPlatformState.suiteSessionGeneration.clearOnEndWork, false);

// AI minimisation path remains query-only and no prompt/debug persistence key is introduced.
assert.match(read('src/fact-check.js'), /body:\s*JSON\.stringify\(\{ query \}\)/);
assert.equal(allStores.some(item => /prompt|debug/i.test(item.pattern) && item.clearOnEndWork !== true), false);

console.log('GARP 2.3 targeted persistence/shared-device regressions: PASS');
console.log('PC-01 writer coverage, F-02 phase separation, F-03 local no-mint/no-forge controls: PASS');
