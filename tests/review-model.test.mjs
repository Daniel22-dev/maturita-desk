import assert from 'node:assert/strict';
import { collectReviewItems, effectiveGuidance, filterReviewItems, reviewItemIdForQuestion, reviewItemIdForTask, reviewRecordMap, summarizeReview } from '../src/review-model.js';

const topics = [{
  id: 1,
  number: 1,
  title: 'Synthetic Review Topic',
  practice: {
    task: {
      title: 'Synthetic task',
      steps: [
        { prompt: 'Choose one option and explain.', guidance: ['Reason A'], followUp: 'Why?', guidanceMeta: { reviewPriority: 'NORMAL' } },
        { prompt: 'Give a factual detail.', guidance: ['Fact X'], guidanceMeta: { reviewPriority: 'HIGH' } }
      ]
    },
    sections: [{
      id: 'section-one',
      label: 'Section One',
      questions: [
        { prompt: 'Question one?', guidance: ['Point one'], followUp: 'Example?', guidanceMeta: { reviewPriority: 'HIGH', basis: ['synthetic'] } },
        { prompt: 'Question two?', guidance: ['Point two'], guidanceMeta: { reviewPriority: 'NORMAL' } }
      ]
    }]
  }
}];

const items = collectReviewItems(topics);
assert.equal(items.length, 4);
assert.equal(items[0].id, reviewItemIdForTask(1, 0));
assert.equal(items[2].id, reviewItemIdForQuestion(1, 'section-one', 0));
assert.equal(items.filter(item => item.priority === 'HIGH').length, 2);

const records = reviewRecordMap([
  { itemId: items[0].id, status: 'approved', updatedAt: '2026-09-01T10:00:00.000Z' },
  { itemId: items[2].id, status: 'edited', guidance: ['Human point'], followUp: 'Human follow-up?', updatedAt: '2026-09-01T10:01:00.000Z' },
  { itemId: items[3].id, status: 'rejected', note: 'Needs replacement', updatedAt: '2026-09-01T10:02:00.000Z' }
]);
const summary = summarizeReview(items, records);
assert.deepEqual({ total: summary.total, reviewed: summary.reviewed, pending: summary.pending, approved: summary.approved, edited: summary.edited, rejected: summary.rejected }, { total: 4, reviewed: 3, pending: 1, approved: 1, edited: 1, rejected: 1 });
assert.equal(summary.complete, false);
assert.equal(summary.highPending, 1);

const pendingHigh = filterReviewItems(items, records, { priority: 'HIGH', status: 'pending', topic: 'all', kind: 'all' });
assert.equal(pendingHigh.length, 1);
assert.equal(pendingHigh[0].id, items[1].id);

const edited = effectiveGuidance(items[2], records.get(items[2].id));
assert.deepEqual(edited.guidance, ['Human point']);
assert.equal(edited.followUp, 'Human follow-up?');
const rejected = effectiveGuidance(items[3], records.get(items[3].id));
assert.deepEqual(rejected.guidance, []);
assert.equal(rejected.followUp, '');

console.log('Pedagogical review model tests: PASS');
