import assert from 'node:assert/strict';
import {
  PILOT_CHECKS, PILOT_NOTE_MAX, createPilotRun, normalizePilotRun, pilotClassificationAllowed,
  pilotReportText, pilotSummary, recordPilotMetric, serializePilotReport, setPilotCheck
} from '../src/pilot.js';

const run = createPilotRun({ appVersion: '1.0.0', device: { viewport: { width: 1024, height: 768 }, touchPoints: 5 } });
assert.equal(run.schema, 'maturita-desk-pilot-run-v1');
assert.equal(run.syntheticOnly, false);
assert.equal(Object.keys(run.checks).length, PILOT_CHECKS.length);
assert.equal(pilotSummary(run).complete, false);
assert.equal(pilotClassificationAllowed('SYNTHETIC-DEMO'), true);
assert.equal(pilotClassificationAllowed('CONFIDENTIAL-EXAM'), true);

for (const item of PILOT_CHECKS.filter(item => item.mandatory)) {
  assert.equal(setPilotCheck(run, item.id, 'pass', 'synthetic device check'), true);
}
let summary = pilotSummary(run);
assert.equal(summary.complete, true);
assert.equal(summary.mandatoryPending, 0);

const firstMandatory = PILOT_CHECKS.find(item => item.mandatory);
setPilotCheck(run, firstMandatory.id, 'fail', 'x'.repeat(PILOT_NOTE_MAX + 100));
summary = pilotSummary(run);
assert.equal(summary.complete, false);
assert.equal(summary.fail, 1);
assert.equal(run.checks[firstMandatory.id].note.length, PILOT_NOTE_MAX);

recordPilotMetric(run, 'content.import', { bytes: 12345, elapsedMs: 678 });
assert.equal(run.metrics['content.import'].bytes, 12345);
assert.match(serializePilotReport(run), /"syntheticOnly": false/);
assert.match(pilotReportText(run), /SERVERLESS DEVICE DIAGNOSTICS/);

const normalized = normalizePilotRun({
  ...run,
  checks: { ...run.checks, bogus: { status: 'pass' } },
  metrics: { 'ok.metric': 1, 'bad metric with spaces': 2 }
}, { appVersion: '1.0.0' });
assert.equal(Object.hasOwn(normalized.checks, 'bogus'), false);
assert.equal(normalized.metrics['ok.metric'], 1);
assert.equal(Object.hasOwn(normalized.metrics, 'bad metric with spaces'), false);

console.log('Serverless device diagnostics model tests: PASS');
