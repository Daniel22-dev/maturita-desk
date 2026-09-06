import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const root = new URL('../', import.meta.url);
const read = rel => fs.readFileSync(new URL(rel, root));
const text = rel => read(rel).toString('utf8');
const json = rel => JSON.parse(text(rel));
const sha = rel => crypto.createHash('sha256').update(read(rel)).digest('hex');

const expected = Object.freeze({
  'ghrab/ghrab-platform.js': '199d03d9dc9263a9e74ed1f1102df0324f3b63e78704f1c70aeacec5feec530c',
  'ghrab/ghrab-platform.css': 'eb465488df46f3d1672d721094800b0be3eb1278924b7699873a483f130b07ad',
  'ghrab/ghrab-artifact-envelope-v1.schema.json': '8edeaaadd72c7bf60285440dd59eb31d0e7139755e1e4642d5ab457816e46d58',
  'ghrab/ghrab-app-registry-v2.schema.json': '47c797999eb93fbd918b968b90a8f8545f938db486fe635b19efcc7936b5672f',
  'assets/brand/school-logo.png': '300396a48cc36d8c2abda0aea673273d4d985476ba88fb0430630ef89ac86770'
});
for (const [rel, digest] of Object.entries(expected)) assert.equal(sha(rel), digest, `${rel} differs from supplied Platform 1.1.2 reference`);

const release = json('ghrab/ghrab-platform-manifest-1.1.2.json');
assert.equal(release.schema, 'ghrab-platform-release-v1');
assert.equal(release.platformVersion, '1.1.2');
assert.equal(release.contract, 'ghrab-platform-v1');
assert.equal(release.brandVersion, '1.0.0');
for (const [name, meta] of Object.entries(release.artifacts)) {
  const rel = name === 'school-logo.png' ? 'assets/brand/school-logo.png' : `ghrab/${name}`;
  assert.equal(sha(rel), meta.sha256, `release manifest hash mismatch: ${name}`);
  assert.equal(read(rel).length, meta.bytes, `release manifest byte mismatch: ${name}`);
}

const consumer = json('ghrab-platform.consumer.json');
const webmanifest = json('manifest.webmanifest');
const build = json('platform-build-info.json');
const appPlatform = json('config/platform-manifest.json');
const dataManifest = json('src/config/data-manifest.json');
assert.equal(consumer.appVersion, '1.0.3');
assert.equal(consumer.platform.version, '1.1.2');
assert.equal(consumer.platform.requiredRange, '>=1.1.2 <2.0.0');
assert.equal(consumer.brand.version, '1.0.0');
assert.equal(consumer.cache.name, 'ghrab-maturita-desk-v1.0.3');
assert.equal(webmanifest.ghrab_platform.version, '1.1.2');
assert.equal(webmanifest.ghrab_platform.required_range, '>=1.1.2 <2.0.0');
assert.equal(webmanifest.ghrab_platform.suite_session_contract, 'ghrab-suite-session-v1');
assert.equal(build.platformVersion, '1.1.2');
assert.equal(build.appVersion, '1.0.3');
assert.equal(appPlatform.ghrabPlatform.suiteSessionContract, 'ghrab-suite-session-v1');
assert.equal(dataManifest.deletion.suiteSessionContract, 'ghrab-suite-session-v1');

const index = text('index.html');
assert.match(index, /data-ghrab-app-id="maturita-desk"/);
assert.match(index, /data-ghrab-app-version="1\.0\.3"/);
assert.match(index, /src\/platform-config\.js/);
assert.match(index, /ghrab\/ghrab-platform\.js\?v=1\.0\.3/);
assert.match(index, /ghrab\/ghrab-platform\.css\?v=1\.0\.3/);
assert.ok(index.indexOf('src/platform-config.js') < index.indexOf('ghrab/ghrab-platform.js'), 'platform config must load before vendor runtime');
assert.ok(index.indexOf('ghrab/ghrab-platform.js') < index.indexOf('src/main.js'), 'Platform 1.1.2 must load before app module');

const vendor = text('ghrab/ghrab-platform.js');
assert.match(vendor, /const PLATFORM_VERSION = '1\.1\.2'/);
assert.match(vendor, /ghrab-suite-session-v1/);
assert.match(vendor, /function onSuiteSessionEnd/);
assert.match(vendor, /if \(ok\) safeSet\(storage\('localStorage'\), suiteSeenKey\(\), detail\.generation\)/);
assert.match(vendor, /global\.addEventListener\('storage'/);

const appSources = [
  'src/main.js','src/suite-session.js','src/session-coordinator.js','src/providers/auth-lease.js','src/review-store.js'
].map(text).join('\n');
assert.doesNotMatch(appSources, /\.session\.end\s*\(/, 'child app must not mint global suite tombstones');
assert.doesNotMatch(appSources, /setItem\s*\(\s*['"]ghrab\.platform\.suite-session-generation\.v1['"]/, 'child app must not write global suite generation');
const ownSeenWrites = [...appSources.matchAll(/setItem\s*\([^\n]*suite-session-seen/gi)];
assert.equal(ownSeenWrites.length, 0, 'child app code must leave acknowledgement write to Platform 1.1.2');

console.log('GHRAB Platform 1.1.2 conformance: PASS');
console.log('Vendor JS/CSS/schemas/logo: byte/hash-identical to supplied AI Studio 0.21.40 reference.');
console.log('Suite contract: ghrab-suite-session-v1; child does not mint global tombstone or foreign acknowledgement.');
