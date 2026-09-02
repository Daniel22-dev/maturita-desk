import assert from 'node:assert/strict';
import {
  createSession,
  getTotalElapsed,
  getPhaseElapsed,
  normalizeSession,
  transitionSession,
  touchClock
} from '../src/exam-engine.js';

const base = 1_800_000_000_000;
const at = seconds => base + seconds * 1000;

const session = createSession({
  mode: 'exam',
  topicId: 14,
  topicTitle: 'SYNTHETIC',
  timed: true,
  firstSectionId: 'one',
  now: at(0),
  id: 'device-resume'
});

transitionSession(session, 'task', at(120));
touchClock(session, at(180));
const persisted = JSON.parse(JSON.stringify(session));

// Device sleeps / Safari is backgrounded for seven minutes. Time must keep running.
const restored = normalizeSession(persisted, at(600));
assert.equal(getTotalElapsed(restored, at(600)), 600);
assert.equal(getPhaseElapsed(restored, 'pictures', at(600)), 120);
assert.equal(getPhaseElapsed(restored, 'task', at(600)), 480);

// A wall-clock rollback after resume must never move the exam timer backwards.
touchClock(restored, at(610));
assert.equal(getTotalElapsed(restored, at(590)), 610);
assert.equal(getPhaseElapsed(restored, 'task', at(590)), 490);

// The explicit phase transition still owns the timer; viewing another screen is irrelevant.
assert.equal(transitionSession(restored, 'topic', at(620)).ok, true);
assert.equal(getPhaseElapsed(restored, 'task', at(620)), 500);
assert.equal(restored.activePhase, 'topic');

console.log('Device sleep/resume timing tests: PASS');
