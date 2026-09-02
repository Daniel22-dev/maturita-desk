import { readTextLimited } from '../net/read-limited.js';
import { MAX_ENVELOPE_BYTES, parseEnvelopeText, safeEnvelopeMeta, validateEnvelopeShape, verifyEnvelopePublisherSignature } from '../content-pack.js';

export const CONTENT_DELIVERY_SCHEMA = 'maturita-desk-content-delivery-v1';

export function createLocalEncryptedContentProvider(store, config = {}) {
  if (!store) throw new Error('Local Content Provider vyžaduje protected store.');
  const policy = normalizeContentPolicy(config);
  return Object.freeze({
    kind: 'encrypted-local',
    remote: false,
    allowManualImport: true,
    confidentialAllowed: policy.confidentialAllowed,
    async initialize() { return store.getActivePackMeta(); },
    async loadEnvelope() {
      const envelope = await store.loadActiveEnvelope();
      if (!envelope) return null;
      await assertEnvelopeAllowed(envelope, policy);
      return envelope;
    },
    async importText(text) {
      const envelope = await parseEnvelopeText(text);
      await assertEnvelopeAllowed(envelope, policy);
      await store.saveEncryptedPack(envelope);
      return safeEnvelopeMeta(envelope);
    },
    async remove() { return store.removeActivePack(); },
    async sync() { throw new Error('Lokální Content Provider nemá serverový zdroj.'); }
  });
}

export function createLockedContentProvider(reason = 'Runtime konfigurace je uzamčená.') {
  const fail = async () => { throw new Error(String(reason || 'Runtime konfigurace je uzamčená.')); };
  return Object.freeze({
    kind: 'locked', remote: false, allowManualImport: false, confidentialAllowed: false,
    async initialize() { return null; },
    loadEnvelope: fail, importText: fail, remove: fail, sync: fail
  });
}

export function createSchoolServerContentProvider(config, store, {
  fetchImpl = globalThis.fetch,
  authSnapshot = () => null
} = {}) {
  if (!config?.activePackEndpoint || !store || typeof fetchImpl !== 'function') return null;
  const policy = normalizeContentPolicy(config);
  return Object.freeze({
    kind: 'school-server-encrypted-pack',
    remote: true,
    allowManualImport: config.allowManualImport === true,
    confidentialAllowed: policy.confidentialAllowed,
    async initialize() { return store.getActivePackMeta(); },
    async loadEnvelope() {
      const envelope = await store.loadActiveEnvelope();
      if (!envelope) return null;
      await assertEnvelopeAllowed(envelope, policy);
      return envelope;
    },
    async importText(text) {
      if (!config.allowManualImport) throw new Error('Ruční import je v režimu školního serveru vypnutý.');
      const envelope = await parseEnvelopeText(text);
      await assertEnvelopeAllowed(envelope, policy);
      await store.saveEncryptedPack(envelope);
      return safeEnvelopeMeta(envelope);
    },
    async remove() { return store.removeActivePack(); },
    async sync() {
      const auth = authSnapshot();
      if (!auth?.authenticated || !auth.capabilities?.includes('content:download')) throw new Error('Školní účet nemá oprávnění stáhnout maturitní Content Pack.');
      const response = await fetchImpl(config.activePackEndpoint, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        redirect: 'error',
        headers: { 'Accept': 'application/json', 'X-Maturita-Desk-Client': 'content-v1' }
      });
      if (!response.ok) throw new Error(serverMessage(response.status));
      const data = await readJsonLimited(response, MAX_ENVELOPE_BYTES + 1024 * 1024);
      const envelope = extractDeliveryEnvelope(data);
      const check = validateEnvelopeShape(envelope);
      if (!check.ok) throw new Error(`Školní server vrátil neplatný šifrovaný Content Pack: ${check.errors[0] || 'neznámá chyba'}`);
      await assertEnvelopeAllowed(envelope, policy);
      await store.saveEncryptedPack(envelope);
      return safeEnvelopeMeta(envelope);
    }
  });
}

export function extractDeliveryEnvelope(value) {
  if (!value || typeof value !== 'object') throw new Error('Content delivery odpověď není objekt.');
  if (value.schema === CONTENT_DELIVERY_SCHEMA) {
    if (!value.envelope || typeof value.envelope !== 'object') throw new Error('Content delivery odpověď neobsahuje šifrovaný envelope.');
    return value.envelope;
  }
  if (value.schema === 'maturita-desk-encrypted-pack-v1') return value;
  throw new Error('Nepodporovaný Content delivery kontrakt.');
}

async function assertEnvelopeAllowed(envelope, policy) {
  if (envelope.classification === 'CONFIDENTIAL-EXAM' && !policy.confidentialAllowed) {
    throw new Error('Ostrý CONFIDENTIAL-EXAM Content Pack je povolen pouze na schváleném izolovaném produkčním originu.');
  }
  await verifyEnvelopePublisherSignature(envelope, policy.publisherKeys, policy.requirePublisherSignatureFor);
}

function normalizeContentPolicy(config) {
  return Object.freeze({
    confidentialAllowed: config?.confidentialAllowed === true,
    publisherKeys: config?.publisherKeys && typeof config.publisherKeys === 'object' ? config.publisherKeys : {},
    requirePublisherSignatureFor: Array.isArray(config?.requirePublisherSignatureFor) ? [...config.requirePublisherSignatureFor] : ['CONFIDENTIAL-EXAM']
  });
}

function serverMessage(status) {
  if (status === 401) return 'Školní relace vypršela. Přihlaste se znovu.';
  if (status === 403) return 'Školní účet nemá oprávnění k maturitnímu Content Packu.';
  if (status === 404) return 'Školní server nemá aktivní Content Pack.';
  if (status >= 500) return 'Školní server je dočasně nedostupný.';
  return `Stažení Content Packu selhalo (HTTP ${status}).`;
}

async function readJsonLimited(response, maxBytes) {
  let text;
  try { text = await readTextLimited(response, maxBytes, { message: 'Školní Content delivery odpověď je příliš velká nebo ji nelze bezpečně přečíst.' }); }
  catch { throw new Error('Školní Content delivery odpověď je příliš velká nebo ji nelze bezpečně přečíst.'); }
  try { return JSON.parse(text); } catch { throw new Error('Školní Content delivery odpověď není platný JSON.'); }
}
