import assert from 'node:assert/strict';
import {
  PHASE_TARGETS, createSession, normalizeSession, getTotalElapsed, getPhaseElapsed,
  transitionSession, finishSessionState, setViewPhaseState, setNoteState,
  phaseStatus, getTimingSummary
} from '../src/exam-engine.js';

const base = 1_800_000_000_000;
const at = seconds => base + seconds * 1000;

function examSession() {
  return createSession({ mode: 'exam', topicId: 14, topicTitle: 'SYNTHETIC', timed: true, firstSectionId: 'one', contentRef: { source: 'pack', packId: 'synthetic-pack', version: '1.0.0' }, now: at(0), id: 'test-session' });
}

{
  const s = examSession();
  assert.equal(s.activePhase, 'pictures');
  assert.deepEqual(s.contentRef, { source: 'pack', packId: 'synthetic-pack', version: '1.0.0' });
  assert.equal(getTotalElapsed(s, at(90)), 90);
  assert.equal(getPhaseElapsed(s, 'pictures', at(90)), 90);
  assert.equal(phaseStatus(s, 'pictures'), 'active');
  assert.equal(phaseStatus(s, 'task'), 'upcoming');
}

{
  const s = examSession();
  setViewPhaseState(s, 'topic', at(60));
  assert.equal(s.viewPhase, 'topic');
  assert.equal(s.activePhase, 'pictures', 'peeking must not change active phase');
  assert.equal(getPhaseElapsed(s, 'pictures', at(125)), 125, 'picture timer must keep running while peeking');
}

{
  const s = examSession();
  let r = transitionSession(s, 'task', at(135));
  assert.equal(r.ok, true);
  assert.equal(getPhaseElapsed(s, 'pictures', at(135)), 135);
  assert.equal(s.activePhase, 'task');
  assert.equal(phaseStatus(s, 'pictures'), 'completed');
  assert.equal(transitionSession(s, 'topic', at(385)).ok, true);
  assert.equal(getPhaseElapsed(s, 'task', at(385)), 250);
  assert.equal(finishSessionState(s, at(915)).ok, true);
  const summary = getTimingSummary(s, at(999));
  assert.equal(summary.total, 915);
  assert.equal(summary.phases.pictures.elapsed, 135);
  assert.equal(summary.phases.task.elapsed, 250);
  assert.equal(summary.phases.topic.elapsed, 530);
  assert.equal(s.status, 'finished');
}

{
  const s = examSession();
  assert.equal(transitionSession(s, 'topic', at(10)).ok, false, 'cannot skip Task Box');
  assert.equal(s.activePhase, 'pictures');
  transitionSession(s, 'task', at(120));
  assert.equal(transitionSession(s, 'pictures', at(121)).ok, false, 'active phase cannot go backwards');
}

{
  const s = examSession();
  setNoteState(s, 'pictures', 'synthetic note', at(25));
  const restored = normalizeSession(JSON.parse(JSON.stringify(s)), at(200));
  assert.equal(restored.notes.pictures, 'synthetic note');
  assert.equal(getTotalElapsed(restored, at(200)), 200, 'refresh/sleep recovery must use persisted timestamps');
  assert.equal(getPhaseElapsed(restored, 'pictures', at(200)), 200);
}


{
  const s = examSession();
  s.lastKnownNow = at(180);
  assert.equal(getTotalElapsed(s, at(120)), 180, 'clock rollback must not make the timer go backwards');
  assert.equal(getPhaseElapsed(s, 'pictures', at(120)), 180);
}

{
  const p = createSession({ mode: 'practice', topicId: 1, topicTitle: 'SYNTHETIC', timed: false, firstSectionId: 'one', now: at(0), id: 'practice' });
  assert.equal(p.activePhase, 'task');
  assert.equal(p.startedAt, null);
  assert.equal(getTotalElapsed(p, at(600)), 0);
  transitionSession(p, 'topic', at(600));
  finishSessionState(p, at(1200));
  assert.equal(p.totalElapsed, 0);
}


{
  const s = examSession();
  setNoteState(s, 'topic', 'x'.repeat(6000), at(10));
  assert.equal(s.notes.topic.length, 5000, 'notes must be bounded to protect local session storage');
}


{
  const legacy = examSession();
  legacy.schema = 'maturita-desk-session-v2';
  legacy.version = 2;
  delete legacy.contentRef;
  const migrated = normalizeSession(legacy, at(10));
  assert.equal(migrated.schema, 'maturita-desk-session-v3');
  assert.deepEqual(migrated.contentRef, { source: 'demo', packId: null, version: null });
}

assert.deepEqual(PHASE_TARGETS, { pictures: 120, task: 240, topic: 540 });
console.log('Exam engine tests: PASS');
