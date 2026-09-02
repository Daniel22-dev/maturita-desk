/*
 * Maturita Desk 1.0.0 — final serverless baseline.
 * The public shell contains no exam content, passphrase, OpenAI API key or private publisher key.
 * CONFIDENTIAL-EXAM content is accepted only on a pinned isolated production origin and only with a valid publisher signature.
 */
globalThis.MATURITA_DESK_RUNTIME = Object.freeze({
  schema: 'maturita-desk-runtime-v1',
  version: 1,
  environmentId: 'serverless-production',
  mode: 'standalone-local',
  serverBaseUrl: '',
  allowedOrigins: Object.freeze(['self', 'https://maturita-fact.ghrabuvka.cz']),
  trust: Object.freeze({
    expectedMode: 'standalone-local',
    expectedEnvironmentId: 'serverless-production',
    appOrigins: Object.freeze(['https://daniel22-dev.github.io', 'https://maturita.ghrabuvka.cz']),
    confidentialContentOrigins: Object.freeze(['https://maturita.ghrabuvka.cz']),
    allowLocalhostConfidential: true
  }),
  auth: Object.freeze({
    provider: 'local-device',
    sessionEndpoint: '',
    loginUrl: '',
    logoutEndpoint: '',
    offlineLease: Object.freeze({ enabled: false, publicKeys: Object.freeze({}) })
  }),
  content: Object.freeze({
    provider: 'encrypted-local',
    activePackEndpoint: '',
    allowManualImport: true,
    requirePublisherSignatureFor: Object.freeze(['CONFIDENTIAL-EXAM']),
    publisherKeys: Object.freeze({
      'ghrab-maturita-content-2026-01': Object.freeze({"key_ops": ["verify"], "ext": true, "kty": "EC", "x": "0bufZcuDqZL1hDWvpfe8RPPah7rPHCVj4GhZ0lnOqek", "y": "xxGraQfMwKSHq4C0ExltO6syXWvl-zdGiQ25bMXcqeU", "crv": "P-256"})
    })
  }),
  factCheck: Object.freeze({
    provider: 'isolated-http',
    endpoint: '',
    timeoutMs: 18000
  })
});
