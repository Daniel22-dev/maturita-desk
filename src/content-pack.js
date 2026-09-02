import { validateTopicCollection } from './content-validator.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const CONTENT_SCHEMA = 'maturita-desk-content-v1';
export const ENVELOPE_SCHEMA = 'maturita-desk-encrypted-pack-v1';
export const APP_ID = 'maturita-desk';
export const DEFAULT_PBKDF2_ITERATIONS = 310000;
export const MAX_PBKDF2_ITERATIONS = 1000000;
export const MAX_ENVELOPE_BYTES = 32 * 1024 * 1024;

export function createContentPack({ packId, version, label, classification = 'CONFIDENTIAL-EXAM', metadata = {}, topics, createdAt = new Date().toISOString() }) {
  const pack = {
    schema: CONTENT_SCHEMA,
    appId: APP_ID,
    manifest: {
      packId: String(packId || '').trim(),
      version: String(version || '').trim(),
      label: String(label || '').trim(),
      classification,
      topicCount: Array.isArray(topics) ? topics.length : 0,
      createdAt
    },
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
    topics: Array.isArray(topics) ? topics : []
  };
  const check = validateContentPackShape(pack);
  if (!check.ok) throw new Error(check.errors.join(' '));
  return pack;
}

export function validateContentPackShape(pack) {
  const errors = [];
  if (!pack || typeof pack !== 'object') return { ok: false, errors: ['Content Pack není datový objekt.'] };
  if (pack.schema !== CONTENT_SCHEMA) errors.push('Neplatné schéma dešifrovaného Content Packu.');
  if (pack.appId !== APP_ID) errors.push('Content Pack není určen pro Maturita Desk.');
  const manifest = pack.manifest;
  if (!manifest || typeof manifest !== 'object') errors.push('Chybí manifest Content Packu.');
  if (!String(manifest?.packId || '').trim()) errors.push('Chybí packId.');
  if (!String(manifest?.version || '').trim()) errors.push('Chybí verze obsahu.');
  if (!String(manifest?.label || '').trim()) errors.push('Chybí název Content Packu.');
  if (!['CONFIDENTIAL-EXAM', 'SYNTHETIC-DEMO'].includes(manifest?.classification)) errors.push('Neplatná klasifikace Content Packu.');
  if (pack.metadata !== undefined && (!pack.metadata || typeof pack.metadata !== 'object' || Array.isArray(pack.metadata))) errors.push('Metadata Content Packu musí být objekt.');
  if (!Array.isArray(pack.topics)) errors.push('Chybí pole topics.');
  if (Array.isArray(pack.topics) && manifest?.topicCount !== pack.topics.length) errors.push('Manifest topicCount neodpovídá obsahu.');
  if (Array.isArray(pack.topics) && pack.topics.length !== 20) errors.push('Maturita Desk v1 očekává právě 20 témat.');
  if (Array.isArray(pack.topics) && pack.topics.length === 20) {
    const topicCheck = validateTopicCollection(pack.topics);
    if (!topicCheck.ok) errors.push(`Obsah témat neprošel validací: ${topicCheck.errors[0]}`);
  }
  if (manifest?.classification === 'CONFIDENTIAL-EXAM') {
    const refs = collectUnsafeConfidentialMediaRefs(pack.topics);
    if (refs.length) errors.push(`CONFIDENTIAL-EXAM pack musí obsahovat pouze vložená rastrová média; nepovolený asset: ${refs[0]}`);
  }
  return { ok: errors.length === 0, errors };
}

function collectUnsafeConfidentialMediaRefs(value, path = 'topics', out = []) {
  if (out.length > 10) return out;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectUnsafeConfidentialMediaRefs(item, `${path}[${index}]`, out));
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  for (const [key, item] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    if (key === 'src' && typeof item === 'string' && item.trim()) {
      if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(item)) out.push(nextPath);
    } else collectUnsafeConfidentialMediaRefs(item, nextPath, out);
  }
  return out;
}

export function validateEnvelopeShape(envelope) {
  const errors = [];
  if (!envelope || typeof envelope !== 'object') return { ok: false, errors: ['Soubor není platný Content Pack.'] };
  if (envelope.schema !== ENVELOPE_SCHEMA) errors.push('Neplatné schéma šifrovaného Content Packu.');
  if (envelope.appId !== APP_ID) errors.push('Balíček není určen pro Maturita Desk.');
  if (!String(envelope.packId || '').trim()) errors.push('Chybí packId.');
  if (!String(envelope.contentVersion || '').trim()) errors.push('Chybí verze obsahu.');
  if (!String(envelope.label || '').trim()) errors.push('Chybí označení balíčku.');
  if (!['CONFIDENTIAL-EXAM', 'SYNTHETIC-DEMO'].includes(envelope.classification)) errors.push('Neplatná klasifikace balíčku.');
  if (!Number.isInteger(envelope.topicCount) || envelope.topicCount < 1 || envelope.topicCount > 100) errors.push('Neplatný počet témat.');
  if (envelope.kdf?.name !== 'PBKDF2' || envelope.kdf?.hash !== 'SHA-256') errors.push('Nepodporovaná KDF.');
  if (!Number.isInteger(envelope.kdf?.iterations) || envelope.kdf.iterations < 200000 || envelope.kdf.iterations > MAX_PBKDF2_ITERATIONS) errors.push(`KDF iterations musí být v rozsahu 200000 až ${MAX_PBKDF2_ITERATIONS}.`);
  if (!isBase64Bytes(envelope.kdf?.salt, 16)) errors.push('Neplatná KDF salt.');
  if (envelope.cipher?.name !== 'AES-GCM' || envelope.cipher?.tagLength !== 128) errors.push('Nepodporovaná šifra.');
  if (!isBase64Bytes(envelope.cipher?.iv, 12)) errors.push('Neplatný AES-GCM IV.');
  if (!String(envelope.payload || '').trim()) errors.push('Chybí šifrovaný payload.');
  if (!/^[a-f0-9]{64}$/i.test(String(envelope.ciphertextSha256 || ''))) errors.push('Chybí kontrolní SHA-256 šifrovaného payloadu.');
  return { ok: errors.length === 0, errors };
}

export async function encryptContentPack(pack, passphrase, options = {}) {
  const shape = validateContentPackShape(pack);
  if (!shape.ok) throw new Error(shape.errors.join(' '));
  requirePassphrase(passphrase);
  const subtle = requireSubtle();
  const iterations = Number(options.iterations || DEFAULT_PBKDF2_ITERATIONS);
  if (!Number.isInteger(iterations) || iterations < 200000 || iterations > MAX_PBKDF2_ITERATIONS) throw new Error(`PBKDF2 iterations musí být v rozsahu 200000 až ${MAX_PBKDF2_ITERATIONS}.`);

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(passphrase, salt, iterations, ['encrypt']);
  const meta = {
    schema: ENVELOPE_SCHEMA,
    appId: APP_ID,
    packId: pack.manifest.packId,
    contentVersion: pack.manifest.version,
    label: pack.manifest.label,
    classification: pack.manifest.classification,
    topicCount: pack.manifest.topicCount,
    createdAt: pack.manifest.createdAt,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: bytesToBase64(salt) },
    cipher: { name: 'AES-GCM', tagLength: 128, iv: bytesToBase64(iv) }
  };
  const aad = encoder.encode(canonicalAad(meta));
  const plaintext = encoder.encode(JSON.stringify(pack));
  const encrypted = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, key, plaintext));
  const payload = bytesToBase64(encrypted);
  const envelope = {
    ...meta,
    payload,
    ciphertextSha256: await sha256Hex(encrypted)
  };
  if (estimateEnvelopeBytes(envelope) > MAX_ENVELOPE_BYTES) throw new Error('Content Pack překračuje maximální podporovanou velikost 32 MiB.');
  return envelope;
}

export async function decryptContentPack(envelope, passphrase) {
  const shape = validateEnvelopeShape(envelope);
  if (!shape.ok) throw new Error(shape.errors.join(' '));
  requirePassphrase(passphrase);
  const subtle = requireSubtle();
  const encrypted = base64ToBytes(envelope.payload);
  if (encrypted.byteLength > MAX_ENVELOPE_BYTES) throw new Error('Šifrovaný payload je příliš velký.');
  const digest = await sha256Hex(encrypted);
  if (!timingSafeTextEqual(digest, envelope.ciphertextSha256.toLowerCase())) throw new Error('Kontrola integrity šifrovaného payloadu selhala.');
  const salt = base64ToBytes(envelope.kdf.salt);
  const iv = base64ToBytes(envelope.cipher.iv);
  const key = await deriveKey(passphrase, salt, envelope.kdf.iterations, ['decrypt']);
  const aad = encoder.encode(canonicalAad(envelope));
  let clear;
  try {
    clear = await subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, key, encrypted);
  } catch {
    throw new Error('Content Pack nelze odemknout. Heslo je nesprávné nebo byl balíček změněn.');
  }
  let pack;
  try { pack = JSON.parse(decoder.decode(clear)); }
  catch { throw new Error('Dešifrovaný Content Pack není platný JSON.'); }
  const packShape = validateContentPackShape(pack);
  if (!packShape.ok) throw new Error(packShape.errors.join(' '));
  if (pack.manifest.packId !== envelope.packId || pack.manifest.version !== envelope.contentVersion || pack.manifest.classification !== envelope.classification || pack.manifest.topicCount !== envelope.topicCount) {
    throw new Error('Vnitřní manifest Content Packu neodpovídá šifrovanému obalu.');
  }
  return pack;
}

export function safeEnvelopeMeta(envelope) {
  const check = validateEnvelopeShape(envelope);
  if (!check.ok) throw new Error(check.errors.join(' '));
  return {
    packId: envelope.packId,
    contentVersion: envelope.contentVersion,
    label: envelope.label,
    classification: envelope.classification,
    topicCount: envelope.topicCount,
    createdAt: envelope.createdAt,
    iterations: envelope.kdf.iterations,
    encryptedBytes: Math.ceil((envelope.payload.length * 3) / 4)
  };
}

export function estimateEnvelopeBytes(envelope) {
  return encoder.encode(JSON.stringify(envelope)).byteLength;
}

export async function parseEnvelopeText(text) {
  const bytes = encoder.encode(String(text || '')).byteLength;
  if (bytes <= 2 || bytes > MAX_ENVELOPE_BYTES) throw new Error('Soubor Content Packu má neplatnou velikost.');
  let envelope;
  try { envelope = JSON.parse(text); }
  catch { throw new Error('Soubor není platný JSON Content Pack.'); }
  const check = validateEnvelopeShape(envelope);
  if (!check.ok) throw new Error(check.errors.join(' '));
  return envelope;
}

async function deriveKey(passphrase, salt, iterations, usages) {
  const subtle = requireSubtle();
  const material = await subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    usages
  );
}

function canonicalAad(source) {
  return JSON.stringify({
    schema: source.schema,
    appId: source.appId,
    packId: source.packId,
    contentVersion: source.contentVersion,
    label: source.label,
    classification: source.classification,
    topicCount: source.topicCount,
    createdAt: source.createdAt,
    kdf: {
      name: source.kdf.name,
      hash: source.kdf.hash,
      iterations: source.kdf.iterations,
      salt: source.kdf.salt
    },
    cipher: {
      name: source.cipher.name,
      tagLength: source.cipher.tagLength,
      iv: source.cipher.iv
    }
  });
}

export async function sha256Hex(bytes) {
  const subtle = requireSubtle();
  const data = bytes instanceof Uint8Array ? bytes : encoder.encode(String(bytes));
  const hash = new Uint8Array(await subtle.digest('SHA-256', data));
  return Array.from(hash, b => b.toString(16).padStart(2, '0')).join('');
}

function requireSubtle() {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto API není na tomto zařízení dostupné.');
  return globalThis.crypto.subtle;
}

function requirePassphrase(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 10) throw new Error('Heslo Content Packu musí mít alespoň 10 znaků.');
}

function randomBytes(length) {
  if (!globalThis.crypto?.getRandomValues) throw new Error('Kryptografický generátor náhodných čísel není dostupný.');
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

function bytesToBase64(bytes) {
  if (typeof btoa === 'function') {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(value) {
  try {
    if (typeof atob === 'function') {
      const binary = atob(value);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(value, 'base64'));
  } catch {
    throw new Error('Neplatné base64 kódování Content Packu.');
  }
}

function isBase64Bytes(value, expectedLength) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  try { return base64ToBytes(value).byteLength === expectedLength; } catch { return false; }
}

function timingSafeTextEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
