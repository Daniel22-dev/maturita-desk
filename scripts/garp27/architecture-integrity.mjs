#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'security/garp27/architecture-policy.json'), 'utf8'));
const inventory = JSON.parse(fs.readFileSync(path.join(ROOT, 'security/garp27/capability-inventory.json'), 'utf8'));
const errors = [];
const notes = [];

for (const rel of policy.requiredFiles || []) {
  if (!fs.existsSync(path.join(ROOT, rel))) errors.push(`missing required file: ${rel}`);
}

const sourceFiles = [];
for (const scope of policy.sourceScopes || []) {
  const start = path.join(ROOT, scope);
  if (!fs.existsSync(start)) { errors.push(`missing source scope: ${scope}`); continue; }
  walk(start, (full) => sourceFiles.push(path.relative(ROOT, full).replaceAll('\\', '/')));
}
if (sourceFiles.length < Number(policy.minimumCheckedSourceFiles || 1)) {
  errors.push(`source scope too small: ${sourceFiles.length}`);
}

const codeFiles = sourceFiles.filter((rel) => /\.(?:m?js)$/i.test(rel));
let importEdges = 0;
let unresolvedImports = 0;
for (const rel of codeFiles) {
  const full = path.join(ROOT, rel);
  let source = '';
  try { source = fs.readFileSync(full, 'utf8'); } catch { continue; }
  for (const spec of importSpecifiers(source)) {
    if (!spec.startsWith('.')) continue;
    importEdges += 1;
    const resolved = resolveRelativeImport(full, spec);
    if (!resolved) {
      unresolvedImports += 1;
      errors.push(`${rel}: unresolved relative import ${spec}`);
      continue;
    }
    const target = path.relative(ROOT, resolved).replaceAll('\\', '/');
    for (const rule of policy.forbiddenSourceEdges || []) {
      if (rel.startsWith(rule.fromPrefix) && target.startsWith(rule.toPrefix)) {
        errors.push(`${rel}: forbidden dependency edge -> ${target}`);
      }
    }
  }
}

const artifactStats = [];
const forbiddenFragments = [
  ...(policy.forbiddenArtifactFragments || []),
  ...(policy.forbiddenArtifactFragmentParts || []).map((parts) => parts.join('')),
];
for (const out of policy.productionArtifacts || []) {
  const dir = path.join(ROOT, out);
  if (!fs.existsSync(dir)) {
    errors.push(`production artifact missing: ${out}`);
    continue;
  }
  let count = 0;
  walk(dir, (full) => {
    count += 1;
    const rel = path.relative(dir, full).replaceAll('\\', '/');
    if ((policy.forbiddenArtifactPathPrefixes || []).some((x) => rel === x.replace(/\/$/, '') || rel.startsWith(x))) {
      errors.push(`${out}: forbidden artifact path ${rel}`);
    }
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) errors.push(`${out}: symlink forbidden ${rel}`);
    if (stat.size > 4 * 1024 * 1024) return;
    if (!/\.(?:m?js|json|html|css|txt|webmanifest|svg)$/i.test(rel)) return;
    let text = '';
    try { text = fs.readFileSync(full, 'utf8'); } catch { return; }
    for (const fragment of forbiddenFragments) {
      if (text.includes(fragment)) errors.push(`${out}/${rel}: forbidden secret fragment`);
    }
    if (/\bOPENAI_API_KEY\b/.test(text)) errors.push(`${out}/${rel}: provider key variable leaked to browser artifact`);
    if (/api\.openai\.com\/v1\/responses/i.test(text)) errors.push(`${out}/${rel}: direct provider endpoint leaked to browser artifact`);
  });
  artifactStats.push({ artifact: out, files: count });
}

const browserClient = fs.readFileSync(path.join(ROOT, 'src/fact-check.js'), 'utf8');
if (/api\.openai\.com|OPENAI_API_KEY/.test(browserClient)) errors.push('browser Fact Check client contains direct provider material');
const worker = fs.readFileSync(path.join(ROOT, 'serverless/fact-check-worker.mjs'), 'utf8');
const workerDestination = 'https://api.openai.com/v1/responses';
const registeredWorkerEgress = inventory.runtimeProfiles?.serverlessWorker?.allowedEgress || [];
if (worker.includes(workerDestination) !== registeredWorkerEgress.includes(workerDestination)) {
  errors.push('serverless worker egress does not match capability inventory');
}
if (inventory.agentic !== false || (inventory.autonomousToolCapabilities || []).length !== 0) {
  errors.push('capability inventory overstates autonomous authority');
}
if (policy.singleAuthority !== 'GARP-2.7' || !(policy.legacyAuthorities || []).includes('GARP-2.5.1')) {
  errors.push('security authority mapping invalid');
}
notes.push('GARP 2.5.1 remains a regression baseline and is not treated as a competing active authority.');

const report = {
  classification: 'GARP27_ARCHITECTURE_INTEGRITY',
  status: errors.length ? 'FAIL' : 'PASS',
  appId: 'maturita-desk',
  checkedSourceFiles: sourceFiles.length,
  checkedCodeFiles: codeFiles.length,
  importEdges,
  unresolvedImports,
  artifactStats,
  errors,
  notes,
};
console.log(JSON.stringify(report, null, 2));
process.exit(errors.length ? 1 : 0);

function walk(dir, onFile) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, onFile);
    else if (entry.isFile() || entry.isSymbolicLink()) onFile(full);
  }
}
function importSpecifiers(source) {
  const out = [];
  const patterns = [
    /\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let match;
    while ((match = re.exec(source))) out.push(match[1]);
  }
  return out;
}
function resolveRelativeImport(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [base, `${base}.js`, `${base}.mjs`, `${base}.json`, path.join(base, 'index.js'), path.join(base, 'index.mjs')];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}
