import assert from 'node:assert/strict';

class StorageStub {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

class NodeStub {
  constructor(name='node') {
    this.name = name;
    this.innerHTML = '';
    this.dataset = {};
    this.listeners = {};
    this.className = '';
    this.classList = { toggle() {}, add() {}, remove() {} };
    this.style = { values: new Map(), setProperty(name, value) { this.values.set(name, value); } };
  }
  addEventListener(type, cb) { (this.listeners[type] ||= []).push(cb); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  setAttribute() {}
  appendChild() {}
  remove() {}
  focus() {}
}

const app = new NodeStub('app');
const modal = new NodeStub('modal');
const toast = new NodeStub('toast');
const docListeners = {};
const winListeners = {};
const vvListeners = {};
const visualViewport = {
  width: 390, height: 844, offsetTop: 0, scale: 1,
  addEventListener(type, cb) { (vvListeners[type] ||= []).push(cb); },
  removeEventListener() {}
};

const { TOPICS } = await import('../src/demo-content.js');
TOPICS[13].title = 'TOPIC_CANARY_SYNTH';

let capturedFactRequest = null;
globalThis.fetch = async (url, options = {}) => {
  const href = String(url || '');
  if (href.includes('/fact-check')) {
    capturedFactRequest = { url: href, options, body: JSON.parse(options.body || '{}') };
    return new Response(JSON.stringify({
      schema: 'maturita-desk-fact-check-v1', verdict: 'uncertain', confidence: 'low', answer: 'Synthetic integrated result',
      sources: [{ title: 'Synthetic', url: 'https://example.org/source' }], searched: true
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error(`Unexpected fetch in runtime smoke: ${href}`);
};

globalThis.MATURITA_DESK_RUNTIME = {
  schema: 'maturita-desk-runtime-v1', version: 1, environmentId: 'synthetic-test', mode: 'standalone-local',
  serverBaseUrl: '', allowedOrigins: ['self'],
  trust: { expectedMode: 'standalone-local', expectedEnvironmentId: 'synthetic-test', appOrigins: ['https://example.invalid'] },
  diagnosticCanary: 'PACK_CANARY_SYNTH',
  auth: { provider: 'local-device', offlineLease: { enabled: false, publicKeys: {} } },
  content: { provider: 'encrypted-local', allowManualImport: true },
  factCheck: { provider: 'isolated-http', endpoint: 'https://example.invalid/fact-check', timeoutMs: 18000 }
};
globalThis.localStorage = new StorageStub();
globalThis.sessionStorage = new StorageStub();
sessionStorage.setItem('ghrab.maturita-desk.fact-access.v1', 'SYNTHETIC-TEACHER-ACCESS-1234567890');
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, maxTouchPoints: 5 }, configurable: true });
Object.defineProperty(globalThis, 'BroadcastChannel', { value: undefined, configurable: true });
globalThis.window = {
  innerWidth: 390,
  innerHeight: 844,
  visualViewport,
  setInterval: () => 1,
  setTimeout: () => 1,
  clearTimeout: () => {},
  matchMedia(query) { return { matches: query === '(pointer: coarse)' }; },
  addEventListener(type, cb) { (winListeners[type] ||= []).push(cb); },
  removeEventListener() {},
};
globalThis.document = {
  documentElement: { dataset: {}, style: { values: new Map(), setProperty(name, value) { this.values.set(name, value); } } },
  visibilityState: 'visible',
  body: new NodeStub('body'),
  querySelector(selector) {
    if (selector === '#app') return app;
    if (selector === '#modal-root') return modal;
    if (selector === '#toast-root') return toast;
    return null;
  },
  querySelectorAll() { return []; },
  createElement: () => new NodeStub('created'),
  addEventListener(type, cb) { (docListeners[type] ||= []).push(cb); }
};

await import('../src/main.js');
assert.match(app.innerHTML, /Maturita Desk/);
assert.equal(document.documentElement.dataset.formFactor, 'phone');
assert.equal(document.documentElement.dataset.orientation, 'portrait');
visualViewport.height = 520;
vvListeners.resize?.forEach(cb => cb());
assert.equal(document.documentElement.dataset.keyboard, 'open');
visualViewport.height = 844;
vvListeners.resize?.forEach(cb => cb());
assert.equal(document.documentElement.dataset.keyboard, 'closed');

function actionTarget(dataset) {
  return {
    dataset,
    closest(selector) { return selector === '[data-action]' ? this : null; },
    matches() { return false; }
  };
}
function modalTarget(action) {
  return { dataset: { modalAction: action }, closest(selector) { return selector === '[data-modal-action]' ? this : null; } };
}
async function click(dataset) {
  const cb = docListeners.click?.[0];
  assert(cb, 'document click handler missing');
  return cb({ target: actionTarget(dataset) });
}
function modalClick(action) {
  const cb = modal.listeners.click?.[0];
  assert(cb, 'modal click handler missing');
  cb({ target: modalTarget(action) });
}

click({ action: 'choose-mode', mode: 'exam' });
assert.match(app.innerHTML, /Vyberte téma/);
click({ action: 'select-topic', topic: '14' });
assert.match(app.innerHTML, /Zahájit zkoušku/);
click({ action: 'start-exam' });
let session = JSON.parse(localStorage.getItem('ghrab.maturita-desk.session.v1'));
assert.equal(session.schema, 'maturita-desk-session-v3');
assert.equal(session.contentRef.source, 'demo');
assert.equal(session.activePhase, 'pictures');
const beforeLifecycle = session.lastKnownNow;
document.visibilityState = 'hidden';
docListeners.visibilitychange?.forEach(cb => cb());
session = JSON.parse(localStorage.getItem('ghrab.maturita-desk.session.v1'));
assert.ok(session.lastKnownNow >= beforeLifecycle, 'hidden lifecycle must persist current timer state');
document.visibilityState = 'visible';
docListeners.visibilitychange?.forEach(cb => cb());
winListeners.pageshow?.forEach(cb => cb());

click({ action: 'view-phase', phase: 'topic' });
session = JSON.parse(localStorage.getItem('ghrab.maturita-desk.session.v1'));
assert.equal(session.activePhase, 'pictures');
assert.equal(session.viewPhase, 'topic');

const inputCb = docListeners.input?.[0];
assert(inputCb, 'document input handler missing');
inputCb({ target: { dataset: { phase: 'pictures' }, value: 'NOTES_CANARY_SYNTH SESSION_CANARY_SYNTH PACK_CANARY_SYNTH', matches(sel) { return sel === '[data-notes-input]'; } } });
session = JSON.parse(localStorage.getItem('ghrab.maturita-desk.session.v1'));
assert.equal(session.notes.pictures, 'NOTES_CANARY_SYNTH SESSION_CANARY_SYNTH PACK_CANARY_SYNTH');

// Stage 12R N-09: exercise the REAL main.js call site with populated app-state canaries.
await click({ action: 'open-fact' });
inputCb({ target: { dataset: {}, value: 'Verify only this synthetic claim.', matches(sel) { return sel === '[data-fact-query]'; } } });
await click({ action: 'fact-submit' });
assert(capturedFactRequest, 'Fact Check request was not sent from the real app call site');
assert.deepEqual(Object.keys(capturedFactRequest.body), ['query']);
assert.equal(capturedFactRequest.body.query, 'Verify only this synthetic claim.');
assert.equal(capturedFactRequest.options.headers['X-Maturita-Desk-Access'], 'SYNTHETIC-TEACHER-ACCESS-1234567890');
const factSerialized = JSON.stringify(capturedFactRequest);
for (const canary of ['TOPIC_CANARY_SYNTH','NOTES_CANARY_SYNTH','SESSION_CANARY_SYNTH','PACK_CANARY_SYNTH']) {
  assert.equal(factSerialized.includes(canary), false, `actual app egress leaked ${canary}`);
}

click({ action: 'return-active' });
click({ action: 'transition', next: 'task' });
assert.match(modal.innerHTML, /Přejít na Task Box/);
modalClick('confirm-transition');
session = JSON.parse(localStorage.getItem('ghrab.maturita-desk.session.v1'));
assert.equal(session.activePhase, 'task');

click({ action: 'transition', next: 'topic' });
modalClick('confirm-transition');
session = JSON.parse(localStorage.getItem('ghrab.maturita-desk.session.v1'));
assert.equal(session.activePhase, 'topic');

click({ action: 'finish-session' });
assert.match(modal.innerHTML, /Ukončit zkoušku/);
modalClick('confirm-finish');
session = JSON.parse(localStorage.getItem('ghrab.maturita-desk.session.v1'));
assert.equal(session.status, 'finished');
assert.match(app.innerHTML, /Relace ukončena/);
assert.match(app.innerHTML, /NOTES_CANARY_SYNTH/);
click({ action: 'new-topic' });
assert.match(modal.innerHTML, /Smazat pracovní poznámky/);
modalClick('discard');
assert.equal(localStorage.getItem('ghrab.maturita-desk.session.v1'), null);
assert.match(app.innerHTML, /Vyberte téma/);

console.log('Main runtime smoke: PASS');
