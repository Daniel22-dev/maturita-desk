export const SESSION_OWNER_SCHEMA = 'maturita-desk-session-owner-v1';
export const SESSION_OWNER_KEY = 'ghrab.maturita-desk.session-owner.v1';
export const SESSION_OWNER_STALE_MS = 12000;
export const SESSION_OWNER_HEARTBEAT_MS = 3000;

export function readSessionOwner(storage, now = Date.now()) {
  try {
    const raw = storage?.getItem?.(SESSION_OWNER_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!validOwner(value)) return null;
    return { ...value, fresh: now - value.updatedAt <= SESSION_OWNER_STALE_MS };
  } catch {
    return null;
  }
}

export function claimSessionOwnership(storage, { instanceId, sessionId, now = Date.now(), force = false } = {}) {
  requireIds(instanceId, sessionId);
  const current = readSessionOwner(storage, now);
  if (!force && current?.fresh && current.instanceId !== instanceId) return { ok: false, reason: 'owned-by-other', owner: current };
  const next = ownerRecord(instanceId, sessionId, now);
  try {
    storage.setItem(SESSION_OWNER_KEY, JSON.stringify(next));
    const verified = readSessionOwner(storage, now);
    if (!verified || verified.instanceId !== instanceId || verified.sessionId !== sessionId) return { ok: false, reason: 'claim-race', owner: verified };
    return { ok: true, reason: force && current?.fresh && current.instanceId !== instanceId ? 'forced-takeover' : 'claimed', owner: verified };
  } catch {
    return { ok: false, reason: 'storage-error', owner: current };
  }
}

export function refreshSessionOwnership(storage, { instanceId, sessionId, now = Date.now() } = {}) {
  requireIds(instanceId, sessionId);
  const current = readSessionOwner(storage, now);
  if (current?.fresh && current.instanceId !== instanceId) return { ok: false, reason: 'owned-by-other', owner: current };
  if (current && current.instanceId === instanceId && current.sessionId !== sessionId && current.fresh) return { ok: false, reason: 'instance-session-mismatch', owner: current };
  return claimSessionOwnership(storage, { instanceId, sessionId, now, force: !current?.fresh });
}

export function releaseSessionOwnership(storage, { instanceId, sessionId } = {}) {
  const current = readSessionOwner(storage, Date.now());
  if (!current || current.instanceId !== instanceId || (sessionId && current.sessionId !== sessionId)) return false;
  try { storage.removeItem(SESSION_OWNER_KEY); return true; } catch { return false; }
}

export function sessionOwnershipConflict(storage, { instanceId, sessionId, now = Date.now() } = {}) {
  const current = readSessionOwner(storage, now);
  return Boolean(current?.fresh && current.instanceId !== instanceId && (!sessionId || current.sessionId !== sessionId || current.sessionId === sessionId));
}

function ownerRecord(instanceId, sessionId, now) {
  return { schema: SESSION_OWNER_SCHEMA, instanceId: String(instanceId), sessionId: String(sessionId), updatedAt: Number(now) };
}

function validOwner(value) {
  return value?.schema === SESSION_OWNER_SCHEMA && safeId(value.instanceId) && safeId(value.sessionId) && Number.isFinite(Number(value.updatedAt));
}
function safeId(value) { return /^[A-Za-z0-9._:-]{6,180}$/.test(String(value || '')); }
function requireIds(instanceId, sessionId) { if (!safeId(instanceId) || !safeId(sessionId)) throw new TypeError('Session coordinator vyžaduje platné instanceId a sessionId.'); }
