import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const required = [
  'index.html','manifest.webmanifest','sw.js','runtime-config.js','config/deployment.json','config/platform-manifest.json','config/brand-manifest.json','ghrab-platform.consumer.json',
  'src/main.js','src/styles.css','src/demo-content.js','src/exam-engine.js','src/notes.js','src/content-validator.js','src/content-pack.js','src/content-pack-store.js',
  'src/review-model.js','src/review-store.js','src/review-patch.js','src/fact-check.js','src/net/read-limited.js','src/device-runtime.js','src/pilot.js','src/session-coordinator.js',
  'src/providers/runtime.js','src/providers/auth-lease.js','src/providers/auth-provider.js','src/providers/content-provider.js','src/providers/registry.js',
  'scripts/security-scan.mjs','tests/response-limits.test.mjs','tests/runtime-config.test.mjs','tests/runtime-pair.test.mjs','tests/auth-provider.test.mjs','tests/server-mode-integration.test.mjs','tests/content-provider.test.mjs','tests/provider-registry.test.mjs','tests/device-runtime.test.mjs','tests/pwa-hardening.test.mjs','tests/device-session-resume.test.mjs','tests/security-stage12.test.mjs','tests/claude-stage12-findings.test.mjs','tests/ai-red-structural.test.mjs','tests/pilot.test.mjs','tests/session-coordinator.test.mjs','tests/main-multitab-smoke.mjs','tests/main-runtime-smoke.mjs',
  'serverless/fact-check-worker.mjs','school-server/CONTRACT.md','school-server/README.md','school-server/DEPLOY-CHECKLIST.txt','school-server/deployment.school-server.example.json','school-server/runtime-config.school-server.example.js','school-server/session-response.example.json','school-server/content-delivery.example.json',
  'samples/synthetic-demo-2027.mdesk','tools/create-stage13-stress-pack.mjs','Maturita-Desk-Stage10-SERVER-NAVOD.txt','README.md','SECURITY-NOTES.md','STAGE-10-STATUS.md','STAGE-11-STATUS.md','STAGE-12-STATUS.md','STAGE-12R-STATUS.md','STAGE-13-STATUS.md','SECURITY-AUDIT-STAGE12.md','SECURITY-REVIEW-STAGE12R.md','CLAUDE-REAUDIT-NOTES.txt','SECURITY-QA-SUMMARY.json','BUILD-REPORT.md','SERVER-ARCHITECTURE-QA-SUMMARY.json','PWA-HARDENING-QA-SUMMARY.json','DEVICE-PILOT-CHECKLIST.txt','STAGE13-PILOT-NAVOD.txt','PILOT-QA-SUMMARY.json'
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
const pilotQa = fs.existsSync(path.join(root,'PILOT-QA-SUMMARY.json')) ? readJson('PILOT-QA-SUMMARY.json') : {};
const main = readText('src/main.js');
const engine = readText('src/exam-engine.js');
const notes = readText('src/notes.js');
const pack = readText('src/content-pack.js');
const store = readText('src/content-pack-store.js');
const reviewPatch = readText('src/review-patch.js');
const fact = readText('src/fact-check.js');
const limited = readText('src/net/read-limited.js');
const contentValidator = readText('src/content-validator.js');
const runtime = readText('src/providers/runtime.js');
const authLease = readText('src/providers/auth-lease.js');
const auth = readText('src/providers/auth-provider.js');
const content = readText('src/providers/content-provider.js');
const registry = readText('src/providers/registry.js');
const sw = readText('sw.js');
const deviceRuntime = readText('src/device-runtime.js');
const pilot = readText('src/pilot.js');
const coordinator = readText('src/session-coordinator.js');
const css = readText('src/styles.css');
const index = readText('index.html');
const worker = readText('serverless/fact-check-worker.mjs');
const sampleText = readText('samples/synthetic-demo-2027.mdesk');
const sample = JSON.parse(sampleText);

if (pkg.version !== '0.10.0') failures.push('Stage 13 pilot version must be 0.10.0');
for (const [name, version] of [['manifest',manifest.version],['consumer',consumer.appVersion],['platform',platform.version]]) if (version !== pkg.version) failures.push(`${name} version mismatch`);
if (!consumer.cache?.name?.includes('v0.10.0') || !manifest.ghrab_platform?.cache_name?.includes('v0.10.0') || !sw.includes("ghrab-maturita-desk-v0.10.0")) failures.push('Stage 13 cache version mismatch');
if (platform.stage !== 'stage-13-synthetic-device-pilot' || consumer.quality?.stage !== 'stage-13-synthetic-device-pilot') failures.push('Stage 13 marker missing');
if (platform.pilot?.syntheticOnly !== true || platform.pilot?.confidentialExamPackAccepted !== false || platform.pilot?.physicalDeviceAcceptance !== 'PENDING') failures.push('Stage 13 synthetic-only pilot manifest invalid');
if (deployment.mode !== 'standalone-local' || deployment.auth?.provider !== 'local-device' || deployment.content?.provider !== 'encrypted-local') failures.push('Public deployment profile must remain standalone-local');
if (deployment.factCheck?.endpoint !== '') failures.push('Public Fact Check endpoint must ship unconfigured');
if (serverExample.mode !== 'school-server' || serverExample.auth?.provider !== 'school-server-session' || serverExample.content?.provider !== 'school-server-encrypted-pack' || serverExample.factCheck?.provider !== 'school-server') failures.push('School-server example provider map invalid');
if (serverQa.serverConnection?.liveSchoolServerConnected !== false) failures.push('Stage 13 must not claim a live school server');

if (!engine.includes("SESSION_SCHEMA = 'maturita-desk-session-v3'") || !engine.includes('pictures: 2 * 60') || !engine.includes('task: 4 * 60') || !engine.includes('topic: 9 * 60')) failures.push('Exam Engine regression');
if (!notes.includes('NOTE_MAX_LENGTH = 5000')) failures.push('Notes bound regression');
if (!pack.includes("ENVELOPE_SCHEMA = 'maturita-desk-encrypted-pack-v1'") || !pack.includes("name: 'AES-GCM'") || !pack.includes("name: 'PBKDF2'") || !pack.includes('additionalData: aad')) failures.push('Encrypted Content Pack regression');
if (!pack.includes('MAX_ENVELOPE_BYTES = 32 * 1024 * 1024')) failures.push('Content Pack ceiling must remain 32 MiB for Stage 13 measurement');
if (!store.includes('ghrab.maturita-desk.protected-content.v1') || !store.includes('indexedDB.open')) failures.push('Protected IndexedDB regression');
if (!reviewPatch.includes('maturita-desk-review-patch-v1') || !reviewPatch.includes('containsExamPrompts: false')) failures.push('Review patch regression');

if (!runtime.includes("RUNTIME_SCHEMA = 'maturita-desk-runtime-v1'") || !runtime.includes("cache: 'no-store'") || !runtime.includes("configurationSource: 'baked-fallback'")) failures.push('Runtime configuration loader/fallback missing');
if (!auth.includes("credentials: 'include'") || !auth.includes("cache: 'no-store'") || !auth.includes('X-Maturita-Desk-Installation')) failures.push('School session fetch contract missing');
if (!auth.includes('clearSignedLease') || !auth.includes('offline-lease')) failures.push('Offline auth lifecycle missing');
if (!authLease.includes("algorithm !== 'ECDSA-P256-SHA256'") || !authLease.includes("namedCurve: 'P-256'") || !authLease.includes('installationId') || !authLease.includes('expiresAt')) failures.push('Signed offline lease verification missing');
if (!content.includes("CONTENT_DELIVERY_SCHEMA = 'maturita-desk-content-delivery-v1'") || !content.includes("credentials: 'include'") || !content.includes('validateEnvelopeShape')) failures.push('School encrypted content delivery missing');
if (content.includes('decryptContentPack')) failures.push('Content delivery provider must never decrypt server response');
if (!registry.includes('createLocalDeviceAuthProvider') || !registry.includes('createSchoolServerAuthProvider') || !registry.includes('createSchoolServerContentProvider')) failures.push('Provider registry incomplete');

if (!main.includes("APP_VERSION = '0.10.0'") || !main.includes('data-action="open-pilot"') || !main.includes('function renderPilotDrawer') || !main.includes('Stage 13 je pilotní build pouze pro syntetická data')) failures.push('Stage 13 pilot UX incomplete');
if (!pilot.includes("PILOT_SCHEMA = 'maturita-desk-pilot-run-v1'") || !pilot.includes('PILOT_SYNTHETIC_ONLY = true') || !pilot.includes('content.import-stress') || !pilot.includes('multitab.guard') || !pilot.includes('offline.cold-start')) failures.push('Stage 13 pilot model incomplete');
if (!main.includes('pilotClassificationAllowed(envelope.classification)') || !main.includes('pilotClassificationAllowed(pack.manifest.classification)')) failures.push('Stage 13 synthetic-only Content Pack gate missing');
if (!coordinator.includes("SESSION_OWNER_KEY = 'ghrab.maturita-desk.session-owner.v1'") || !coordinator.includes('SESSION_OWNER_STALE_MS = 12000') || !coordinator.includes('claimSessionOwnership') || !main.includes('function setupSessionCoordination') || !main.includes('function takeOverSession')) failures.push('Stage 13 multi-tab writer guard missing');
if (!main.includes('session.write-blocked') || !main.includes('Aktivní relaci zapisuje jiný panel')) failures.push('Conflicted tab write protection UX missing');
if (!main.includes("pilotMetric('content.import'") || !main.includes("pilotMetric('content.unlock'") || !main.includes("pilotEvent('lifecycle.background'") || !main.includes("pilotEvent('sw.update-ready'")) failures.push('Stage 13 device instrumentation incomplete');

if (!limited.includes('response?.body?.getReader?.()') || limited.includes('return await response.text()') || !limited.includes("reader.cancel('response-too-large')")) failures.push('Streamed response hard cap regression');
if (!runtime.includes('deployment-origin-mismatch') || !runtime.includes('expectedMode') || !runtime.includes('expectedEnvironmentId') || !runtime.includes('appOrigins') || !runtime.includes('narrowAllowedOrigins')) failures.push('Release-pinned runtime trust regression');
if (!runtime.includes('!auth.logoutEndpoint')) failures.push('School-server logoutEndpoint must be mandatory');
if (!main.includes('configurationLoadError') || !main.includes('runtime-fallback-warning')) failures.push('Runtime config fallback must be visible in UI');
if (!contentValidator.includes("typeof numericId !== 'number'") || !main.includes('data-topic="${escapeHtml(String(topic.id))}"')) failures.push('Strict/escaped topic.id regression');
if (!sw.includes("canonicalEntry = relative === './' || relative === './index.html'") || !sw.includes('tato offline cesta není dostupná')) failures.push('Offline deep-navigation fail-safe regression');
if (!worker.includes("const GATE_HEADER = 'X-Maturita-Desk-Gate'") || !worker.includes('gateAuthorized(request, env)') || !worker.includes('MIN_GATE_TOKEN_CHARS = 32')) failures.push('Fact Check server-side gateway authentication regression');
if (!readText('tests/main-runtime-smoke.mjs').includes('TOPIC_CANARY_SYNTH') || !readText('tests/main-runtime-smoke.mjs').includes("Object.keys(capturedFactRequest.body), ['query']")) failures.push('Actual app-state Fact Check canary regression');

if (!fact.includes('JSON.stringify({ query })') || !main.includes('No topic, Content Pack, Teacher Guidance, Notes or session object is passed here')) failures.push('Fact Check query-only boundary regression');
if (!fact.includes("credentials: credentials === 'include' ? 'include' : 'omit'")) failures.push('Fact Check provider credential-mode switch missing');
if (!registry.includes("provider === 'school-server' ? 'include' : 'omit'")) failures.push('School Fact Check session integration missing');
if (!worker.includes('env.OPENAI_API_KEY') || !worker.includes('FACTCHECK_RATE_LIMITER') || !worker.includes('FACTCHECK_GATE_TOKEN') || !worker.includes('https://api.openai.com/v1/responses') || !worker.includes("Object.keys(body).some(key => key !== 'query')")) failures.push('Serverless Fact Check proxy/anti-abuse regression');

if (!sw.includes('if (!isCoreAsset(url, scopePath)) return;')) failures.push('Service worker must cache only explicit core assets');
if (!sw.includes('navigationNetworkFirst') || /navigationNetworkFirst[\s\S]{0,900}cache\.put\(request/.test(sw)) failures.push('Navigation cache policy may persist dynamic/auth URLs');
if (!sw.includes("relative === 'runtime-config.js'") || !sw.includes("relative === 'config/deployment.json'")) failures.push('Runtime/deployment config must bypass SW cache');
if (!sw.includes("relative.endsWith('.mdesk')") || !sw.includes("relative.endsWith('.mdreview')")) failures.push('Protected artifacts must bypass SW cache');
for (const module of ['./src/net/read-limited.js','./src/providers/runtime.js','./src/providers/auth-lease.js','./src/providers/auth-provider.js','./src/providers/content-provider.js','./src/providers/registry.js','./src/device-runtime.js','./src/pilot.js','./src/session-coordinator.js']) if (!sw.includes(module)) failures.push(`Offline shell module missing: ${module}`);
if (!deviceRuntime.includes('visualViewport') || !deviceRuntime.includes('keyboardOpen') || !deviceRuntime.includes('detectDisplayMode') || !deviceRuntime.includes('classifyFormFactor')) failures.push('Device runtime hardening module incomplete');
if (!main.includes("document.addEventListener('freeze'") || !main.includes("document.addEventListener('resume'") || !main.includes("window.addEventListener('pagehide'") || !main.includes("window.addEventListener('pageshow'")) failures.push('Page lifecycle persistence hardening missing');
if (!main.includes('Aktualizaci neprovádím během zkoušky') || !main.includes('GHRAB_SKIP_WAITING')) failures.push('Safe PWA update deferral missing');
if (!css.includes('object-fit: contain') || !css.includes('data-keyboard="open"') || !css.includes('@media (pointer: coarse)') || !css.includes('min-height: 44px') || !css.includes('.pilot-checklist')) failures.push('Touch/keyboard/image/pilot CSS hardening incomplete');
if (!index.includes('Content-Security-Policy') || !index.includes("script-src 'self'") || !index.includes("script-src-attr 'none'") || !index.includes("object-src 'none'")) failures.push('Static CSP hardening missing');
if (!index.includes('viewport-fit=cover') || !index.includes('interactive-widget=resizes-content') || /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i.test(index)) failures.push('Accessible mobile viewport contract invalid');
if (!platform.deviceRuntime?.visualViewportKeyboardHandling || platform.deviceRuntime?.comparisonImageCropping !== false) failures.push('Device runtime manifest missing');

if (sample.schema !== 'maturita-desk-encrypted-pack-v1' || sample.classification !== 'SYNTHETIC-DEMO' || sample.topicCount !== 20) failures.push('Synthetic sample pack invalid');
if (sampleText.includes('DEMO-ONLY-2027')) failures.push('Synthetic sample passphrase leaked into envelope');
if (qa.classification !== 'PUBLIC-SANITIZED-QA' || qa.topics !== 20 || qa.sourceDocuments !== 80 || qa.automatedChecks?.publicShellLeakGate !== 'PASS') failures.push('Content QA regression');
if (fidelity.classification !== 'PUBLIC-SANITIZED-QA' || fidelity.packToSource?.mismatches !== 0) failures.push('Source fidelity regression');
if (reviewQa.reviewScope?.totalReviewableItems !== 592 || reviewQa.humanGate?.complete !== false) failures.push('Pedagogical review QA regression');
if (factQa.privacyBoundary?.clientRequestFields?.join(',') !== 'query' || factQa.liveIntegration?.openAiRequestExecuted !== false) failures.push('Fact Check QA regression');
if (Object.keys(pilotQa).length && (pilotQa.stage !== 'stage-13' || pilotQa.physicalDevicePilot?.executed !== false || pilotQa.syntheticOnly !== true)) failures.push('Pilot QA must not claim unexecuted physical tests as PASS');

const forbiddenExtensions = new Set(['.docx','.pdf','.zip','.pptx','.xlsx']);
const forbiddenNames = new Set(['content-clear.json','real-content.json','source-qa.json','extraction-report.json']);
const ignoredDirs = new Set(['preview']);
const files = []; walk(root, files);
for (const full of files) {
  const rel = path.relative(root, full).replaceAll('\\','/');
  const ext = path.extname(full).toLowerCase();
  if (forbiddenExtensions.has(ext)) failures.push(`Forbidden artifact in public shell: ${rel}`);
  if (ext === '.mdesk' && rel !== 'samples/synthetic-demo-2027.mdesk') failures.push(`Unknown/confidential .mdesk in public shell: ${rel}`);
  if (ext === '.mdreview') failures.push(`Review patch shipped in public shell: ${rel}`);
  if (forbiddenNames.has(path.basename(full).toLowerCase())) failures.push(`Clear confidential build output: ${rel}`);
  if (rel.includes('private-tools/')) failures.push(`Private tooling included: ${rel}`);
}
const textFiles = files.filter(full => /\.(?:js|mjs|css|html|md|json|webmanifest|svg|txt)$/i.test(full) && !full.endsWith('scripts/validate.mjs'));
const combined = textFiles.map(full => fs.readFileSync(full,'utf8')).join('\n');
if (/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/.test(combined)) failures.push('Possible OpenAI secret in public shell');
if (/BEGIN (?:EC |RSA )?PRIVATE KEY/.test(combined)) failures.push('Private signing key in public shell');
if (/Authorization\s*['"]?\s*:\s*[`'"]?Bearer/i.test([main,runtime,auth,content,registry].join('\n'))) failures.push('Browser provider layer constructs a Bearer token');
if (combined.includes('OPENAI_API_KEY=')) failures.push('OpenAI key assignment in public shell');
if (/data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]{200000,}/.test(combined)) failures.push('Large embedded raster media found');

if (failures.length) {
  console.error('Maturita Desk Stage 13 validation: FAIL');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log('Maturita Desk Stage 13 validation: PASS');
console.log(`Version: ${pkg.version}`);
console.log('Public shell classification: SYNTHETIC-ONLY');
console.log('Pilot policy: CONFIDENTIAL-EXAM content blocked in this build');
console.log('Pilot recorder: local-only report; no automatic upload; no student identity fields');
console.log('Concurrency: writer lease + BroadcastChannel guard; physical multi-tab acceptance still pending');
console.log('Deployment: standalone-local active; school-server contract prepared but not connected');
console.log('Fact Check: query-only; public endpoint unconfigured');
console.log('Physical device acceptance: PENDING — must not be inferred from automated PASS');
console.log(`Checked ${required.length} required artifacts and ${files.length} files.`);

function readText(rel){ return fs.readFileSync(path.join(root,rel),'utf8'); }
function readJson(rel){ return JSON.parse(readText(rel)); }
function walk(dir,out){ for(const entry of fs.readdirSync(dir,{withFileTypes:true})){ if(entry.isDirectory()&&ignoredDirs.has(entry.name)) continue; const full=path.join(dir,entry.name); if(entry.isDirectory()) walk(full,out); else out.push(full); } }
