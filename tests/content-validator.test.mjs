import assert from 'node:assert/strict';
import { TOPICS } from '../src/demo-content.js';
import { validateTopic, validateTopicCollection, safeImageSource } from '../src/content-validator.js';

const all = validateTopicCollection(TOPICS);
assert.equal(all.ok, true, all.errors.join('\n'));
assert.equal(TOPICS.length, 20);
assert.equal(validateTopic(TOPICS[13], 'exam').ok, true);
assert.equal(validateTopic(TOPICS[13], 'practice').ok, true);

const broken = structuredClone(TOPICS[13]);
broken.exam.pictures.images = [];
const brokenCheck = validateTopic(broken, 'exam');
assert.equal(brokenCheck.ok, false);
assert.match(brokenCheck.errors.join(' '), /právě dva obrázky/i);

// Untrusted pack metadata must never control HTML-facing topic numbers.
const maliciousNumber = structuredClone(TOPICS[13]);
maliciousNumber.number = '<img src=x onerror=alert(1)>';
const maliciousNumberCheck = validateTopic(maliciousNumber, 'exam');
assert.equal(maliciousNumberCheck.ok, false);
assert.match(maliciousNumberCheck.errors.join(' '), /číslo tématu/i);

assert.equal(safeImageSource('./assets/demo/picture-a.svg'), true);
assert.equal(safeImageSource('./assets/demo/../secret.svg'), false);
assert.equal(safeImageSource('./assets/demo/a/../../secret.svg'), false);
assert.equal(safeImageSource('https://evil.example/picture.png'), false);

console.log('Content validator + untrusted path tests: PASS');

const stringId = structuredClone(TOPICS[0]);
stringId.id = '01';
const stringIdCheck = validateTopic(stringId, 'exam');
assert.equal(stringIdCheck.ok, false);
assert.match(stringIdCheck.errors.join(' '), /číselné ID/i);
