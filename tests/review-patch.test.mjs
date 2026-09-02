import assert from 'node:assert/strict';
import { createReviewPatch, parseReviewPatchText, verifyReviewPatch, applyReviewPatchToPack } from '../src/review-patch.js';
import { collectReviewItems } from '../src/review-model.js';

const pack = {
  manifest: { packId: 'synthetic-review-pack', version: '1.0.0-review', label: 'Synthetic', classification: 'SYNTHETIC-DEMO', topicCount: 1, createdAt: '2026-09-01T00:00:00.000Z' },
  metadata: { guidanceReviewStatus: 'AI-assisted draft requiring review.' },
  topics: [{
    id: 1,
    number: 1,
    title: 'Synthetic Review Topic',
    practice: {
      task: { title: 'Task', steps: [{ prompt: 'Task prompt?', guidance: ['Draft task'], followUp: 'Draft follow?', guidanceMeta: { reviewPriority: 'NORMAL', status: 'AI_ASSISTED_DRAFT' } }] },
      sections: [{ id: 's1', label: 'Section', questions: [{ prompt: 'Question?', guidance: ['Draft answer'], followUp: 'Draft follow-up?', guidanceMeta: { reviewPriority: 'HIGH', status: 'AI_ASSISTED_DRAFT' } }] }]
    }
  }]
};
const items = collectReviewItems(pack.topics);
assert.equal(items.length, 2);
const records = [
  { itemId: items[0].id, status: 'approved', updatedAt: '2026-09-01T10:00:00.000Z' },
  { itemId: items[1].id, status: 'edited', guidance: ['Human reviewed answer'], followUp: 'Human follow-up?', updatedAt: '2026-09-01T10:01:00.000Z' }
];
const patch = await createReviewPatch(pack, records, '0.6.0');
assert.equal(patch.schema, 'maturita-desk-review-patch-v1');
assert.equal(patch.records.length, 2);
assert.equal(patch.summary.complete, true);
assert.equal(patch.containsExamPrompts, false);
assert.equal(JSON.stringify(patch).includes('Question?'), false);
await verifyReviewPatch(pack, patch);
const parsed = await parseReviewPatchText(JSON.stringify(patch), pack);
assert.equal(parsed.records.length, 2);
const reviewedPack = await applyReviewPatchToPack(pack, patch);
assert.equal(reviewedPack.metadata.candidateStatus, 'PEDAGOGICALLY-REVIEWED-CANDIDATE');
assert.deepEqual(reviewedPack.topics[0].practice.sections[0].questions[0].guidance, ['Human reviewed answer']);
assert.equal(reviewedPack.topics[0].practice.sections[0].questions[0].guidanceMeta.humanReview, 'EDITED_APPROVED');
assert.equal(reviewedPack.topics[0].practice.task.steps[0].guidanceMeta.humanReview, 'APPROVED');

const tampered = structuredClone(pack);
tampered.topics[0].practice.sections[0].questions[0].prompt = 'Changed source prompt?';
await assert.rejects(() => verifyReviewPatch(tampered, patch), /změnil/);

const wrongVersion = structuredClone(patch);
wrongVersion.contentVersion = 'other';
await assert.rejects(() => verifyReviewPatch(pack, wrongVersion), /jinému Content Packu/);


const forgedSummary = structuredClone(patch);
forgedSummary.records.pop();
let forgedSummaryRejected = false;
try { await verifyReviewPatch(pack, forgedSummary); }
catch { forgedSummaryRejected = true; }
assert.equal(forgedSummaryRejected, true, 'forged completion summary must be rejected');

console.log('Pedagogical review patch tests: PASS');
