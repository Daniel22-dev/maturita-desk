/* NON-SECRET EXAMPLE. Replace paths/auth key material during approved server deployment. */
globalThis.MATURITA_DESK_RUNTIME = Object.freeze({
  schema: 'maturita-desk-runtime-v1',
  version: 1,
  environmentId: 'school-production',
  mode: 'school-server',
  serverBaseUrl: '/api/v1/maturita-desk/',
  allowedOrigins: Object.freeze(['self']),
  trust: Object.freeze({
    expectedMode: 'school-server',
    expectedEnvironmentId: 'school-production',
    appOrigins: Object.freeze(['https://school.example']),
    confidentialContentOrigins: Object.freeze(['https://school.example']),
    allowLocalhostConfidential: false
  }),
  auth: Object.freeze({
    provider: 'school-server-session',
    sessionEndpoint: 'session',
    loginUrl: '/auth/login/maturita-desk',
    logoutEndpoint: 'session/logout',
    offlineLease: Object.freeze({
      enabled: true,
      maxHours: 24,
      publicKeys: Object.freeze({
        /* 'school-auth-2027-01': { kty:'EC', crv:'P-256', x:'...', y:'...', ext:true, key_ops:['verify'] } */
      })
    })
  }),
  content: Object.freeze({
    provider: 'school-server-encrypted-pack',
    activePackEndpoint: 'content/active',
    allowManualImport: false,
    requirePublisherSignatureFor: Object.freeze(['CONFIDENTIAL-EXAM']),
    publisherKeys: Object.freeze({
      'ghrab-maturita-content-2026-01': Object.freeze({
        kty: 'EC', crv: 'P-256', x: '0bufZcuDqZL1hDWvpfe8RPPah7rPHCVj4GhZ0lnOqek',
        y: 'xxGraQfMwKSHq4C0ExltO6syXWvl-zdGiQ25bMXcqeU', ext: true, key_ops: Object.freeze(['verify'])
      })
    })
  }),
  factCheck: Object.freeze({ provider: 'school-server', endpoint: 'fact-check', timeoutMs: 18000 })
});
