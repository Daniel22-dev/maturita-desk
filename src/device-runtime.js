const KEYBOARD_THRESHOLD_PX = 120;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback = 0) {
  return Math.max(0, finite(value, fallback));
}

export function detectDisplayMode({ navigatorObject = globalThis.navigator, matchMedia = globalThis.matchMedia } = {}) {
  if (navigatorObject?.standalone === true) return 'standalone';
  try {
    if (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)')?.matches) return 'standalone';
    if (typeof matchMedia === 'function' && matchMedia('(display-mode: fullscreen)')?.matches) return 'fullscreen';
  } catch {}
  return 'browser';
}

export function classifyFormFactor({ width = 0, height = 0, coarsePointer = false, touchPoints = 0 } = {}) {
  const w = positive(width);
  const h = positive(height);
  const minSide = Math.min(w || h, h || w);
  const maxSide = Math.max(w, h);
  const touch = Boolean(coarsePointer || positive(touchPoints) > 0);
  if (touch && minSide > 0 && minSide <= 600) return 'phone';
  if (touch && minSide > 0 && minSide <= 1100 && maxSide <= 1600) return 'tablet';
  return 'desktop';
}

export function computeViewportSnapshot({
  innerWidth = 0,
  innerHeight = 0,
  visualViewport = null,
  coarsePointer = false,
  touchPoints = 0,
  displayMode = 'browser'
} = {}) {
  const layoutWidth = positive(innerWidth, 1024) || 1024;
  const layoutHeight = positive(innerHeight, 768) || 768;
  const visualWidth = positive(visualViewport?.width, layoutWidth) || layoutWidth;
  const visualHeight = positive(visualViewport?.height, layoutHeight) || layoutHeight;
  const offsetTop = positive(visualViewport?.offsetTop, 0);
  const scale = Math.max(0.1, finite(visualViewport?.scale, 1) || 1);
  const formFactor = classifyFormFactor({ width: layoutWidth, height: layoutHeight, coarsePointer, touchPoints });
  const orientation = layoutWidth >= layoutHeight ? 'landscape' : 'portrait';
  const occludedBottom = Math.max(0, layoutHeight - visualHeight - offsetTop);
  const keyboardOpen = formFactor !== 'desktop' && scale <= 1.05 && occludedBottom >= KEYBOARD_THRESHOLD_PX;
  return Object.freeze({
    formFactor,
    orientation,
    displayMode,
    standalone: ['standalone', 'fullscreen'].includes(displayMode),
    layoutWidth,
    layoutHeight,
    visualWidth,
    visualHeight,
    offsetTop,
    scale,
    keyboardInset: keyboardOpen ? occludedBottom : 0,
    keyboardOpen
  });
}

export function applyViewportSnapshot(root, snapshot) {
  if (!root || !snapshot) return snapshot;
  if (root.dataset) {
    root.dataset.formFactor = snapshot.formFactor;
    root.dataset.orientation = snapshot.orientation;
    root.dataset.displayMode = snapshot.displayMode;
    root.dataset.keyboard = snapshot.keyboardOpen ? 'open' : 'closed';
  }
  const style = root.style;
  if (style?.setProperty) {
    style.setProperty('--layout-viewport-height', `${Math.round(snapshot.layoutHeight)}px`);
    style.setProperty('--visual-viewport-height', `${Math.round(snapshot.visualHeight)}px`);
    style.setProperty('--visual-viewport-top', `${Math.round(snapshot.offsetTop)}px`);
    style.setProperty('--keyboard-inset', `${Math.round(snapshot.keyboardInset)}px`);
  }
  return snapshot;
}

export function readDeviceSnapshot({ windowObject = globalThis.window, documentObject = globalThis.document } = {}) {
  const matchMedia = typeof windowObject?.matchMedia === 'function' ? windowObject.matchMedia.bind(windowObject) : globalThis.matchMedia;
  let coarsePointer = false;
  try { coarsePointer = Boolean(matchMedia?.('(pointer: coarse)')?.matches); } catch {}
  const displayMode = detectDisplayMode({ navigatorObject: globalThis.navigator, matchMedia });
  const snapshot = computeViewportSnapshot({
    innerWidth: windowObject?.innerWidth,
    innerHeight: windowObject?.innerHeight,
    visualViewport: windowObject?.visualViewport,
    coarsePointer,
    touchPoints: globalThis.navigator?.maxTouchPoints,
    displayMode
  });
  return applyViewportSnapshot(documentObject?.documentElement, snapshot);
}

export function installDeviceRuntime({ windowObject = globalThis.window, documentObject = globalThis.document, onChange = null } = {}) {
  if (!windowObject || !documentObject) return { snapshot: readDeviceSnapshot({ windowObject, documentObject }), dispose() {} };
  let lastKey = '';
  let snapshot = null;
  const emit = () => {
    snapshot = readDeviceSnapshot({ windowObject, documentObject });
    const key = [snapshot.formFactor, snapshot.orientation, snapshot.displayMode, snapshot.keyboardOpen, Math.round(snapshot.visualHeight), Math.round(snapshot.offsetTop)].join('|');
    if (key !== lastKey) {
      lastKey = key;
      if (typeof onChange === 'function') onChange(snapshot);
    }
    return snapshot;
  };
  const listeners = [];
  const on = (target, type, handler, options) => {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener?.(type, handler, options));
  };
  on(windowObject, 'resize', emit, { passive: true });
  on(windowObject, 'orientationchange', emit, { passive: true });
  on(windowObject, 'pageshow', emit, { passive: true });
  on(windowObject.visualViewport, 'resize', emit, { passive: true });
  on(windowObject.visualViewport, 'scroll', emit, { passive: true });
  snapshot = emit();
  return {
    get snapshot() { return snapshot; },
    refresh: emit,
    dispose() { listeners.splice(0).forEach(off => off()); }
  };
}
