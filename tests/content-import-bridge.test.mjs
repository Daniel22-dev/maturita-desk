import assert from 'node:assert/strict';

let clickHandler = null;
let inputParent = 'drawer';
const input = {};
const app = {
  contains(node) { return node === input && inputParent === 'app'; },
  appendChild(node) { assert.equal(node, input); inputParent = 'app'; }
};

globalThis.document = {
  addEventListener(type, cb) { if (type === 'click') clickHandler = cb; },
  querySelector(selector) {
    if (selector === '[data-content-pack-file]') return input;
    if (selector === '#app') return app;
    return null;
  }
};

await import('../src/content-import-bridge.js');
assert(clickHandler, 'bridge click handler missing');
clickHandler({ target: { closest(selector) { return selector === '[data-action="content-import-trigger"]' ? this : null; } } });
assert.equal(inputParent, 'app', 'Content Pack file input must move under #app before picker opens');

console.log('Content import drawer bridge test: PASS');
