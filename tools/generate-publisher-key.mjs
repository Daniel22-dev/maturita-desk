import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [outDirArg = '.', keyIdArg = 'ghrab-maturita-content-YYYY-NN'] = process.argv.slice(2);
const keyId = String(keyIdArg || '').trim();
if (!/^[A-Za-z0-9._:-]{1,120}$/.test(keyId)) throw new Error('Neplatný keyId.');
const outDir = path.resolve(outDirArg);
fs.mkdirSync(outDir, { recursive: true });

const { publicKey, privateKey } = await crypto.webcrypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
);
const publicJwk = await crypto.webcrypto.subtle.exportKey('jwk', publicKey);
const privateJwk = await crypto.webcrypto.subtle.exportKey('jwk', privateKey);
const algorithm = 'ECDSA-P256-SHA256';
const publicWrapper = { schema: 'maturita-desk-publisher-public-key-v1', keyId, algorithm, jwk: publicJwk };
const privateWrapper = { schema: 'maturita-desk-publisher-private-key-v1', keyId, algorithm, jwk: privateJwk };

const safeId = keyId.replace(/[^A-Za-z0-9._-]/g, '_');
const publicPath = path.join(outDir, `Maturita-Desk-PUBLISHER-PUBLIC-${safeId}.jwk`);
const privatePath = path.join(outDir, `Maturita-Desk-PUBLISHER-PRIVATE-${safeId}.private.jwk`);
fs.writeFileSync(publicPath, JSON.stringify(publicWrapper, null, 2) + '\n', { mode: 0o644 });
fs.writeFileSync(privatePath, JSON.stringify(privateWrapper, null, 2) + '\n', { mode: 0o600 });
console.log(`Publisher key pair created. Public: ${publicPath}`);
console.log(`Private key created separately: ${privatePath}`);
console.log('PRIVATE KEY MUST NEVER BE COMMITTED TO GITHUB OR SHIPPED WITH THE PUBLIC APP.');
