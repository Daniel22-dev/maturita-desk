import { normalizeReviewRecord } from './review-model.js';

const DB_NAME = 'ghrab.maturita-desk.pedagogical-review.v1';
const DB_VERSION = 1;
const RECORD_STORE = 'records';

export function isReviewStoreAvailable() {
  return typeof indexedDB !== 'undefined';
}

export async function loadReviewRecords(packId, contentVersion) {
  requirePackRef(packId, contentVersion);
  const db = await openDb();
  const prefix = recordPrefix(packId, contentVersion);
  const all = await requestValue(db.transaction(RECORD_STORE, 'readonly').objectStore(RECORD_STORE).getAll());
  db.close();
  return (Array.isArray(all) ? all : [])
    .filter(row => String(row?.key || '').startsWith(prefix))
    .map(row => normalizeReviewRecord(row?.record))
    .filter(Boolean);
}

export async function saveReviewRecord(packId, contentVersion, rawRecord) {
  requirePackRef(packId, contentVersion);
  const record = normalizeReviewRecord(rawRecord);
  if (!record) throw new Error('Revizní záznam není platný.');
  const db = await openDb();
  const tx = db.transaction(RECORD_STORE, 'readwrite');
  tx.objectStore(RECORD_STORE).put({
    key: recordKey(packId, contentVersion, record.itemId),
    packId,
    contentVersion,
    itemId: record.itemId,
    record
  });
  await transactionDone(tx);
  db.close();
  return record;
}

export async function deleteReviewRecord(packId, contentVersion, itemId) {
  requirePackRef(packId, contentVersion);
  const db = await openDb();
  const tx = db.transaction(RECORD_STORE, 'readwrite');
  tx.objectStore(RECORD_STORE).delete(recordKey(packId, contentVersion, itemId));
  await transactionDone(tx);
  db.close();
  return true;
}

export async function clearReviewRecords(packId, contentVersion) {
  requirePackRef(packId, contentVersion);
  const db = await openDb();
  const store = db.transaction(RECORD_STORE, 'readonly').objectStore(RECORD_STORE);
  const all = await requestValue(store.getAllKeys());
  db.close();
  const prefix = recordPrefix(packId, contentVersion);
  const keys = (Array.isArray(all) ? all : []).filter(key => String(key).startsWith(prefix));
  if (!keys.length) return 0;
  const db2 = await openDb();
  const tx = db2.transaction(RECORD_STORE, 'readwrite');
  for (const key of keys) tx.objectStore(RECORD_STORE).delete(key);
  await transactionDone(tx);
  db2.close();
  return keys.length;
}

export async function importReviewRecords(packId, contentVersion, records) {
  requirePackRef(packId, contentVersion);
  const normalized = (Array.isArray(records) ? records : []).map(normalizeReviewRecord).filter(Boolean);
  const existing = new Map((await loadReviewRecords(packId, contentVersion)).map(record => [record.itemId, record]));
  let imported = 0;
  let skippedOlder = 0;
  const db = await openDb();
  const tx = db.transaction(RECORD_STORE, 'readwrite');
  const store = tx.objectStore(RECORD_STORE);
  for (const record of normalized) {
    const current = existing.get(record.itemId);
    if (current && Date.parse(current.updatedAt || 0) > Date.parse(record.updatedAt || 0)) {
      skippedOlder += 1;
      continue;
    }
    store.put({
      key: recordKey(packId, contentVersion, record.itemId),
      packId,
      contentVersion,
      itemId: record.itemId,
      record
    });
    imported += 1;
  }
  await transactionDone(tx);
  db.close();
  return { imported, skippedOlder };
}

function openDb() {
  if (!isReviewStoreAvailable()) return Promise.reject(new Error('IndexedDB není na tomto zařízení dostupné.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECORD_STORE)) db.createObjectStore(RECORD_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Revizní úložiště nelze otevřít.'));
    request.onblocked = () => reject(new Error('Revizní úložiště je blokované jinou verzí aplikace.'));
  });
}

function recordPrefix(packId, contentVersion) {
  return `${encodeURIComponent(packId)}::${encodeURIComponent(contentVersion)}::`;
}

function recordKey(packId, contentVersion, itemId) {
  return `${recordPrefix(packId, contentVersion)}${encodeURIComponent(itemId)}`;
}

function requirePackRef(packId, contentVersion) {
  if (!String(packId || '').trim() || !String(contentVersion || '').trim()) throw new Error('Chybí identita Content Packu pro revizi.');
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Operace revizního úložiště selhala.'));
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Revizní transakce selhala.'));
    tx.onabort = () => reject(tx.error || new Error('Revizní transakce byla přerušena.'));
  });
}
