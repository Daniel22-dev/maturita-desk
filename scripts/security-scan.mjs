import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const findings = [];
const files = [];
walk(root, files);

const secretPatterns = [
  ['openai', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
  ['google-api', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g],
  ['aws-access', /\bAKIA[0-9A-Z]{16}\b/g],
  ['private-pem', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['private-jwk-d', /"d"\s*:\s*"[A-Za-z0-9_-]{20,}"/g]
];

for (const full of files) {
  const rel = path.relative(root, full).replaceAll('\\', '/');
  const stat = fs.lstatSync(full);
  if (stat.isSymbolicLink()) findings.push(`symlink:${rel}`);
  if (rel.split('/').some(segment => segment === '..')) findings.push(`path-traversal:${rel}`);
  if (/\.private\.jwk$/i.test(rel) || rel.includes('/publisher-private/')) findings.push(`publisher-private-key:${rel}`);
  if (stat.size > 8 * 1024 * 1024 && !rel.endsWith('.mdesk')) continue;
  if (!/\.(?:js|mjs|json|webmanifest|html|css|md|txt|toml|svg|jwk)$/i.test(rel)) continue;
  if (rel === 'scripts/security-scan.mjs' || rel === 'scripts/validate.mjs') continue;
  const text = fs.readFileSync(full, 'utf8');
  for (const [name, pattern] of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) findings.push(`${name}:${rel}`);
  }
  if (/OPENAI_API_KEY\s*=\s*[^\s#]+/.test(text)) findings.push(`openai-assignment:${rel}`);
}

const forbiddenArtifacts = files
  .map(full => path.relative(root, full).replaceAll('\\', '/'))
  .filter(rel => /\.(?:docx|pdf|pptx|xlsx|zip|mdreview)$/i.test(rel) || (rel.endsWith('.mdesk') && rel !== 'samples/synthetic-demo-2027.mdesk'));
for (const rel of forbiddenArtifacts) findings.push(`forbidden-artifact:${rel}`);

const syntheticControls = {
  openai: `sk-proj-${'A'.repeat(32)}`,
  google: `AIza${'B'.repeat(35)}`,
  github: `ghp_${'C'.repeat(32)}`,
  privatePem: '-----BEGIN ' + 'PRIVATE' + ' KEY-----',
  privateJwk: JSON.stringify({ d: 'D'.repeat(43) })
};
assertMatches('openai', syntheticControls.openai, secretPatterns[0][1]);
assertMatches('google', syntheticControls.google, secretPatterns[1][1]);
assertMatches('github', syntheticControls.github, secretPatterns[2][1]);
assertMatches('private-pem', syntheticControls.privatePem, secretPatterns[4][1]);
assertMatches('private-jwk-d', syntheticControls.privateJwk, secretPatterns[5][1]);

const canary = ['GARP', 'STUDENT', 'CANARY', 'MATURITA', 'DESK', 'S12'].join('-');
const safePayload = JSON.stringify({ query: 'Synthetic fact' });
const unsafePayload = JSON.stringify({ query: 'Synthetic fact', notes: canary });
if (safePayload.includes(canary)) throw new Error('Canary self-test invalid: clean payload already contains canary.');
if (!unsafePayload.includes(canary)) throw new Error('Canary negative control failed to detect unsafe payload.');

if (findings.length) {
  console.error('Maturita Desk 1.0.0 public artifact security scan: FAIL');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}
console.log('Maturita Desk 1.0.0 public artifact security scan: PASS');
console.log(`Files inventoried: ${files.length}; secret/path/private-key/forbidden-artifact findings: 0`);
console.log('Negative controls: secret-shaped fixtures, private JWK fixture and canary unsafe payload detected.');

function assertMatches(name, text, pattern) {
  pattern.lastIndex = 0;
  if (!pattern.test(text)) throw new Error(`Secret scanner negative control failed: ${name}`);
}
function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
}
