import fs from 'node:fs';
import path from 'node:path';
import { safeEnvelopeMeta, verifyEnvelopePublisherSignature } from '../src/content-pack.js';

const [inputArg, publicKeyArg] = process.argv.slice(2);
if (!inputArg || !publicKeyArg) {
  console.error('Usage: node tools/verify-content-pack-signature.mjs <input.mdesk> <public.jwk>');
  process.exit(2);
}
const input = JSON.parse(fs.readFileSync(path.resolve(inputArg), 'utf8'));
const wrapper = JSON.parse(fs.readFileSync(path.resolve(publicKeyArg), 'utf8'));
if (wrapper.schema !== 'maturita-desk-publisher-public-key-v1' || wrapper.algorithm !== 'ECDSA-P256-SHA256' || !wrapper.keyId || wrapper.jwk?.d) {
  throw new Error('Soubor publisher public key nemá podporovaný formát.');
}
const result = await verifyEnvelopePublisherSignature(input, { [wrapper.keyId]: wrapper.jwk }, ['CONFIDENTIAL-EXAM']);
console.log('Publisher signature: PASS');
console.log(JSON.stringify({ ...safeEnvelopeMeta(input), verified: result.ok, keyId: result.keyId }, null, 2));
