#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VENDOR = path.join(ROOT, 'vendor', 'garp-2.7-consolidated-r2');
const validator = path.join(VENDOR, 'MASTER/TOOLS/validate-policy.mjs');
const core = path.join(VENDOR, 'MASTER/CONTRACTS/garp27-core.json');
const inventory = path.join(VENDOR, 'MASTER/INVENTORY/ecosystem-apps.json');
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'security/garp27/garp-policy.json'), 'utf8'));
const cases = [
  ['positive', 0, (x) => x],
  ['reject-unknown-app', 1, (x) => ({ ...x, appId: 'ghost-app' })],
  ['reject-zero-version', 1, (x) => ({ ...x, appVersion: '0.0.0' })],
  ['reject-placeholder', 1, (x) => ({ ...x, incident: { response: 'replace-with-owner' } })],
  ['reject-empty-required-section', 1, (x) => ({ ...x, egress: {} })],
];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maturita-g27-policy-'));
const results = [];
let failed = 0;
try {
  for (const [id, expected, mutate] of cases) {
    const file = path.join(dir, `${id}.json`);
    fs.writeFileSync(file, JSON.stringify(mutate(structuredClone(base)), null, 2));
    const r = spawnSync(process.execPath, [validator, file, '--core', core, '--inventory', inventory], { cwd: ROOT, encoding: 'utf8' });
    const pass = r.status === expected;
    results.push({ id, expectedExit: expected, actualExit: r.status, pass });
    if (!pass) failed += 1;
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(JSON.stringify({ classification: 'GARP27_POLICY_MUTATION_TEST', status: failed ? 'FAIL' : 'PASS', syntheticOnly: true, results }, null, 2));
process.exit(failed ? 1 : 0);
