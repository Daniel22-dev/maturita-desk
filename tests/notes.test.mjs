import assert from 'node:assert/strict';
import { NOTE_MAX_LENGTH, normalizeNote, noteUsage, hasNote, hasAnyNote, shouldPersistHeartbeat } from '../src/notes.js';

assert.equal(NOTE_MAX_LENGTH, 5000);
assert.equal(normalizeNote('a\r\nb\rc'), 'a\nb\nc');
assert.equal(normalizeNote('x'.repeat(5100)).length, 5000);
assert.equal(Array.from(normalizeNote('🙂'.repeat(5100))).length, 5000, 'unicode notes must not split surrogate pairs');

assert.deepEqual(noteUsage('abc', 5), { used: 3, max: 5, remaining: 2, atLimit: false });
assert.equal(noteUsage('12345', 5).atLimit, true);
assert.equal(hasNote({ task: '  ' }, 'task'), false);
assert.equal(hasNote({ task: 'ok' }, 'task'), true);
assert.equal(hasAnyNote({ pictures: '', task: 'x', topic: '' }, ['pictures', 'task', 'topic']), true);
assert.equal(hasAnyNote({ pictures: '', task: '', topic: '' }, ['pictures', 'task', 'topic']), false);

assert.equal(shouldPersistHeartbeat(1000, 10999, 10000), false);
assert.equal(shouldPersistHeartbeat(1000, 11000, 10000), true);

console.log('Notes/session ergonomics tests: PASS');
