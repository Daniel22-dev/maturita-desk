export class SuiteStorageStub {
  constructor(entries = []) { this.map = new Map(entries); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

export function createSuitePlatform(storage, { appId = 'maturita-desk' } = {}) {
  const generationKey = 'ghrab.platform.suite-session-generation.v1';
  const seenKey = `ghrab.${appId}.suite-session-seen.v1`;
  const handlers = new Set();

  const generation = () => String(storage.getItem(generationKey) || '');
  const seen = () => String(storage.getItem(seenKey) || '');

  async function emit(detail) {
    let ok = handlers.size > 0;
    for (const handler of [...handlers]) {
      try {
        const result = await handler(detail);
        if (result === false || result?.ok === false) ok = false;
      } catch { ok = false; }
    }
    if (ok) storage.setItem(seenKey, detail.generation);
    return { ok, generation: detail.generation };
  }

  return Object.freeze({
    version: '1.1.2',
    contract: 'ghrab-platform-v1',
    session: Object.freeze({
      contract: 'ghrab-suite-session-v1',
      generation,
      seen,
      pending: () => Boolean(generation() && generation() !== seen()),
      onEnd(handler, options = {}) {
        handlers.add(handler);
        const current = generation();
        if (options.replay !== false && current && current !== seen()) {
          void emit(Object.freeze({ schema: 'ghrab-suite-session-v1', generation: current, reason: 'pending-suite-end', clearApplicationData: true, appId, replay: true }));
        }
        return () => handlers.delete(handler);
      },
      async testEnd(generationValue = `test-${Date.now()}`, reason = 'test-end') {
        storage.setItem(generationKey, generationValue);
        const detail = Object.freeze({ schema: 'ghrab-suite-session-v1', generation: generationValue, reason, clearApplicationData: true, appId });
        return await emit(detail);
      }
    })
  });
}
