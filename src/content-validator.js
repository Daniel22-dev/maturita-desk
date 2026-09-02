const MAX_TEXT = 12000;
const MAX_BLOCKS = 80;
const MAX_STEPS = 40;
const MAX_SECTIONS = 24;
const MAX_QUESTIONS = 80;
const MAX_IMAGE_SOURCE = 24 * 1024 * 1024;
const SAFE_IMAGE_DATA = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const SAFE_LOCAL_DEMO = /^\.\/assets\/demo\/[A-Za-z0-9._/-]+$/;
const NEW_BLOCK_KINDS = new Set(['text', 'quote', 'table', 'bullet']);
const LEGACY_BLOCK_TYPES = new Set(['paragraph', 'quote', 'list', 'cards', 'table']);

export function validateTopic(topic, mode = 'exam') {
  const errors = [];
  const warnings = [];
  if (!topic || typeof topic !== 'object') return result(['Téma není datový objekt.'], warnings);
  const numericId = topic.id;
  if (typeof numericId !== 'number' || !Number.isInteger(numericId) || numericId < 1 || numericId > 20) errors.push('Chybí platné číselné ID tématu 1–20.');
  if (topic.number !== undefined && String(topic.number) !== String(numericId).padStart(2, '0')) errors.push('Zobrazené číslo tématu neodpovídá jeho ID.');
  if (!validText(topic.title, 200)) errors.push('Chybí název tématu nebo je příliš dlouhý.');

  if (mode === 'exam') validateExam(topic.exam, errors, warnings);
  if (mode === 'practice') validatePractice(topic.practice, errors, warnings);
  return result(errors, warnings);
}

export function validateTopicCollection(topics) {
  const errors = [];
  const warnings = [];
  const seen = new Set();
  if (!Array.isArray(topics) || topics.length !== 20) {
    errors.push(`Očekáváno 20 témat, nalezeno ${Array.isArray(topics) ? topics.length : 0}.`);
  }
  for (const topic of Array.isArray(topics) ? topics : []) {
    const id = topic?.id;
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || id > 20) errors.push(`Neplatné ID tématu ${String(topic?.id ?? '')}.`);
    if (seen.has(id)) errors.push(`Duplicitní ID tématu ${id}.`);
    seen.add(id);
    for (const mode of ['exam', 'practice']) {
      const check = validateTopic(topic, mode);
      errors.push(...check.errors.map(item => `Téma ${String(id).padStart(2, '0')} / ${mode}: ${item}`));
      warnings.push(...check.warnings.map(item => `Téma ${String(id).padStart(2, '0')} / ${mode}: ${item}`));
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

function validateExam(exam, errors, warnings) {
  if (!exam || typeof exam !== 'object') {
    errors.push('Chybí Exam data.');
    return;
  }
  const pictures = exam.pictures;
  if (!pictures || typeof pictures !== 'object') {
    errors.push('Chybí Picture Comparison.');
  } else {
    const images = pictures.images;
    if (!Array.isArray(images) || images.length !== 2) {
      errors.push('Picture Comparison musí obsahovat právě dva obrázky.');
    } else {
      images.forEach((image, index) => validateImage(image, errors, warnings, `Picture Comparison obrázek ${index + 1}`));
    }
    const target = pictures.targetQuestion ?? pictures.intro;
    validateOptionalText(target, errors, 'Picture Comparison: cílová otázka', 3000);
    if (!String(target || '').trim()) warnings.push('Picture Comparison nemá cílovou otázku.');
    validateOptionalText(pictures.instruction, errors, 'Picture Comparison: instrukce', 3000);
    validateOptionalText(pictures.teacherPrompt, errors, 'Picture Comparison: učitelský prompt', 4000);
    validateStringArray(pictures.guidePoints, errors, 'Picture Comparison: vodítka', { optional: true, maxItems: 30, maxText: 1600 });
    if (pictures.support !== undefined) {
      if (!Array.isArray(pictures.support)) errors.push('Picture Comparison support musí být pole.');
      else if (pictures.support.length > 30) errors.push('Picture Comparison support obsahuje příliš mnoho položek.');
      else pictures.support.forEach((item, index) => {
        if (!item || typeof item !== 'object') {
          errors.push(`Picture Comparison support ${index + 1} není objekt.`);
          return;
        }
        if (!validText(item.label, 1200)) errors.push(`Picture Comparison support ${index + 1} nemá platný popisek.`);
        validateOptionalText(item.detail, errors, `Picture Comparison support ${index + 1}: detail`, 3000);
      });
    }
  }

  validateTask(exam.task, errors, warnings, 'Exam Task Box', false);
  validateSections(exam.topic?.sections, errors, warnings, 'Exam Topic', false);
  const refs = exam.topic?.referenceImages;
  if (refs !== undefined) {
    if (!Array.isArray(refs)) errors.push('Exam Topic referenceImages musí být pole.');
    else if (refs.length > 30) errors.push('Exam Topic obsahuje příliš mnoho doplňkových obrázků.');
    else refs.forEach((image, index) => validateImage(image, errors, warnings, `Doplňkový obrázek ${index + 1}`));
  }
}

function validatePractice(practice, errors, warnings) {
  if (!practice || typeof practice !== 'object') {
    errors.push('Chybí Practice data.');
    return;
  }
  validateTask(practice.task, errors, warnings, 'Practice Task Box', true);
  validateSections(practice.sections, errors, warnings, 'Practice Topic', true);
}

function validateImage(image, errors, warnings, label) {
  if (!image || typeof image !== 'object') {
    errors.push(`${label} není objekt.`);
    return;
  }
  const src = String(image.src || '').trim();
  if (!src) errors.push(`${label} nemá zdroj.`);
  else if (src.length > MAX_IMAGE_SOURCE) errors.push(`${label} překračuje maximální velikost zdroje.`);
  else if (!safeImageSource(src)) errors.push(`${label} používá nepovolený formát nebo cestu.`);
  if (!validText(String(image.alt || ''), 1000)) warnings.push(`${label} nemá alternativní popis.`);
  if (image.width !== undefined && (!Number.isFinite(Number(image.width)) || Number(image.width) <= 0)) errors.push(`${label} má neplatnou šířku.`);
  if (image.height !== undefined && (!Number.isFinite(Number(image.height)) || Number(image.height) <= 0)) errors.push(`${label} má neplatnou výšku.`);
  if (image.bytes !== undefined && (!Number.isFinite(Number(image.bytes)) || Number(image.bytes) <= 0)) errors.push(`${label} má neplatný počet bajtů.`);
  if (image.sha256 !== undefined && !/^[a-f0-9]{64}$/i.test(String(image.sha256))) errors.push(`${label} má neplatný SHA-256.`);
}

function validateTask(task, errors, warnings, label, practice) {
  if (!task || typeof task !== 'object') {
    errors.push(`${label}: chybí data.`);
    return;
  }
  if (!validText(task.title, 700)) errors.push(`${label}: chybí název nebo je příliš dlouhý.`);
  validateOptionalText(task.type, errors, `${label}: typ`, 500);
  validateOptionalText(task.scenario, errors, `${label}: scénář`, MAX_TEXT);
  validateOptionalText(task.intro, errors, `${label}: úvod`, MAX_TEXT);
  validateRichBlocks(task.blocks, errors, label);

  if (!Array.isArray(task.steps) || task.steps.length === 0) errors.push(`${label}: chybí kroky zadání.`);
  else if (task.steps.length > MAX_STEPS) errors.push(`${label}: příliš mnoho kroků (${task.steps.length}).`);
  else task.steps.forEach((step, index) => {
    const prefix = `${label}: krok ${index + 1}`;
    if (!validText(step?.prompt, MAX_TEXT)) errors.push(`${prefix} nemá zadání nebo je příliš dlouhý.`);
    validateStringArray(step?.substeps, errors, `${prefix}, dílčí kroky`, { optional: true, maxItems: 30, maxText: 4000 });
    validateStringArray(step?.guidance, errors, `${prefix}, nápověda`, { optional: true, maxItems: 30, maxText: 4000 });
    validateOptionalText(step?.followUp, errors, `${prefix}, follow-up`, 4000);
    validateGuidanceMeta(step?.guidanceMeta, errors, `${prefix}, metadata nápovědy`);
    if (practice && (!Array.isArray(step?.guidance) || step.guidance.length === 0)) warnings.push(`${prefix} nemá učitelskou nápovědu.`);
  });
}

function validateRichBlocks(blocks, errors, label) {
  if (blocks == null) return;
  if (!Array.isArray(blocks)) {
    errors.push(`${label}: rich blocks nejsou pole.`);
    return;
  }
  if (blocks.length > MAX_BLOCKS) {
    errors.push(`${label}: příliš mnoho rich blocks (${blocks.length}).`);
    return;
  }
  blocks.forEach((block, index) => {
    const prefix = `${label}: blok ${index + 1}`;
    if (!block || typeof block !== 'object') {
      errors.push(`${prefix} není objekt.`);
      return;
    }

    const kind = String(block.kind || '');
    const type = String(block.type || '');
    if (kind) {
      if (!NEW_BLOCK_KINDS.has(kind)) {
        errors.push(`${prefix} má nepodporovaný typ ${kind}.`);
        return;
      }
      if (kind === 'table') validateTableRows(block.rows, errors, prefix, true);
      else if (!validText(block.text, MAX_TEXT)) errors.push(`${prefix} nemá text nebo je příliš dlouhý.`);
      return;
    }

    if (!LEGACY_BLOCK_TYPES.has(type)) {
      errors.push(`${prefix} má nepodporovaný typ ${type || 'bez typu'}.`);
      return;
    }
    if (type === 'paragraph' || type === 'quote') {
      if (!validText(block.text, MAX_TEXT)) errors.push(`${prefix} nemá text nebo je příliš dlouhý.`);
      return;
    }
    if (type === 'list' || type === 'cards') {
      validateStringArray(block.items, errors, `${prefix}, položky`, { maxItems: 40, maxText: 4000 });
      return;
    }
    const headers = block.headers;
    if (!Array.isArray(headers) || headers.length === 0 || headers.length > 16) errors.push(`${prefix}: tabulka nemá platné záhlaví.`);
    else headers.forEach((cell, cellIndex) => {
      if (!validText(String(cell ?? ''), 3000, true)) errors.push(`${prefix}: záhlaví ${cellIndex + 1} je příliš dlouhé.`);
    });
    validateTableRows(block.rows, errors, prefix, true, Array.isArray(headers) ? headers.length : 0);
  });
}

function validateTableRows(rows, errors, prefix, requireFixedColumns, expectedColumns = 0) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 120) {
    errors.push(`${prefix}: tabulka nemá platné řádky.`);
    return;
  }
  let inferred = expectedColumns;
  rows.forEach((row, rowIndex) => {
    if (!Array.isArray(row) || row.length === 0 || row.length > 20) {
      errors.push(`${prefix}: řádek ${rowIndex + 1} je neplatný.`);
      return;
    }
    if (!inferred) inferred = row.length;
    if (requireFixedColumns && row.length !== inferred) errors.push(`${prefix}: řádek ${rowIndex + 1} neodpovídá počtu sloupců.`);
    row.forEach((cell, cellIndex) => {
      if (!validText(String(cell ?? ''), 5000, true)) errors.push(`${prefix}: buňka ${rowIndex + 1}/${cellIndex + 1} je příliš dlouhá.`);
    });
  });
}

function validateSections(sections, errors, warnings, label, practice) {
  if (!Array.isArray(sections) || sections.length === 0) {
    errors.push(`${label}: chybí podtémata.`);
    return;
  }
  if (sections.length > MAX_SECTIONS) {
    errors.push(`${label}: příliš mnoho podtémat (${sections.length}).`);
    return;
  }
  const ids = new Set();
  sections.forEach((section, index) => {
    const prefix = `${label}: podtéma ${index + 1}`;
    const id = String(section?.id || '');
    if (!id) errors.push(`${prefix} nemá ID.`);
    if (ids.has(id)) errors.push(`${label}: duplicitní ID podtématu ${id}.`);
    ids.add(id);
    if (!validText(section?.label, 700)) errors.push(`${prefix} nemá název nebo je příliš dlouhý.`);
    if (!Array.isArray(section?.questions) || section.questions.length === 0) errors.push(`${prefix} nemá otázky.`);
    else if (section.questions.length > MAX_QUESTIONS) errors.push(`${prefix} má příliš mnoho otázek.`);
    else section.questions.forEach((question, qIndex) => validateQuestion(question, errors, warnings, `${prefix}, otázka ${qIndex + 1}`, practice));

    if (section?.extraPrompt !== undefined) validateExtraPrompt(section.extraPrompt, errors, warnings, `${prefix}, Extra Prompt`);
    if (section?.extraPrompts !== undefined) {
      if (!Array.isArray(section.extraPrompts) || section.extraPrompts.length > 20) errors.push(`${prefix} má neplatné extra prompty.`);
      else section.extraPrompts.forEach((question, qIndex) => validateQuestion(question, errors, warnings, `${prefix}, extra prompt ${qIndex + 1}`, false));
    }
  });
}

function validateQuestion(question, errors, warnings, label, practice) {
  if (!validText(question?.prompt, MAX_TEXT)) errors.push(`${label} nemá text nebo je příliš dlouhý.`);
  validateStringArray(question?.answer, errors, `${label}, odpověď`, { optional: true, maxItems: 30, maxText: 5000 });
  validateStringArray(question?.guidance, errors, `${label}, nápověda`, { optional: true, maxItems: 30, maxText: 5000 });
  validateOptionalText(question?.extra, errors, `${label}, extra prompt`, 5000);
  validateOptionalText(question?.followUp, errors, `${label}, follow-up`, 5000);
  validateGuidanceMeta(question?.guidanceMeta, errors, `${label}, metadata nápovědy`);
  if (question?.guidanceSource != null && !['teacher-source-aligned', 'generated-pedagogical'].includes(question.guidanceSource)) {
    errors.push(`${label}: neplatný původ nápovědy.`);
  }
  if (practice && (!Array.isArray(question?.guidance) || question.guidance.length === 0)) warnings.push(`${label} nemá učitelskou nápovědu.`);
}

function validateExtraPrompt(value, errors, warnings, label) {
  if (typeof value === 'string') {
    if (!value.trim()) errors.push(`${label} je prázdný.`);
    return;
  }
  validateQuestion(value, errors, warnings, label, false);
}

function validateGuidanceMeta(value, errors, label) {
  if (value == null) return;
  if (typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${label} není objekt.`);
    return;
  }
  if (value.status !== undefined && !validText(String(value.status), 200)) errors.push(`${label}: neplatný status.`);
  if (value.reviewPriority !== undefined && !['NORMAL', 'HIGH'].includes(String(value.reviewPriority))) errors.push(`${label}: neplatná priorita revize.`);
  if (value.matchScore !== undefined && (!Number.isFinite(Number(value.matchScore)) || Number(value.matchScore) < 0 || Number(value.matchScore) > 1.5)) errors.push(`${label}: neplatné skóre shody.`);
  if (value.sourceMatches !== undefined) validateStringArray(value.sourceMatches, errors, `${label}: zdrojové shody`, { optional: true, maxItems: 20, maxText: 5000 });
  if (value.basis !== undefined && !Array.isArray(value.basis) && typeof value.basis !== 'string') errors.push(`${label}: neplatný basis.`);
}

function validateStringArray(value, errors, label, options = {}) {
  const { optional = false, maxItems = 20, maxText = 3000 } = options;
  if (value == null && optional) return;
  if (!Array.isArray(value) || (!optional && value.length === 0)) {
    errors.push(`${label} není platné pole.`);
    return;
  }
  if (value.length > maxItems) {
    errors.push(`${label} obsahuje příliš mnoho položek.`);
    return;
  }
  value.forEach((item, index) => {
    if (!validText(String(item ?? ''), maxText)) errors.push(`${label}: položka ${index + 1} je prázdná nebo příliš dlouhá.`);
  });
}

function validateOptionalText(value, errors, label, maxLength) {
  if (value == null || value === '') return;
  if (!validText(String(value), maxLength)) errors.push(`${label} je neplatný nebo příliš dlouhý.`);
}

function validText(value, maxLength, allowEmpty = false) {
  if (typeof value !== 'string') return false;
  if (!allowEmpty && !value.trim()) return false;
  return value.length <= maxLength;
}

export function safeImageSource(value) {
  if (typeof value !== 'string' || value.length > MAX_IMAGE_SOURCE) return false;
  if (SAFE_IMAGE_DATA.test(value)) return true;
  if (!SAFE_LOCAL_DEMO.test(value)) return false;
  try {
    const path = value.slice('./assets/demo/'.length);
    return path.split('/').every(segment => segment && segment !== '.' && segment !== '..');
  } catch { return false; }
}


function result(errors, warnings) {
  return { ok: errors.length === 0, errors, warnings };
}
