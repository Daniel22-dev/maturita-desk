#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOOLS = path.join(ROOT, 'vendor', 'garp-2.7-consolidated-r2', 'MASTER', 'TOOLS');
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const evidenceFile = path.join(ROOT, 'security/garp27/architecture-policy.json');
const evidenceSha = sha(evidenceFile);
const commit = '0'.repeat(40);
const target = {
  appId: 'maturita-desk',
  version,
  commitSha: commit,
  artifactSha256: '0'.repeat(64),
  policySha256: sha(path.join(ROOT, 'security/garp27/garp-policy.json')),
};
const gateIds = ['foundation', 'architecture', 'legacy-regression', 'release-integrity', 'content-pack-security', 'fact-check-boundary', 'studio-dispatch'];
const gates = gateIds.map((id) => ({ id, status: 'PASS', evidenceRefs: [{ id: 'architecture-policy', sha256: evidenceSha }] }));
const base = {
  schema: 'garp27-auto-patch-manifest-v1',
  garpVersion: '2.7',
  releaseId: `maturita-desk-${version}-synthetic`,
  sequence: 1,
  previousReleaseId: null,
  target,
  source: { repository: 'Daniel22-dev/maturita-desk', allowlisted: true },
  gates,
};
const trust = {
  schema: 'garp27-auto-patch-trust-v1',
  garpVersion: '2.7',
  target,
  source: { repository: 'Daniel22-dev/maturita-desk', allowlisted: true },
  requiredGates: gateIds.map((id) => ({ id, allowNA: false })),
  trustedEvidence: { 'architecture-policy': evidenceSha },
  replay: { minimumSequence: 1, previousReleaseId: null },
};
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maturita-g27-ap-'));
const write = (name, value) => { const p = path.join(dir, name); fs.writeFileSync(p, JSON.stringify(value, null, 2)); return p; };
const prepared = write('prepared.json', { ...base, state: 'PREPARED' });
const validated = write('validated.json', { ...base, state: 'VALIDATED' });
const committed = write('committed.json', { ...base, state: 'COMMITTED' });
const rolledBack = write('rolled-back.json', { ...base, state: 'ROLLED_BACK' });
const trustFile = write('trust.json', trust);
const missingGate = write('missing-gate.json', { ...base, state: 'COMMITTED', gates: gates.filter((g) => g.id !== 'fact-check-boundary') });
const untrustedSource = write('untrusted-source.json', { ...base, state: 'COMMITTED', source: { repository: 'other/repository', allowlisted: false } });
const tests = [
  { id: 'prepared-admission', args: [path.join(TOOLS, 'validate-auto-patch.mjs'), prepared, '--trust', trustFile], expected: 0 },
  { id: 'committed-admission', args: [path.join(TOOLS, 'validate-auto-patch.mjs'), committed, '--trust', trustFile, '--require-committed'], expected: 0 },
  { id: 'prepared-to-validated', args: [path.join(TOOLS, 'validate-auto-patch-transition.mjs'), prepared, validated], expected: 0 },
  { id: 'validated-to-committed', args: [path.join(TOOLS, 'validate-auto-patch-transition.mjs'), validated, committed], expected: 0 },
  { id: 'committed-to-rolled-back', args: [path.join(TOOLS, 'validate-auto-patch-transition.mjs'), committed, rolledBack], expected: 0 },
  { id: 'reject-missing-gate', args: [path.join(TOOLS, 'validate-auto-patch.mjs'), missingGate, '--trust', trustFile, '--require-committed'], expected: 1 },
  { id: 'reject-untrusted-source', args: [path.join(TOOLS, 'validate-auto-patch.mjs'), untrustedSource, '--trust', trustFile, '--require-committed'], expected: 1 },
];
let failed = 0;
const results = [];
for (const test of tests) {
  const r = spawnSync(process.execPath, test.args, { cwd: ROOT, encoding: 'utf8' });
  const pass = r.status === test.expected;
  results.push({ id: test.id, expectedExit: test.expected, actualExit: r.status, pass });
  if (!pass) failed += 1;
}
fs.rmSync(dir, { recursive: true, force: true });
console.log(JSON.stringify({ classification: 'GARP27_AUTO_PATCH_CONTRACT', status: failed ? 'FAIL' : 'PASS', liveAutoPatchClaim: false, results }, null, 2));
process.exit(failed ? 1 : 0);
