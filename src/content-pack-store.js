import { safeEnvelopeMeta, validateEnvelopeShape } from './content-pack.js';

const DB_NAME = 'ghrab.maturita-desk.protected-content.v1';
const DB_VERSION = 1;
const PACK_STORE = 'packs';
const SETTINGS_STORE = 'settings';
const ACTIVE_KEY = 'activePackId';

export function isProtectedStoreAvailable() {
  return typeof indexedDB !== 'undefined';
}

export async function saveEncryptedPack(envelope) {
  const check = validateEnvelopeShape(envelope);
  if (!check.ok) throw new Error(check.errors.join(' '));
  const db = await openDb();
  const meta = safeEnvelopeMeta(envelope);
  const tx = db.transaction([PACK_STORE, SETTINGS_STORE], 'readwrite');
  tx.objectStore(PACK_STORE).put({ packId: envelope.packId, envelope, meta, addedAt: new Date().toISOString() });
  tx.objectStore(SETTINGS_STORE).put({ key: ACTIVE_KEY, value: envelope.packId });
  await transactionDone(tx);
  db.close();
  return meta;
}

export async function getActivePackMeta() {
  const db = await openDb();
  const active = await requestValue(db.transaction(SETTINGS_STORE, 'readonly').objectStore(SETTINGS_STORE).get(ACTIVE_KEY));
  if (!active?.value) { db.close(); return null; }
  const record = await requestValue(db.transaction(PACK_STORE, 'readonly').objectStore(PACK_STORE).get(active.value));
  db.close();
  return record?.meta || null;
}

export async function loadActiveEnvelope() {
  const db = await openDb();
  const active = await requestValue(db.transaction(SETTINGS_STORE, 'readonly').objectStore(SETTINGS_STORE).get(ACTIVE_KEY));
  if (!active?.value) { db.close(); return null; }
  const record = await requestValue(db.transaction(PACK_STORE, 'readonly').objectStore(PACK_STORE).get(active.value));
  db.close();
  return record?.envelope || null;
}

export async function removeActivePack() {
  const db = await openDb();
  const active = await requestValue(db.transaction(SETTINGS_STORE, 'readonly').objectStore(SETTINGS_STORE).get(ACTIVE_KEY));
  if (!active?.value) { db.close(); return false; }
  const tx = db.transaction([PACK_STORE, SETTINGS_STORE], 'readwrite');
  tx.objectStore(PACK_STORE).delete(active.value);
  tx.objectStore(SETTINGS_STORE).delete(ACTIVE_KEY);
  await transactionDone(tx);
  db.close();
  return true;
}

function openDb() {
  if (!isProtectedStoreAvailable()) return Promise.reject(new Error('IndexedDB není na tomto zařízení dostupné.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PACK_STORE)) db.createObjectStore(PACK_STORE, { keyPath: 'packId' });
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Protected Content Store nelze otevřít.'));
    request.onblocked = () => reject(new Error('Protected Content Store je blokovaný jinou verzí aplikace.'));
  });
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB operace selhala.'));
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transakce selhala.'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transakce byla přerušena.'));
  });
}
