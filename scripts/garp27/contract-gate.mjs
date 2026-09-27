#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VENDOR = path.join(ROOT, 'vendor', 'garp-2.7-consolidated-r2');
const trust = JSON.parse(fs.readFileSync(path.join(ROOT, 'security/garp27/trust-anchor.json'), 'utf8'));
const inventory = path.join(VENDOR, 'MASTER/INVENTORY/ecosystem-apps.json');
const core = path.join(VENDOR, 'MASTER/CONTRACTS/garp27-core.json');

function run(id, args, expected = 0) {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
  return {
    id,
    expectedExit: expected,
    actualExit: r.status,
    pass: r.status === expected,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

const results = [];
results.push(run('package-selftest', [path.join(VENDOR, 'MASTER/TOOLS/package-selftest.mjs')]));
let packageReport = null;
try { packageReport = JSON.parse(results.at(-1).stdout); } catch {}
results.push({
  id: 'trusted-package-check-digest',
  expectedExit: 0,
  actualExit: packageReport?.checkDigest === trust.canonicalPackageContractCheckSha256 ? 0 : 1,
  pass: packageReport?.checkDigest === trust.canonicalPackageContractCheckSha256,
  observedDigest: packageReport?.checkDigest || null,
});
results.push(run('contract-selftest', [path.join(VENDOR, 'MASTER/TOOLS/contract-selftest.mjs')]));
results.push(run('policy', [
  path.join(VENDOR, 'MASTER/TOOLS/validate-policy.mjs'),
  path.join(ROOT, 'security/garp27/garp-policy.json'),
  '--core', core,
  '--inventory', inventory,
]));
results.push(run('live-deferred', [
  path.join(VENDOR, 'MASTER/TOOLS/validate-live-status.mjs'),
  path.join(ROOT, 'security/garp27/live-status.json'),
  '--profile', path.join(ROOT, 'security/garp27/application-migration-profile.json'),
], 3));

const failed = results.filter((x) => !x.pass).length;
console.log(JSON.stringify({
  classification: 'GARP27_CONTRACT_GATE',
  status: failed ? 'FAIL' : 'PASS',
  garpVersion: '2.7',
  appId: 'maturita-desk',
  serverPhase: 'DEFERRED_BY_OWNER_DECISION',
  results,
  summary: { total: results.length, passed: results.length - failed, failed },
}, null, 2));
process.exit(failed ? 1 : 0);
