export const REVIEW_STATUSES = ['approved', 'edited', 'rejected'];
export const REVIEW_PRIORITIES = ['HIGH', 'NORMAL'];
export const REVIEW_NOTE_MAX = 800;
export const REVIEW_GUIDANCE_MAX_ITEMS = 30;
export const REVIEW_GUIDANCE_ITEM_MAX = 5000;
export const REVIEW_FOLLOWUP_MAX = 5000;

export function collectReviewItems(topics) {
  const items = [];
  for (const topic of Array.isArray(topics) ? topics : []) {
    const topicId = Number(topic?.id ?? topic?.number);
    if (!Number.isFinite(topicId)) continue;
    const topicTitle = String(topic?.title || `Téma ${topicId}`);
    const taskSteps = topic?.practice?.task?.steps;
    if (Array.isArray(taskSteps)) {
      taskSteps.forEach((step, index) => {
        if (!reviewable(step)) return;
        items.push(makeItem({
          id: reviewItemIdForTask(topicId, index),
          topicId,
          topicTitle,
          kind: 'task',
          contextLabel: topic?.practice?.task?.title || 'Practice Task',
          position: index + 1,
          locator: { topicId, kind: 'task', stepIndex: index },
          node: step
        }));
      });
    }
    const sections = topic?.practice?.sections;
    if (Array.isArray(sections)) {
      sections.forEach((section, sectionIndex) => {
        const sectionId = String(section?.id || `section-${sectionIndex + 1}`);
        const sectionLabel = String(section?.label || section?.shortLabel || `Podtéma ${sectionIndex + 1}`);
        const questions = section?.questions;
        if (!Array.isArray(questions)) return;
        questions.forEach((question, questionIndex) => {
          if (!reviewable(question)) return;
          items.push(makeItem({
            id: reviewItemIdForQuestion(topicId, sectionId, questionIndex),
            topicId,
            topicTitle,
            kind: 'question',
            contextLabel: sectionLabel,
            position: questionIndex + 1,
            locator: { topicId, kind: 'question', sectionId, questionIndex },
            node: question
          }));
        });
      });
    }
  }
  return items;
}

export function reviewItemIdForTask(topicId, stepIndex) {
  return `t${Number(topicId)}:task:${Number(stepIndex) + 1}`;
}

export function reviewItemIdForQuestion(topicId, sectionId, questionIndex) {
  return `t${Number(topicId)}:section:${encodeId(sectionId)}:q:${Number(questionIndex) + 1}`;
}

export function canonicalOriginal(item) {
  return JSON.stringify({
    id: String(item?.id || ''),
    locator: item?.locator || null,
    prompt: String(item?.prompt || ''),
    guidance: normalizeGuidance(item?.originalGuidance),
    followUp: String(item?.originalFollowUp || ''),
    priority: normalizePriority(item?.priority),
    basis: item?.basis ?? null
  });
}

export function normalizeReviewRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const status = REVIEW_STATUSES.includes(String(value.status)) ? String(value.status) : '';
  if (!status) return null;
  const itemId = String(value.itemId || '').trim();
  if (!itemId || itemId.length > 300) return null;
  const guidance = status === 'edited' ? normalizeGuidance(value.guidance) : undefined;
  if (status === 'edited' && guidance.length === 0) return null;
  const followUp = status === 'edited' ? normalizeFollowUp(value.followUp) : undefined;
  const note = normalizeNote(value.note);
  const updatedAt = validIso(value.updatedAt) ? String(value.updatedAt) : new Date().toISOString();
  return {
    itemId,
    status,
    ...(status === 'edited' ? { guidance, followUp } : {}),
    ...(note ? { note } : {}),
    updatedAt
  };
}

export function reviewRecordMap(records) {
  const map = new Map();
  for (const raw of records instanceof Map ? records.values() : (Array.isArray(records) ? records : [])) {
    const record = normalizeReviewRecord(raw);
    if (record) map.set(record.itemId, record);
  }
  return map;
}

export function summarizeReview(items, records) {
  const map = records instanceof Map ? records : reviewRecordMap(records);
  const summary = {
    total: 0,
    pending: 0,
    approved: 0,
    edited: 0,
    rejected: 0,
    reviewed: 0,
    highTotal: 0,
    highPending: 0,
    normalTotal: 0,
    normalPending: 0,
    byTopic: {}
  };
  for (const item of Array.isArray(items) ? items : []) {
    summary.total += 1;
    const priority = normalizePriority(item.priority);
    if (priority === 'HIGH') summary.highTotal += 1;
    else summary.normalTotal += 1;
    const record = map.get(item.id);
    const status = record?.status || 'pending';
    if (status === 'pending') {
      summary.pending += 1;
      if (priority === 'HIGH') summary.highPending += 1;
      else summary.normalPending += 1;
    } else {
      summary.reviewed += 1;
      summary[status] += 1;
    }
    const topicKey = String(item.topicId);
    const topic = summary.byTopic[topicKey] || { total: 0, pending: 0, approved: 0, edited: 0, rejected: 0, reviewed: 0 };
    topic.total += 1;
    if (status === 'pending') topic.pending += 1;
    else { topic.reviewed += 1; topic[status] += 1; }
    summary.byTopic[topicKey] = topic;
  }
  summary.complete = summary.total > 0 && summary.pending === 0 && summary.rejected === 0;
  return summary;
}

export function filterReviewItems(items, records, filters = {}) {
  const map = records instanceof Map ? records : reviewRecordMap(records);
  const topic = String(filters.topic ?? 'all');
  const priority = String(filters.priority || 'all');
  const status = String(filters.status || 'pending');
  const kind = String(filters.kind || 'all');
  const query = String(filters.query || '').trim().toLocaleLowerCase('cs-CZ');
  const filtered = (Array.isArray(items) ? items : []).filter(item => {
    if (topic !== 'all' && String(item.topicId) !== topic) return false;
    if (priority !== 'all' && item.priority !== priority) return false;
    if (kind !== 'all' && item.kind !== kind) return false;
    const itemStatus = map.get(item.id)?.status || 'pending';
    if (status === 'reviewed' && itemStatus === 'pending') return false;
    if (status !== 'all' && status !== 'reviewed' && itemStatus !== status) return false;
    if (query) {
      const haystack = `${item.topicTitle} ${item.contextLabel} ${item.prompt}`.toLocaleLowerCase('cs-CZ');
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
  return filtered.sort((a, b) => {
    const pa = a.priority === 'HIGH' ? 0 : 1;
    const pb = b.priority === 'HIGH' ? 0 : 1;
    if (pa !== pb) return pa - pb;
    if (a.topicId !== b.topicId) return a.topicId - b.topicId;
    if (a.kind !== b.kind) return a.kind === 'task' ? -1 : 1;
    return a.position - b.position;
  });
}

export function effectiveGuidance(item, record) {
  const normalized = normalizeReviewRecord(record);
  if (!normalized) return {
    status: 'pending',
    guidance: normalizeGuidance(item?.originalGuidance),
    followUp: normalizeFollowUp(item?.originalFollowUp),
    note: ''
  };
  if (normalized.status === 'edited') return {
    status: 'edited',
    guidance: normalizeGuidance(normalized.guidance),
    followUp: normalizeFollowUp(normalized.followUp),
    note: normalizeNote(normalized.note)
  };
  if (normalized.status === 'rejected') return { status: 'rejected', guidance: [], followUp: '', note: normalizeNote(normalized.note) };
  return {
    status: 'approved',
    guidance: normalizeGuidance(item?.originalGuidance),
    followUp: normalizeFollowUp(item?.originalFollowUp),
    note: normalizeNote(normalized.note)
  };
}

export function locateReviewNode(topics, locator) {
  const topic = (Array.isArray(topics) ? topics : []).find(item => Number(item?.id ?? item?.number) === Number(locator?.topicId));
  if (!topic) return null;
  if (locator?.kind === 'task') return topic?.practice?.task?.steps?.[Number(locator.stepIndex)] || null;
  if (locator?.kind === 'question') {
    const section = topic?.practice?.sections?.find(item => String(item?.id) === String(locator.sectionId));
    return section?.questions?.[Number(locator.questionIndex)] || null;
  }
  return null;
}

function makeItem({ id, topicId, topicTitle, kind, contextLabel, position, locator, node }) {
  return {
    id,
    topicId,
    topicTitle,
    kind,
    contextLabel: String(contextLabel || ''),
    position,
    locator,
    prompt: String(node?.prompt || ''),
    originalGuidance: normalizeGuidance(node?.guidance),
    originalFollowUp: normalizeFollowUp(node?.followUp),
    priority: normalizePriority(node?.guidanceMeta?.reviewPriority),
    basis: node?.guidanceMeta?.basis ?? null,
    matchScore: Number.isFinite(Number(node?.guidanceMeta?.matchScore)) ? Number(node.guidanceMeta.matchScore) : null,
    matchMargin: Number.isFinite(Number(node?.guidanceMeta?.matchMargin)) ? Number(node.guidanceMeta.matchMargin) : null,
    sourceMatches: Array.isArray(node?.guidanceMeta?.sourceMatches) ? node.guidanceMeta.sourceMatches : []
  };
}

function reviewable(node) {
  return Boolean(node && typeof node === 'object' && String(node.prompt || '').trim());
}

function normalizePriority(value) {
  return REVIEW_PRIORITIES.includes(String(value)) ? String(value) : 'NORMAL';
}

function normalizeGuidance(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => String(item ?? '').trim())
    .filter(Boolean)
    .slice(0, REVIEW_GUIDANCE_MAX_ITEMS)
    .map(item => item.slice(0, REVIEW_GUIDANCE_ITEM_MAX));
}

function normalizeFollowUp(value) {
  return String(value || '').trim().slice(0, REVIEW_FOLLOWUP_MAX);
}

function normalizeNote(value) {
  return String(value || '').trim().slice(0, REVIEW_NOTE_MAX);
}

function encodeId(value) {
  return encodeURIComponent(String(value || '').trim()).replace(/%/g, '_');
}

function validIso(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  return Number.isFinite(Date.parse(value));
}
