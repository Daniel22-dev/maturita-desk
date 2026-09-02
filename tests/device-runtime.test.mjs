import assert from 'node:assert/strict';
import {
  classifyFormFactor,
  computeViewportSnapshot,
  detectDisplayMode,
  installDeviceRuntime
} from '../src/device-runtime.js';

assert.equal(classifyFormFactor({ width: 390, height: 844, coarsePointer: true, touchPoints: 5 }), 'phone');
assert.equal(classifyFormFactor({ width: 844, height: 390, coarsePointer: true, touchPoints: 5 }), 'phone');
assert.equal(classifyFormFactor({ width: 820, height: 1180, coarsePointer: true, touchPoints: 5 }), 'tablet');
assert.equal(classifyFormFactor({ width: 1180, height: 820, coarsePointer: true, touchPoints: 5 }), 'tablet');
assert.equal(classifyFormFactor({ width: 1440, height: 900, coarsePointer: false, touchPoints: 0 }), 'desktop');

{
  const snapshot = computeViewportSnapshot({
    innerWidth: 390,
    innerHeight: 844,
    visualViewport: { width: 390, height: 510, offsetTop: 0, scale: 1 },
    coarsePointer: true,
    touchPoints: 5,
    displayMode: 'standalone'
  });
  assert.equal(snapshot.formFactor, 'phone');
  assert.equal(snapshot.orientation, 'portrait');
  assert.equal(snapshot.keyboardOpen, true);
  assert.equal(snapshot.keyboardInset, 334);
  assert.equal(snapshot.standalone, true);
}

{
  const pinch = computeViewportSnapshot({
    innerWidth: 390,
    innerHeight: 844,
    visualViewport: { width: 195, height: 422, offsetTop: 0, scale: 2 },
    coarsePointer: true,
    touchPoints: 5
  });
  assert.equal(pinch.keyboardOpen, false, 'pinch zoom must not be misclassified as a software keyboard');
}

assert.equal(detectDisplayMode({ navigatorObject: { standalone: true } }), 'standalone');
assert.equal(detectDisplayMode({ navigatorObject: {}, matchMedia: query => ({ matches: query.includes('standalone') }) }), 'standalone');

{
  const listeners = {};
  const vvListeners = {};
  const visualViewport = {
    width: 820,
    height: 1180,
    offsetTop: 0,
    scale: 1,
    addEventListener(type, cb) { (vvListeners[type] ||= []).push(cb); },
    removeEventListener() {}
  };
  const rootStyle = new Map();
  const root = {
    dataset: {},
    style: { setProperty(name, value) { rootStyle.set(name, value); } }
  };
  const win = {
    innerWidth: 820,
    innerHeight: 1180,
    visualViewport,
    matchMedia(query) { return { matches: query === '(pointer: coarse)' }; },
    addEventListener(type, cb) { (listeners[type] ||= []).push(cb); },
    removeEventListener() {}
  };
  const oldNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { value: { maxTouchPoints: 5 }, configurable: true });
  try {
    let seen = null;
    const controller = installDeviceRuntime({ windowObject: win, documentObject: { documentElement: root }, onChange: value => { seen = value; } });
    assert.equal(controller.snapshot.formFactor, 'tablet');
    assert.equal(root.dataset.orientation, 'portrait');
    assert.equal(rootStyle.get('--visual-viewport-height'), '1180px');
    visualViewport.height = 760;
    vvListeners.resize[0]();
    assert.equal(root.dataset.keyboard, 'open');
    assert.equal(seen.keyboardOpen, true);
    win.innerWidth = 1180;
    win.innerHeight = 820;
    visualViewport.width = 1180;
    visualViewport.height = 820;
    listeners.orientationchange[0]();
    assert.equal(root.dataset.orientation, 'landscape');
    controller.dispose();
  } finally {
    Object.defineProperty(globalThis, 'navigator', { value: oldNavigator, configurable: true });
  }
}

console.log('Device runtime tests: PASS');
