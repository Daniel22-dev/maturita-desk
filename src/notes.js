export const NOTE_MAX_LENGTH = 5000;

export function normalizeNote(value, maxLength = NOTE_MAX_LENGTH) {
  const normalized = String(value ?? '').replace(/\r\n?/g, '\n');
  return Array.from(normalized).slice(0, Math.max(0, Number(maxLength) || 0)).join('');
}

export function noteLength(value) {
  return Array.from(String(value ?? '')).length;
}

export function noteUsage(value, maxLength = NOTE_MAX_LENGTH) {
  const used = noteLength(value);
  const max = Math.max(0, Number(maxLength) || 0);
  return { used, max, remaining: Math.max(0, max - used), atLimit: used >= max };
}

export function hasNote(notes, phase) {
  return Boolean(String(notes?.[phase] ?? '').trim());
}

export function hasAnyNote(notes, phases = ['pictures', 'task', 'topic']) {
  return phases.some(phase => hasNote(notes, phase));
}

export function shouldPersistHeartbeat(lastPersistedAt, now = Date.now(), intervalMs = 10000) {
  const last = Number(lastPersistedAt || 0);
  const current = Number(now || 0);
  return current >= last + Math.max(1000, Number(intervalMs) || 10000);
}
