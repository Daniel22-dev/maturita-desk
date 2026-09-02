import assert from 'node:assert/strict';
import { TOPICS } from '../src/demo-content.js';
import { validateTopic, safeImageSource } from '../src/content-validator.js';

const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==';
const topic = structuredClone(TOPICS[13]);

topic.exam.pictures = {
  targetQuestion: 'Which situation is more effective, and why?',
  instruction: 'Compare both photographs and answer the target question.',
  support: [
    { label: 'Place and people', detail: 'Mention at least one similarity and one difference.' },
    { label: 'Consequences', detail: 'Explain the likely result.' }
  ],
  teacherPrompt: 'Ask for one explicit comparison if needed.',
  images: [
    { id: 'A', src: jpeg, alt: 'Synthetic picture A', width: 2, height: 2, bytes: 32, sha256: 'a'.repeat(64) },
    { id: 'B', src: jpeg, alt: 'Synthetic picture B', width: 2, height: 2, bytes: 32, sha256: 'b'.repeat(64) }
  ]
};
topic.exam.task.blocks = [
  { kind: 'text', text: 'Synthetic context paragraph.' },
  { kind: 'quote', text: 'Synthetic quotation.' },
  { kind: 'bullet', text: 'Synthetic bullet.' },
  { kind: 'table', rows: [['Item', 'Value'], ['A', '1'], ['B', '2']] }
];
topic.exam.task.steps[0].substeps = ['First synthetic substep', 'Second synthetic substep'];
topic.exam.task.steps[0].guidanceMeta = {
  status: 'AI_ASSISTED_DRAFT',
  basis: ['synthetic'],
  matchScore: 0.5,
  reviewPriority: 'NORMAL',
  sourceMatches: ['Synthetic source']
};
topic.exam.topic.sections[0].extraPrompt = {
  prompt: 'Synthetic extra prompt?',
  answer: ['Synthetic answer point']
};
topic.exam.topic.referenceImages = [
  { id: 'R1', src: jpeg, alt: 'Synthetic reference image', width: 2, height: 2, bytes: 32, sha256: 'c'.repeat(64) }
];
topic.practice.sections[0].questions[0].guidanceMeta = {
  status: 'AI_ASSISTED_DRAFT',
  basis: ['synthetic scaffold'],
  matchScore: 0,
  reviewPriority: 'HIGH',
  sourceMatches: []
};

const examCheck = validateTopic(topic, 'exam');
assert.equal(examCheck.ok, true, examCheck.errors.join('\n'));
const practiceCheck = validateTopic(topic, 'practice');
assert.equal(practiceCheck.ok, true, practiceCheck.errors.join('\n'));
assert.equal(safeImageSource(jpeg), true);
assert.equal(safeImageSource('./assets/demo/picture-a.svg'), true);
assert.equal(safeImageSource('https://example.invalid/image.jpg'), false);
assert.equal(safeImageSource('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), false);

const badTable = structuredClone(topic);
badTable.exam.task.blocks[3].rows[1] = ['only-one-cell'];
assert.equal(validateTopic(badTable, 'exam').ok, false);

const badReference = structuredClone(topic);
badReference.exam.topic.referenceImages[0].src = 'https://example.invalid/reference.jpg';
assert.equal(validateTopic(badReference, 'exam').ok, false);

console.log('Rich content model tests: PASS');
