import assert from 'node:assert/strict';
import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync(new URL('../config/deployment.json', import.meta.url), 'utf8'));
delete globalThis.MATURITA_DESK_RUNTIME;
await import(`../runtime-config.js?pair=${Date.now()}`);
const baked = globalThis.MATURITA_DESK_RUNTIME;
assert.ok(baked, 'runtime-config.js did not publish MATURITA_DESK_RUNTIME');
for (const key of ['schema','version','environmentId','mode','serverBaseUrl']) assert.deepEqual(baked[key], config[key], `runtime pair mismatch: ${key}`);
assert.deepEqual([...baked.allowedOrigins], config.allowedOrigins);
assert.deepEqual({ expectedMode: baked.trust.expectedMode, expectedEnvironmentId: baked.trust.expectedEnvironmentId, appOrigins: [...baked.trust.appOrigins] }, config.trust);
assert.equal(baked.auth.provider, config.auth.provider);
assert.equal(baked.content.provider, config.content.provider);
assert.equal(baked.factCheck.provider, config.factCheck.provider);
assert.equal(baked.factCheck.endpoint, config.factCheck.endpoint);
console.log('Runtime baked/network profile parity: PASS');
