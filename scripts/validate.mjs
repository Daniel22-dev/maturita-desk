import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const required = [
  'index.html','manifest.webmanifest','sw.js','runtime-config.js','config/deployment.json','config/origin-authorization.json','config/origin-authorization.README.txt','config/platform-manifest.json','config/brand-manifest.json','ghrab-platform.consumer.json',
  'src/main.js','src/styles.css','src/demo-content.js','src/exam-engine.js','src/notes.js','src/content-validator.js','src/content-pack.js','src/content-pack-store.js',
  'src/review-model.js','src/review-store.js','src/review-patch.js','src/fact-check.js','src/net/read-limited.js','src/device-runtime.js','src/pilot.js','src/session-coordinator.js','src/origin-authorization.js',
  'src/providers/runtime.js','src/providers/auth-lease.js','src/providers/auth-provider.js','src/providers/content-provider.js','src/providers/registry.js',
  'scripts/security-scan.mjs','tests/response-limits.test.mjs','tests/runtime-config.test.mjs','tests/runtime-pair.test.mjs','tests/origin-authorization.test.mjs','tests/serverless-final.test.mjs','tests/auth-provider.test.mjs','tests/server-mode-integration.test.mjs','tests/content-provider.test.mjs','tests/provider-registry.test.mjs','tests/device-runtime.test.mjs','tests/pwa-hardening.test.mjs','tests/device-session-resume.test.mjs','tests/security-stage12.test.mjs','tests/claude-stage12-findings.test.mjs','tests/ai-red-structural.test.mjs','tests/pilot.test.mjs','tests/session-coordinator.test.mjs','tests/main-multitab-smoke.mjs','tests/main-runtime-smoke.mjs',
  'serverless/fact-check-worker.mjs','serverless/SERVERLESS-FACT-CHECK-SETUP.txt','serverless/runtime-config.serverless-fact-check.example.js','serverless/README.md',
  'tools/generate-publisher-key.mjs','tools/sign-content-pack.mjs','tools/sign-origin-authorization.mjs','tools/verify-content-pack-signature.mjs','tools/create-content-pack.mjs','tools/create-synthetic-demo-pack.mjs','tools/create-stage13-stress-pack.mjs',
  'school-server/CONTRACT.md','school-server/README.md','school-server/DEPLOY-CHECKLIST.txt','school-server/deployment.school-server.example.json','school-server/runtime-config.school-server.example.js','school-server/session-response.example.json','school-server/content-delivery.example.json',
  'samples/synthetic-demo-2027.mdesk','README.md','RELEASE-1.0.1-STATUS.md','SERVERLESS-PRODUCTION-DEPLOY.txt','DEVICE-ACCEPTANCE-1.0.1.txt','GITHUB-UPDATE-1.0.1.txt','SECURITY-NOTES.md','BUILD-REPORT.md',
  'SECURITY-AUDIT-STAGE12.md','SECURITY-REVIEW-STAGE12R.md','CLAUDE-REAUDIT-NOTES.txt','CONTENT-QA-SUMMARY.json','SOURCE-FIDELITY-SUMMARY.json','REVIEW-QA-SUMMARY.json','FACT-CHECK-QA-SUMMARY.json','PILOT-QA-SUMMARY.json'
];
const failures = [];
for (const rel of required) if (!fs.existsSync(path.join(root, rel))) failures.push(`Missing: ${rel}`);

const pkg = readJson('package.json');
const manifest = readJson('manifest.webmanifest');
const consumer = readJson('ghrab-platform.consumer.json');
const platform = readJson('config/platform-manifest.json');
const deployment = readJson('config/deployment.json');
const serverExample = readJson('school-server/deployment.school-server.example.json');
const serverQa = readJson('SERVER-ARCHITECTURE-QA-SUMMARY.json');
const qa = readJson('CONTENT-QA-SUMMARY.json');
const fidelity = readJson('SOURCE-FIDELITY-SUMMARY.json');
const reviewQa = readJson('REVIEW-QA-SUMMARY.json');
const factQa = readJson('FACT-CHECK-QA-SUMMARY.json');
const pilotQa = readJson('PILOT-QA-SUMMARY.json');
const main = readText('src/main.js');
const engine = readText('src/exam-engine.js');
const notes = readText('src/notes.js');
const pack = readText('src/content-pack.js');
const store = readText('src/content-pack-store.js');
const reviewPatch = readText('src/review-patch.js');
const runtime = readText('src/providers/runtime.js');
const authLease = readText('src/providers/auth-lease.js');
const auth = readText('src/providers/auth-provider.js');
const content = readText('src/providers/content-provider.js');
const registry = readText('src/providers/registry.js');
const sw = readText('sw.js');
const deviceRuntime = readText('src/device-runtime.js');
const diagnostics = readText('src/pilot.js');
const coordinator = readText('src/session-coordinator.js');
const css = readText('src/styles.css');
const index = readText('index.html');
const worker = readText('serverless/fact-check-worker.mjs');
const baked = readText('runtime-config.js');
const sampleText = readText('samples/synthetic-demo-2027.mdesk');
const sample = JSON.parse(sampleText);

if (pkg.version !== '1.0.1') failures.push('Final serverless version must be 1.0.1');
for (const [name, version] of [['manifest',manifest.version],['consumer',consumer.appVersion],['platform',platform.version]]) if (version !== pkg.version) failures.push(`${name} version mismatch`);
if (consumer.cache?.name !== 'ghrab-maturita-desk-v1.0.1' || manifest.ghrab_platform?.cache_name !== 'ghrab-maturita-desk-v1.0.1' || !sw.includes("ghrab-maturita-desk-v1.0.1")) failures.push('1.0.1 cache version mismatch');
if (platform.stage !== 'serverless-1.0.1' || consumer.quality?.stage !== 'serverless-1.0.1') failures.push('Final serverless stage marker missing');
if (consumer.quality?.finalRelease !== true || consumer.quality?.softwareBaseline !== 'feature-complete' || consumer.quality?.externalAcceptance !== 'pending') failures.push('Final baseline / external acceptance semantics invalid');
if (platform.securityAudit?.softwareBaselineFinal !== true || platform.securityAudit?.overallGate !== 'AMBER-FINAL-SOFTWARE-BASELINE-EXTERNAL-ACCEPTANCE-PENDING') failures.push('Release status must distinguish final software from pending external acceptance');

if (deployment.mode !== 'standalone-local' || deployment.environmentId !== 'serverless-production' || deployment.auth?.provider !== 'local-device' || deployment.content?.provider !== 'encrypted-local') failures.push('Final public deployment profile must be serverless standalone-local');
if (deployment.factCheck?.endpoint !== '') failures.push('Final public package must ship Fact Check endpoint unconfigured until the edge service is actually deployed');
if (JSON.stringify(deployment.allowedOrigins) !== JSON.stringify(['self'])) failures.push('Public serverless profile must not pre-authorize an external service origin');
if (JSON.stringify(deployment.trust?.appOrigins) !== JSON.stringify(['https://daniel22-dev.github.io'])) failures.push('Public app origin pin must contain only the current GitHub Pages shell');
if (JSON.stringify(deployment.trust?.confidentialContentOrigins) !== JSON.stringify([])) failures.push('Public source must not hard-code a confidential production origin');
if (deployment.trust?.originAuthorization?.enabled !== true || JSON.stringify(deployment.trust?.originAuthorization?.keyIds) !== JSON.stringify(['ghrab-maturita-content-2026-01'])) failures.push('Signed neutral-origin authorization policy missing');
if (deployment.trust?.allowLocalhostConfidential !== true) failures.push('Developer localhost fallback must be explicit, not implicit');
if (JSON.stringify(deployment.content?.requirePublisherSignatureFor) !== JSON.stringify(['CONFIDENTIAL-EXAM'])) failures.push('Publisher signature requirement missing');
const publisherEntries = Object.entries(deployment.content?.publisherKeys || {});
if (!publisherEntries.length) failures.push('No publisher public key pinned');
for (const [keyId, jwk] of publisherEntries) {
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(keyId) || jwk?.kty !== 'EC' || jwk?.crv !== 'P-256' || !jwk?.x || !jwk?.y || jwk?.d) failures.push(`Invalid public publisher key: ${keyId}`);
}
if (!baked.includes('confidentialContentOrigins: Object.freeze([])') || !baked.includes('originAuthorization: Object.freeze') || !baked.includes("'ghrab-maturita-content-2026-01'")) failures.push('Baked release trust anchor incomplete');

if (serverExample.mode !== 'school-server' || serverExample.auth?.provider !== 'school-server-session' || serverExample.content?.provider !== 'school-server-encrypted-pack' || serverExample.factCheck?.provider !== 'school-server') failures.push('School-server example provider map invalid');
if (!serverExample.content?.publisherKeys || !serverExample.content?.requirePublisherSignatureFor?.includes('CONFIDENTIAL-EXAM')) failures.push('School-server example must preserve publisher signature policy');
if (serverQa.serverConnection?.liveSchoolServerConnected !== false) failures.push('1.0.1 must not falsely claim a live school server');

if (!engine.includes("SESSION_SCHEMA = 'maturita-desk-session-v3'") || !engine.includes('pictures: 2 * 60') || !engine.includes('task: 4 * 60') || !engine.includes('topic: 9 * 60')) failures.push('Exam Engine regression');
if (!notes.includes('NOTE_MAX_LENGTH = 5000')) failures.push('Notes bound regression');
if (!pack.includes("PUBLISHER_SIGNATURE_SCHEMA = 'maturita-desk-publisher-signature-v1'") || !pack.includes("PUBLISHER_SIGNATURE_ALGORITHM = 'ECDSA-P256-SHA256'") || !pack.includes('signContentPackEnvelope') || !pack.includes('verifyEnvelopePublisherSignature')) failures.push('Publisher signature implementation missing');
if (!pack.includes("name: 'AES-GCM'") || !pack.includes("name: 'PBKDF2'") || !pack.includes('additionalData: aad')) failures.push('Encrypted Content Pack regression');
if (!pack.includes('MAX_ENVELOPE_BYTES = 32 * 1024 * 1024')) failures.push('Content Pack ceiling must remain 32 MiB');
if (!content.includes('assertEnvelopeAllowed') || !content.includes('verifyEnvelopePublisherSignature') || !content.includes('confidentialAllowed')) failures.push('Content Provider must enforce origin + signature policy');
if (!runtime.includes('confidentialOriginAllowed') || !runtime.includes('narrowPublicKeys') || !runtime.includes('publisherKeys') || !runtime.includes('loadOriginAuthorization') || !runtime.includes('verifyOriginAuthorization')) failures.push('Runtime release trust for confidential content incomplete');
if (!store.includes('ghrab.maturita-desk.protected-content.v1') || !store.includes('indexedDB.open')) failures.push('Protected IndexedDB regression');
if (!reviewPatch.includes('maturita-desk-review-patch-v1') || !reviewPatch.includes('containsExamPrompts: false')) failures.push('Review patch regression');

if (!runtime.includes("RUNTIME_SCHEMA = 'maturita-desk-runtime-v1'") || !runtime.includes("cache: 'no-store'") || !runtime.includes("configurationSource: 'baked-fallback'")) failures.push('Runtime configuration loader/fallback missing');
if (!auth.includes("credentials: 'include'") || !auth.includes("cache: 'no-store'") || !auth.includes('X-Maturita-Desk-Installation')) failures.push('School session fetch contract missing');
if (!auth.includes('clearSignedLease') || !auth.includes('offline-lease')) failures.push('Offline auth lifecycle missing');
if (!authLease.includes("algorithm !== 'ECDSA-P256-SHA256'") || !authLease.includes("namedCurve: 'P-256'") || !authLease.includes('installationId') || !authLease.includes('expiresAt')) failures.push('Signed offline lease verification missing');
if (!content.includes("CONTENT_DELIVERY_SCHEMA = 'maturita-desk-content-delivery-v1'") || !content.includes("credentials: 'include'") || !content.includes('validateEnvelopeShape')) failures.push('School encrypted content delivery missing');
if (content.includes('decryptContentPack')) failures.push('Content delivery provider must never decrypt server response');
if (!registry.includes('createLocalDeviceAuthProvider') || !registry.includes('createSchoolServerAuthProvider') || !registry.includes('createSchoolServerContentProvider')) failures.push('Provider registry incomplete');

if (!main.includes("APP_VERSION = '1.0.1'") || !main.includes('Diagnostika zařízení') || !main.includes('Ověřit / dohledat') || !main.includes('Podpis vydavatele') || !main.includes('RUNTIME_CONFIG.content.confidentialAllowed')) failures.push('Final serverless UX incomplete');
if (!main.includes("document.addEventListener('change', handleChange)") || fs.existsSync(path.join(root,'src/content-import-bridge.js'))) failures.push('Content Pack import must use the final delegated document handler, not the Stage 13 bridge');
if (main.includes('pilotClassificationAllowed(')) failures.push('Legacy synthetic-only UI classification gate must not control final Content Pack policy');
if (!diagnostics.includes("PILOT_BUILD = 'serverless-1.0.1'") || !diagnostics.includes('PILOT_SYNTHETIC_ONLY = false') || !diagnostics.includes('SERVERLESS DEVICE DIAGNOSTICS')) failures.push('Device diagnostics model incomplete');
if (!coordinator.includes("SESSION_OWNER_KEY = 'ghrab.maturita-desk.session-owner.v1'") || !coordinator.includes('SESSION_OWNER_STALE_MS = 12000') || !coordinator.includes('claimSessionOwnership') || !main.includes('function setupSessionCoordination') || !main.includes('function takeOverSession')) failures.push('Multi-tab writer guard missing');

if (!worker.includes('FACTCHECK_ACCESS_TOKEN') || !worker.includes('FACTCHECK_GATE_TOKEN') || !worker.includes('FACTCHECK_RATE_LIMITER') || !worker.includes("tools: [{ type: 'web_search'") || !worker.includes('body.query')) failures.push('Serverless Verify/lookup worker contract incomplete');
if (!main.includes("body: JSON.stringify({ query })") && !readText('src/fact-check.js').includes("body: JSON.stringify({ query })")) failures.push('Fact Check client must remain query-only');
if (factQa.privacyBoundary?.clientRequestFields?.join(',') !== 'query' || factQa.liveIntegration?.openAiRequestExecuted !== false) failures.push('Fact Check QA must retain query-only boundary and must not claim a live integration');

if (!sw.includes('isProtectedOrRuntime') || !sw.includes("relative.endsWith('.mdesk')") || !sw.includes("'./src/content-pack.js'") || !sw.includes("'./runtime-config.js'") || !sw.includes("'./config/origin-authorization.json'")) failures.push('Service Worker protected-content/cache policy regression');
for (const module of ['./src/providers/runtime.js','./src/providers/auth-provider.js','./src/providers/content-provider.js','./src/providers/registry.js','./src/device-runtime.js','./src/pilot.js','./src/session-coordinator.js','./src/origin-authorization.js']) if (!sw.includes(module)) failures.push(`Offline shell module missing: ${module}`);
if (!deviceRuntime.includes('visualViewport') || !deviceRuntime.includes('keyboardOpen') || !deviceRuntime.includes('detectDisplayMode') || !deviceRuntime.includes('classifyFormFactor')) failures.push('Device runtime hardening module incomplete');
if (!main.includes("document.addEventListener('freeze'") || !main.includes("document.addEventListener('resume'") || !main.includes("window.addEventListener('pagehide'") || !main.includes("window.addEventListener('pageshow'")) failures.push('Page lifecycle persistence hardening missing');
if (!main.includes('Aktualizaci neprovádím během zkoušky') || !main.includes('GHRAB_SKIP_WAITING')) failures.push('Safe PWA update deferral missing');
if (!css.includes('object-fit: contain') || !css.includes('data-keyboard="open"') || !css.includes('@media (pointer: coarse)') || !css.includes('min-height: 44px') || !css.includes('.pilot-checklist')) failures.push('Touch/keyboard/image/diagnostics CSS hardening incomplete');
if (!index.includes('Content-Security-Policy') || !index.includes("script-src 'self'") || !index.includes("script-src-attr 'none'") || !index.includes("object-src 'none'") || !index.includes("connect-src 'self'")) failures.push('Static CSP profile missing or overly broad');
if (!index.includes('viewport-fit=cover') || !index.includes('interactive-widget=resizes-content') || /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i.test(index)) failures.push('Accessible mobile viewport contract invalid');
if (!platform.deviceRuntime?.visualViewportKeyboardHandling || platform.deviceRuntime?.comparisonImageCropping !== false) failures.push('Device runtime manifest missing');

if (sample.schema !== 'maturita-desk-encrypted-pack-v1' || sample.classification !== 'SYNTHETIC-DEMO' || sample.topicCount !== 20) failures.push('Synthetic sample pack invalid');
if (sample.publisherSignature) failures.push('Synthetic demo does not need a production publisher signature');
if (sampleText.includes('DEMO-ONLY-2027')) failures.push('Synthetic sample passphrase leaked into envelope');
if (qa.classification !== 'PUBLIC-SANITIZED-QA' || qa.topics !== 20 || qa.sourceDocuments !== 80 || qa.automatedChecks?.publicShellLeakGate !== 'PASS') failures.push('Content QA regression');
if (fidelity.classification !== 'PUBLIC-SANITIZED-QA' || fidelity.packToSource?.mismatches !== 0) failures.push('Source fidelity regression');
if (reviewQa.reviewScope?.totalReviewableItems !== 592 || reviewQa.humanGate?.complete !== false) failures.push('Pedagogical review QA regression');
if (pilotQa.physicalDevicePilot?.executed !== false) failures.push('Historical pilot QA must not falsely claim physical execution');

const forbiddenExtensions = new Set(['.docx','.pdf','.zip','.pptx','.xlsx','.mdreview']);
const forbiddenNames = new Set(['content-clear.json','real-content.json','source-qa.json','extraction-report.json']);
const files = []; walk(root, files);
for (const full of files) {
  const rel = path.relative(root, full).replaceAll('\\','/');
  const ext = path.extname(full).toLowerCase();
  if (forbiddenExtensions.has(ext)) failures.push(`Forbidden artifact in public shell: ${rel}`);
  if (ext === '.mdesk' && rel !== 'samples/synthetic-demo-2027.mdesk') failures.push(`Real/unknown .mdesk in public shell: ${rel}`);
  if (ext === '.jwk' && rel.endsWith('.private.jwk')) failures.push(`Private publisher key in public shell: ${rel}`);
  if (forbiddenNames.has(path.basename(full).toLowerCase())) failures.push(`Clear confidential build output: ${rel}`);
  if (rel.includes('private-tools/') || rel.includes('publisher-private/')) failures.push(`Private tooling/secret material included: ${rel}`);
  if (/START-MATURITA-DESK-INTERNAL\.cmd$/i.test(rel)) failures.push(`Legacy localhost launcher included in final release: ${rel}`);
}
const textFiles = files.filter(full => /\.(?:js|mjs|css|html|md|json|webmanifest|svg|txt|toml|jwk)$/i.test(full) && !full.endsWith('scripts/validate.mjs') && !full.endsWith('scripts/security-scan.mjs'));
const combined = textFiles.map(full => fs.readFileSync(full,'utf8')).join('\n');
if (/maturita\.ghrabuvka\.cz|maturita-fact\.ghrabuvka\.cz/.test([baked, readText('config/deployment.json'), index].join('\n'))) failures.push('Release source still hard-codes a school production domain');
if (/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/.test(combined)) failures.push('Possible OpenAI secret in public shell');
if (/BEGIN (?:EC |RSA |OPENSSH )?PRIVATE KEY/.test(combined)) failures.push('Private PEM key in public shell');
if (/"d"\s*:\s*"[A-Za-z0-9_-]{20,}"/.test(combined)) failures.push('Possible EC/RSA private JWK parameter in public shell');
if (/Authorization\s*['"]?\s*:\s*[`'"]?Bearer/i.test([main,runtime,auth,content,registry].join('\n'))) failures.push('Browser provider layer constructs a Bearer token');
if (combined.includes('OPENAI_API_KEY=')) failures.push('OpenAI key assignment in public shell');
if (/data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]{200000,}/.test(combined)) failures.push('Large embedded raster media found in public shell');

if (failures.length) {
  console.error('Maturita Desk 1.0.1 serverless validation: FAIL');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log('Maturita Desk 1.0.1 serverless validation: PASS');
console.log(`Version: ${pkg.version}`);
console.log('Public shell: no real exam content, passphrase, OpenAI secret or publisher private key.');
console.log('Origin policy: shared GitHub Pages = demo-only; neutral production hosts require a signed same-origin authorization grant.');
console.log('Publisher authenticity: mandatory ECDSA P-256 signature for CONFIDENTIAL-EXAM.');
console.log('Verify/lookup: query-only; edge endpoint intentionally unconfigured until live deployment.');
console.log('Software baseline: FINAL / feature-complete. Physical, pedagogical and live-service acceptance remain external PENDING gates.');
console.log(`Checked ${required.length} required artifacts and ${files.length} files.`);

function readText(rel){ return fs.readFileSync(path.join(root,rel),'utf8'); }
function readJson(rel){ return JSON.parse(readText(rel)); }
function walk(dir,out){ for(const entry of fs.readdirSync(dir,{withFileTypes:true})){ if(entry.name==='.git') continue; const full=path.join(dir,entry.name); if(entry.isDirectory()) walk(full,out); else out.push(full); } }
