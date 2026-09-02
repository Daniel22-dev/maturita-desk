import assert from 'node:assert/strict';
import {
  SESSION_OWNER_KEY, SESSION_OWNER_STALE_MS, claimSessionOwnership, readSessionOwner,
  refreshSessionOwnership, releaseSessionOwnership
} from '../src/session-coordinator.js';

class StorageStub {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

const storage = new StorageStub();
const t0 = 1_000_000;
let result = claimSessionOwnership(storage, { instanceId: 'instance-A', sessionId: 'session-001', now: t0 });
assert.equal(result.ok, true);
assert.equal(readSessionOwner(storage, t0).instanceId, 'instance-A');

result = claimSessionOwnership(storage, { instanceId: 'instance-B', sessionId: 'session-002', now: t0 + 1000 });
assert.equal(result.ok, false);
assert.equal(result.reason, 'owned-by-other');

result = refreshSessionOwnership(storage, { instanceId: 'instance-A', sessionId: 'session-001', now: t0 + 2000 });
assert.equal(result.ok, true);

result = claimSessionOwnership(storage, { instanceId: 'instance-B', sessionId: 'session-002', now: t0 + SESSION_OWNER_STALE_MS + 3000 });
assert.equal(result.ok, true, 'stale lease must be reclaimable');
assert.equal(readSessionOwner(storage, t0 + SESSION_OWNER_STALE_MS + 3000).instanceId, 'instance-B');

result = refreshSessionOwnership(storage, { instanceId: 'instance-A', sessionId: 'session-001', now: t0 + SESSION_OWNER_STALE_MS + 3500 });
assert.equal(result.ok, false, 'former writer must not overwrite new owner');

result = claimSessionOwnership(storage, { instanceId: 'instance-A', sessionId: 'session-001', now: t0 + SESSION_OWNER_STALE_MS + 3600, force: true });
assert.equal(result.ok, true);
assert.equal(result.reason, 'forced-takeover');
assert.equal(releaseSessionOwnership(storage, { instanceId: 'instance-B', sessionId: 'session-002' }), false);
assert.equal(releaseSessionOwnership(storage, { instanceId: 'instance-A', sessionId: 'session-001' }), true);
assert.equal(storage.getItem(SESSION_OWNER_KEY), null);

storage.setItem(SESSION_OWNER_KEY, '{bad json');
assert.equal(readSessionOwner(storage, Date.now()), null);

console.log('Stage 13 session coordinator tests: PASS');
