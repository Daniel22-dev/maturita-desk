import fs from 'node:fs';
import path from 'node:path';
import { signContentPackEnvelope, verifyEnvelopePublisherSignature } from '../src/content-pack.js';

const [inputArg, privateKeyArg, outputArg] = process.argv.slice(2);
if (!inputArg || !privateKeyArg || !outputArg) {
  console.error('Usage: node tools/sign-content-pack.mjs <input.mdesk> <private.private.jwk> <output.mdesk>');
  process.exit(2);
}
const inputPath = path.resolve(inputArg);
const privatePath = path.resolve(privateKeyArg);
const outputPath = path.resolve(outputArg);
const envelope = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const wrapper = JSON.parse(fs.readFileSync(privatePath, 'utf8'));
if (wrapper.schema !== 'maturita-desk-publisher-private-key-v1' || wrapper.algorithm !== 'ECDSA-P256-SHA256' || !wrapper.keyId || !wrapper.jwk?.d) {
  throw new Error('Soubor publisher private key nemá podporovaný formát.');
}
const signed = await signContentPackEnvelope(envelope, wrapper.jwk, wrapper.keyId);
const publicJwk = { ...wrapper.jwk };
delete publicJwk.d;
publicJwk.key_ops = ['verify'];
await verifyEnvelopePublisherSignature(signed, { [wrapper.keyId]: publicJwk }, ['CONFIDENTIAL-EXAM']);
fs.writeFileSync(outputPath, JSON.stringify(signed), { mode: 0o600 });
console.log(`Signed Content Pack written: ${outputPath}`);
console.log(`Publisher keyId: ${wrapper.keyId}`);
