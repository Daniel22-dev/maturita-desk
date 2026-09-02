import { createLocalDeviceAuthProvider, createSchoolServerAuthProvider, createLockedAuthProvider } from './auth-provider.js';
import { createLocalEncryptedContentProvider, createSchoolServerContentProvider, createLockedContentProvider } from './content-provider.js';
import { createHttpFactCheckProvider } from '../fact-check.js';

export function createProviderRegistry(runtime, {
  contentStore,
  fetchImpl = globalThis.fetch,
  storage = globalThis.localStorage,
  cryptoImpl = globalThis.crypto,
  locationLike = globalThis.location,
  now = () => Date.now()
} = {}) {
  let authState = null;
  const auth = runtime.mode === 'school-server'
    ? createSchoolServerAuthProvider(runtime.auth, { fetchImpl, storage, cryptoImpl, locationLike, now })
    : runtime.mode === 'standalone-local'
      ? createLocalDeviceAuthProvider()
      : createLockedAuthProvider(runtime.configurationError || 'Runtime konfigurace je uzamčená.');
  if (!auth) throw new Error('Auth Provider nelze vytvořit z runtime konfigurace.');

  const content = runtime.mode === 'school-server'
    ? createSchoolServerContentProvider(runtime.content, contentStore, { fetchImpl, authSnapshot: () => authState })
    : runtime.mode === 'standalone-local'
      ? createLocalEncryptedContentProvider(contentStore)
      : createLockedContentProvider(runtime.configurationError || 'Runtime konfigurace je uzamčená.');
  if (!content) throw new Error('Content Provider nelze vytvořit z runtime konfigurace.');

  const factCheck = runtime.mode === 'locked' ? null : createHttpFactCheckProvider({
    endpoint: runtime.factCheck.endpoint,
    timeoutMs: runtime.factCheck.timeoutMs,
    fetchImpl,
    credentials: runtime.factCheck.provider === 'school-server' ? 'include' : 'omit',
    mode: runtime.factCheck.provider === 'school-server' ? 'same-origin' : 'cors',
    getCsrfToken: () => authState?.csrfToken || ''
  });

  return Object.freeze({
    runtime,
    auth,
    content,
    factCheck,
    setAuthState(value) { authState = value; },
    getAuthState() { return authState; }
  });
}
