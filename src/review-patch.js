import { canonicalOriginal, collectReviewItems, locateReviewNode, normalizeReviewRecord, reviewRecordMap, summarizeReview } from './review-model.js';

export const REVIEW_PATCH_SCHEMA = 'maturita-desk-review-patch-v1';
export const REVIEW_PATCH_MAX_BYTES = 4 * 1024 * 1024;
const encoder = new TextEncoder();

export async function createReviewPatch(pack, rawRecords, appVersion = '') {
  const packRef = requirePack(pack);
  const items = collectReviewItems(pack.topics);
  const records = reviewRecordMap(rawRecords);
  const out = [];
  for (const item of items) {
    const record = records.get(item.id);
    if (!record) continue;
    out.push({
      itemId: item.id,
      locator: item.locator,
      status: record.status,
      originalSha256: await sha256Hex(canonicalOriginal(item)),
      priority: item.priority,
      ...(record.status === 'edited' ? { guidance: record.guidance, followUp: record.followUp || '' } : {}),
      ...(record.note ? { note: record.note } : {}),
      updatedAt: record.updatedAt
    });
  }
  const summary = summarizeReview(items, records);
  return {
    schema: REVIEW_PATCH_SCHEMA,
    appId: 'maturita-desk',
    appVersion: String(appVersion || ''),
    packId: packRef.packId,
    contentVersion: packRef.version,
    createdAt: new Date().toISOString(),
    classification: 'INTERNAL-REVIEW',
    containsExamPrompts: false,
    totalReviewableItems: summary.total,
    summary: {
      reviewed: summary.reviewed,
      pending: summary.pending,
      approved: summary.approved,
      edited: summary.edited,
      rejected: summary.rejected,
      complete: summary.complete
    },
    records: out
  };
}

export async function parseReviewPatchText(text, pack = null) {
  const rawText = String(text || '');
  const bytes = encoder.encode(rawText).byteLength;
  if (bytes <= 2 || bytes > REVIEW_PATCH_MAX_BYTES) throw new Error('Revizní patch má neplatnou velikost.');
  let patch;
  try { patch = JSON.parse(rawText); }
  catch { throw new Error('Soubor není platný JSON revizní patch.'); }
  validatePatchShape(patch);
  if (pack) await verifyReviewPatch(pack, patch);
  return patch;
}

export async function verifyReviewPatch(pack, patch) {
  validatePatchShape(patch);
  const packRef = requirePack(pack);
  if (patch.packId !== packRef.packId || patch.contentVersion !== packRef.version) throw new Error('Revizní patch patří k jinému Content Packu nebo verzi.');
  const items = collectReviewItems(pack.topics);
  const itemMap = new Map(items.map(item => [item.id, item]));
  const seen = new Set();
  for (const record of patch.records) {
    if (seen.has(record.itemId)) throw new Error(`Revizní patch obsahuje duplicitní položku ${record.itemId}.`);
    seen.add(record.itemId);
    const item = itemMap.get(record.itemId);
    if (!item) throw new Error(`Revizní položka ${record.itemId} v aktuálním Content Packu neexistuje.`);
    const expected = await sha256Hex(canonicalOriginal(item));
    if (expected !== String(record.originalSha256 || '').toLowerCase()) throw new Error(`Zdroj revizní položky ${record.itemId} se od exportu změnil.`);
    if (!sameLocator(item.locator, record.locator)) throw new Error(`Revizní položka ${record.itemId} má nekonzistentní locator.`);
  }
  const computed = summarizeReview(items, patch.records);
  if (Number(patch.totalReviewableItems) !== computed.total) throw new Error('Revizní patch uvádí neplatný celkový počet položek.');
  const declared = patch.summary || {};
  for (const key of ['reviewed', 'pending', 'approved', 'edited', 'rejected']) {
    if (Number(declared[key]) !== Number(computed[key])) throw new Error(`Revizní patch má nekonzistentní souhrn (${key}).`);
  }
  if (Boolean(declared.complete) !== Boolean(computed.complete)) throw new Error('Revizní patch má nekonzistentní stav dokončení.');
  return true;
}

export async function applyReviewPatchToPack(pack, patch) {
  await verifyReviewPatch(pack, patch);
  const clone = structuredCloneSafe(pack);
  const items = collectReviewItems(clone.topics);
  const itemMap = new Map(items.map(item => [item.id, item]));
  for (const raw of patch.records) {
    const normalized = normalizeReviewRecord({
      itemId: raw.itemId,
      status: raw.status,
      guidance: raw.guidance,
      followUp: raw.followUp,
      note: raw.note,
      updatedAt: raw.updatedAt
    });
    if (!normalized) throw new Error(`Revizní záznam ${raw.itemId} není platný.`);
    const item = itemMap.get(raw.itemId);
    const node = locateReviewNode(clone.topics, item.locator);
    if (!node) throw new Error(`Revizní záznam ${raw.itemId} nelze aplikovat.`);
    node.guidanceMeta = { ...(node.guidanceMeta || {}) };
    if (normalized.status === 'approved') {
      node.guidanceMeta.humanReview = 'APPROVED';
    } else if (normalized.status === 'edited') {
      node.guidance = normalized.guidance;
      node.followUp = normalized.followUp || '';
      node.guidanceMeta.humanReview = 'EDITED_APPROVED';
    } else {
      node.guidanceMeta.humanReview = 'REJECTED_REQUIRES_REPLACEMENT';
    }
    node.guidanceMeta.reviewedAt = normalized.updatedAt;
    delete node.guidanceMeta.status;
  }
  const summary = patch.summary || {};
  clone.metadata = { ...(clone.metadata || {}) };
  clone.metadata.pedagogicalReview = {
    schema: REVIEW_PATCH_SCHEMA,
    appliedAt: new Date().toISOString(),
    reviewed: Number(summary.reviewed || 0),
    pending: Number(summary.pending || 0),
    approved: Number(summary.approved || 0),
    edited: Number(summary.edited || 0),
    rejected: Number(summary.rejected || 0),
    complete: Boolean(summary.complete)
  };
  clone.metadata.guidanceReviewStatus = summary.complete
    ? 'Human pedagogical review completed; all reviewable Practice guidance items approved or edited.'
    : 'Human pedagogical review partially applied; unresolved or rejected items remain.';
  clone.metadata.candidateStatus = summary.complete ? 'PEDAGOGICALLY-REVIEWED-CANDIDATE' : 'PARTIAL-PEDAGOGICAL-REVIEW';
  if (summary.complete) {
    for (const topic of clone.topics || []) {
      topic.contentStatus = { ...(topic.contentStatus || {}), practiceGuidance: 'HUMAN_PEDAGOGICALLY_REVIEWED' };
    }
  }
  return clone;
}

function validatePatchShape(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Revizní patch nemá platný obal.');
  if (patch.schema !== REVIEW_PATCH_SCHEMA || patch.appId !== 'maturita-desk') throw new Error('Nepodporovaný formát revizního patche.');
  if (!String(patch.packId || '').trim() || !String(patch.contentVersion || '').trim()) throw new Error('Revizní patch nemá identitu Content Packu.');
  if (!Array.isArray(patch.records) || patch.records.length > 5000) throw new Error('Revizní patch má neplatné záznamy.');
  for (const record of patch.records) {
    if (!record || typeof record !== 'object' || !String(record.itemId || '').trim()) throw new Error('Revizní patch obsahuje neplatný záznam.');
    if (!['approved', 'edited', 'rejected'].includes(String(record.status))) throw new Error(`Revizní položka ${record.itemId} má neplatný stav.`);
    if (!/^[a-f0-9]{64}$/i.test(String(record.originalSha256 || ''))) throw new Error(`Revizní položka ${record.itemId} nemá platný fingerprint.`);
    if (record.status === 'edited') {
      const normalized = normalizeReviewRecord(record);
      if (!normalized) throw new Error(`Upravená revizní položka ${record.itemId} není platná.`);
    }
  }
  return true;
}

function requirePack(pack) {
  const manifest = pack?.manifest;
  if (!manifest || !String(manifest.packId || '').trim() || !String(manifest.version || '').trim() || !Array.isArray(pack?.topics)) throw new Error('Content Pack není vhodný pro revizi.');
  return { packId: String(manifest.packId), version: String(manifest.version) };
}

function sameLocator(a, b) {
  return JSON.stringify(a || null) === JSON.stringify(b || null);
}

async function sha256Hex(value) {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto API není dostupné.');
  const hash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(String(value))));
  return Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
