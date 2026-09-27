#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'audit-evidence', 'garp27-current');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

const steps = [
  ['build-pages', ['npm', 'run', 'build:pages']],
  ['contracts', ['npm', 'run', 'qa:garp27:contracts']],
  ['architecture', ['npm', 'run', 'qa:garp27:architecture']],
  ['policy-mutations', ['npm', 'run', 'qa:garp27:policy-mutations']],
  ['app-mutations', ['npm', 'run', 'qa:garp27:mutations']],
  ['auto-patch-contract', ['npm', 'run', 'qa:garp27:auto-patch']],
  ['legacy-tooling', ['npm', 'run', 'qa:garp25:tooling']],
  ['legacy-pinned', ['npm', 'run', 'qa:garp25:pinned']],
  ['legacy-secret-scan', ['npm', 'run', 'qa:garp25:secrets']],
  ['application-regressions', ['npm', 'test']],
  ['deployment-leak-scan', ['npm', 'run', 'qa:garp25:deployment']],
  ['studio-dispatch', ['npm', 'run', 'test:studio-dispatch']],
  ['safe-promotion', ['npm', 'run', 'qa:safe-promotion']],
  ['auto-patch-topology', ['npm', 'run', 'qa:auto-patch-topology']],
];

const results = [];
let failed = 0;
for (const [id, cmd] of steps) {
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd: ROOT, encoding: 'utf8', env: process.env, maxBuffer: 30 * 1024 * 1024 });
  const file = path.join(OUT, `${id}.log`);
  fs.writeFileSync(file, `$ ${cmd.join(' ')}\nEXIT=${r.status}\n\n${r.stdout || ''}\n${r.stderr || ''}`);
  const pass = r.status === 0;
  results.push({ id, actualExit: r.status, pass, evidence: { id, sha256: sha(file) } });
  if (!pass) failed += 1;
}

const source = process.env.GITHUB_SHA && /^[a-f0-9]{40}$/i.test(process.env.GITHUB_SHA)
  ? process.env.GITHUB_SHA.toLowerCase()
  : crypto.createHash('sha1').update(results.map((x) => x.evidence.sha256).join('')).digest('hex');
const summary = {
  classification: 'GARP27_FOUNDATION_GATE',
  schema: 'garp27-foundation-summary-v1',
  garpVersion: '2.7',
  appId: 'maturita-desk',
  appVersion: version,
  status: failed ? 'FAIL' : 'FOUNDATION_PASS_LIVE_NOT_TESTED',
  serverPhase: 'DEFERRED_BY_OWNER_DECISION',
  liveStatus: 'NOT_TESTED',
  sourceIdentity: { value: source, kind: process.env.GITHUB_SHA ? 'git-commit' : 'local-evidence-sha1-surrogate' },
  steps: results,
  summary: { total: results.length, passed: results.filter((x) => x.pass).length, failed },
};
fs.writeFileSync(path.join(OUT, 'foundation-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
process.exit(failed ? 1 : 0);
