/*
 * EXAMPLE ONLY — do not load this file directly.
 * Replace the example origins/endpoint with the approved deployment values,
 * then apply equivalent values to runtime-config.js and config/deployment.json.
 * No secret belongs in either public config file.
 */
globalThis.MATURITA_DESK_RUNTIME = Object.freeze({
  schema: 'maturita-desk-runtime-v1',
  version: 1,
  environmentId: 'standalone-local',
  mode: 'standalone-local',
  serverBaseUrl: '',
  allowedOrigins: Object.freeze(['self', 'https://fact-check.example.invalid']),
  trust: Object.freeze({
    expectedMode: 'standalone-local',
    expectedEnvironmentId: 'standalone-local',
    appOrigins: Object.freeze(['https://maturita.example.invalid'])
  }),
  auth: Object.freeze({
    provider: 'local-device',
    sessionEndpoint: '', loginUrl: '', logoutEndpoint: '',
    offlineLease: Object.freeze({ enabled: false, publicKeys: Object.freeze({}) })
  }),
  content: Object.freeze({ provider: 'encrypted-local', activePackEndpoint: '', allowManualImport: true }),
  factCheck: Object.freeze({
    provider: 'isolated-http',
    endpoint: 'https://fact-check.example.invalid/fact-check',
    timeoutMs: 18000
  })
});
