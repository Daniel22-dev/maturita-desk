import { normalizeNote } from './notes.js';
export const SESSION_SCHEMA = 'maturita-desk-session-v3';
export const SESSION_VERSION = 3;
export const EXAM_TARGET = 15 * 60;
export const PRACTICE_TARGET = 13 * 60;
export const PHASE_TARGETS = Object.freeze({ pictures: 2 * 60, task: 4 * 60, topic: 9 * 60 });
export const PHASES = Object.freeze({
  exam: Object.freeze(['pictures', 'task', 'topic']),
  practice: Object.freeze(['task', 'topic'])
});

export function createSession({ mode, topicId, topicTitle, timed, firstSectionId = null, contentRef = { source: 'demo', packId: null, version: null }, now = Date.now(), id = makeId() }) {
  if (!['exam', 'practice'].includes(mode)) throw new Error(`Unsupported mode: ${mode}`);
  const phases = PHASES[mode];
  const activePhase = phases[0];
  const isTimed = mode === 'exam' ? true : Boolean(timed);
  const timestamp = safeTimestamp(now);
  return {
    schema: SESSION_SCHEMA,
    version: SESSION_VERSION,
    id,
    mode,
    topicId: Number(topicId),
    topicTitle: String(topicTitle || ''),
    status: 'running',
    timed: isTimed,
    startedAt: isTimed ? timestamp : null,
    endedAt: null,
    totalElapsed: 0,
    activePhase,
    viewPhase: activePhase,
    phaseStartedAt: isTimed ? timestamp : null,
    phaseElapsed: { pictures: 0, task: 0, topic: 0 },
    notes: { pictures: '', task: '', topic: '' },
    activeSectionId: firstSectionId,
    timeline: [{ type: 'start', phase: activePhase, at: timestamp }],
    createdAt: timestamp,
    updatedAt: timestamp,
    lastKnownNow: timestamp,
    contentRef: normalizeContentRef(contentRef)
  };
}

export function normalizeSession(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null;
  let session = raw;
  if (raw.schema === 'maturita-desk-session-v1') session = migrateV1(raw, now);
  if (session.schema === 'maturita-desk-session-v2') session = migrateV2(session, now);
  if (session.schema !== SESSION_SCHEMA || session.version !== SESSION_VERSION) return null;
  if (!['exam', 'practice'].includes(session.mode)) return null;
  if (!['running', 'finished'].includes(session.status)) return null;
  const phases = PHASES[session.mode];
  if (!phases.includes(session.activePhase)) return null;
  if (!phases.includes(session.viewPhase)) session.viewPhase = session.activePhase;
  session.timed = session.mode === 'exam' ? true : Boolean(session.timed);
  session.phaseElapsed = normalizePhaseElapsed(session.phaseElapsed);
  session.notes = normalizeNotes(session.notes);
  session.timeline = Array.isArray(session.timeline) ? session.timeline.filter(isTimelineEntry) : [];
  session.createdAt = safeTimestamp(session.createdAt || now);
  session.updatedAt = safeTimestamp(session.updatedAt || session.createdAt);
  session.lastKnownNow = Math.max(safeTimestamp(session.lastKnownNow || session.updatedAt), session.updatedAt);
  session.contentRef = normalizeContentRef(session.contentRef);
  if (session.status === 'finished') {
    session.endedAt = safeTimestamp(session.endedAt || session.updatedAt);
    session.phaseStartedAt = null;
    session.totalElapsed = Math.max(0, Number(session.totalElapsed || 0));
  } else if (session.timed) {
    session.startedAt = safeTimestamp(session.startedAt || session.createdAt);
    session.phaseStartedAt = safeTimestamp(session.phaseStartedAt || session.updatedAt);
  } else {
    session.startedAt = null;
    session.phaseStartedAt = null;
  }
  return session;
}

export function getTotalTarget(session) {
  if (!session?.timed) return 0;
  return session.mode === 'exam' ? EXAM_TARGET : PRACTICE_TARGET;
}

export function getTotalElapsed(session, now = Date.now()) {
  if (!session?.timed) return 0;
  if (session.status === 'finished') return Math.max(0, Number(session.totalElapsed || 0));
  if (!session.startedAt) return 0;
  const effectiveNow = Math.max(safeTimestamp(now), safeTimestamp(session.lastKnownNow || now));
  return secondsBetween(session.startedAt, effectiveNow);
}

export function getPhaseElapsed(session, phase, now = Date.now()) {
  if (!session?.timed || !PHASE_TARGETS[phase]) return 0;
  let elapsed = Math.max(0, Number(session.phaseElapsed?.[phase] || 0));
  if (session.status === 'running' && session.activePhase === phase && session.phaseStartedAt) {
    const effectiveNow = Math.max(safeTimestamp(now), safeTimestamp(session.lastKnownNow || now));
    elapsed += secondsBetween(session.phaseStartedAt, effectiveNow);
  }
  return elapsed;
}


export function touchClock(session, now = Date.now()) {
  if (!session || session.status !== 'running') return false;
  const timestamp = safeTimestamp(now);
  session.lastKnownNow = Math.max(safeTimestamp(session.lastKnownNow || timestamp), timestamp);
  return true;
}

export function canTransition(session, nextPhase) {
  if (!session || session.status !== 'running') return false;
  const phases = PHASES[session.mode];
  const index = phases.indexOf(session.activePhase);
  return index >= 0 && index < phases.length - 1 && phases[index + 1] === nextPhase;
}

export function transitionSession(session, nextPhase, now = Date.now()) {
  if (!canTransition(session, nextPhase)) return { ok: false, reason: 'invalid-transition', session };
  const timestamp = safeRunningTimestamp(session, now);
  finalizeActivePhase(session, timestamp);
  const previous = session.activePhase;
  session.activePhase = nextPhase;
  session.viewPhase = nextPhase;
  session.phaseStartedAt = session.timed ? timestamp : null;
  session.updatedAt = timestamp;
  session.lastKnownNow = timestamp;
  session.timeline.push({ type: 'transition', from: previous, phase: nextPhase, at: timestamp });
  return { ok: true, session };
}

export function finishSessionState(session, now = Date.now()) {
  if (!session || session.status !== 'running') return { ok: false, reason: 'not-running', session };
  const timestamp = safeRunningTimestamp(session, now);
  finalizeActivePhase(session, timestamp);
  session.endedAt = timestamp;
  session.totalElapsed = session.timed && session.startedAt ? secondsBetween(session.startedAt, timestamp) : 0;
  session.status = 'finished';
  session.phaseStartedAt = null;
  session.updatedAt = timestamp;
  session.lastKnownNow = timestamp;
  session.timeline.push({ type: 'finish', phase: session.activePhase, at: timestamp });
  return { ok: true, session };
}

export function setViewPhaseState(session, phase, now = Date.now()) {
  if (!session || !PHASES[session.mode].includes(phase)) return false;
  session.viewPhase = phase;
  const timestamp = safeRunningTimestamp(session, now);
  session.updatedAt = timestamp;
  session.lastKnownNow = timestamp;
  return true;
}

export function setSectionState(session, sectionId, now = Date.now()) {
  if (!session) return false;
  session.activeSectionId = sectionId == null ? null : String(sectionId);
  const timestamp = safeRunningTimestamp(session, now);
  session.updatedAt = timestamp;
  session.lastKnownNow = timestamp;
  return true;
}

export function setNoteState(session, phase, value, now = Date.now()) {
  if (!session || !Object.prototype.hasOwnProperty.call(session.notes || {}, phase)) return false;
  session.notes[phase] = normalizeNote(value);
  const timestamp = safeRunningTimestamp(session, now);
  session.updatedAt = timestamp;
  session.lastKnownNow = timestamp;
  return true;
}

export function phaseStatus(session, phase) {
  if (!session || !PHASES[session.mode].includes(phase)) return 'unavailable';
  const phases = PHASES[session.mode];
  const activeIndex = phases.indexOf(session.activePhase);
  const index = phases.indexOf(phase);
  if (session.status === 'finished') return index <= activeIndex ? 'completed' : 'upcoming';
  if (index < activeIndex) return 'completed';
  if (index === activeIndex) return 'active';
  return 'upcoming';
}

export function timingClass(elapsed, target) {
  if (!target) return '';
  if (elapsed > target) return 'over';
  if (elapsed >= target * 0.8) return 'near';
  return '';
}

export function formatTime(seconds, includeHours = false) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (includeHours || h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function getTimingSummary(session, now = Date.now()) {
  if (!session) return null;
  const phases = PHASES[session.mode];
  return {
    total: getTotalElapsed(session, now),
    target: getTotalTarget(session),
    phases: Object.fromEntries(phases.map(phase => [phase, {
      elapsed: getPhaseElapsed(session, phase, now),
      target: PHASE_TARGETS[phase],
      status: phaseStatus(session, phase)
    }]))
  };
}

function finalizeActivePhase(session, timestamp) {
  if (!session.timed || !session.phaseStartedAt || !session.activePhase) return;
  const delta = secondsBetween(session.phaseStartedAt, timestamp);
  session.phaseElapsed[session.activePhase] = Math.max(0, Number(session.phaseElapsed[session.activePhase] || 0)) + delta;
  session.phaseStartedAt = null;
}

function migrateV1(raw, now) {
  const timestamp = safeTimestamp(now);
  return {
    ...raw,
    schema: SESSION_SCHEMA,
    version: SESSION_VERSION,
    id: raw.id || makeId(),
    timeline: Array.isArray(raw.timeline) ? raw.timeline : [],
    lastKnownNow: Math.max(safeTimestamp(raw.updatedAt || raw.createdAt || timestamp), safeTimestamp(raw.createdAt || timestamp))
  };
}


function migrateV2(raw, now) {
  const timestamp = safeTimestamp(now);
  return {
    ...raw,
    schema: SESSION_SCHEMA,
    version: SESSION_VERSION,
    contentRef: normalizeContentRef(raw.contentRef || { source: 'demo', packId: null, version: null }),
    lastKnownNow: Math.max(safeTimestamp(raw.lastKnownNow || raw.updatedAt || raw.createdAt || timestamp), safeTimestamp(raw.updatedAt || raw.createdAt || timestamp))
  };
}

function normalizeContentRef(value) {
  const source = value?.source === 'pack' ? 'pack' : 'demo';
  return {
    source,
    packId: source === 'pack' ? String(value?.packId || '') : null,
    version: source === 'pack' ? String(value?.version || '') : null
  };
}

function normalizePhaseElapsed(value) {
  return {
    pictures: Math.max(0, Number(value?.pictures || 0)),
    task: Math.max(0, Number(value?.task || 0)),
    topic: Math.max(0, Number(value?.topic || 0))
  };
}

function normalizeNotes(value) {
  return {
    pictures: normalizeNote(value?.pictures || ''),
    task: normalizeNote(value?.task || ''),
    topic: normalizeNote(value?.topic || '')
  };
}

function safeRunningTimestamp(session, now) {
  const value = safeTimestamp(now);
  return Math.max(value, safeTimestamp(session?.lastKnownNow || value));
}

function safeTimestamp(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : Date.now();
}

function secondsBetween(start, end) {
  return Math.max(0, (safeTimestamp(end) - safeTimestamp(start)) / 1000);
}

function isTimelineEntry(entry) {
  return entry && typeof entry === 'object' && typeof entry.type === 'string' && Number.isFinite(Number(entry.at));
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `md-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
