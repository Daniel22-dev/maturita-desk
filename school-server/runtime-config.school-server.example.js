/* NON-SECRET EXAMPLE. Replace paths/key material during approved server deployment. */
globalThis.MATURITA_DESK_RUNTIME = Object.freeze({
  schema: 'maturita-desk-runtime-v1',
  version: 1,
  environmentId: 'school-production',
  mode: 'school-server',
  serverBaseUrl: '/api/v1/maturita-desk/',
  allowedOrigins: ['self'],
  trust: Object.freeze({ expectedMode: 'school-server', expectedEnvironmentId: 'school-production', appOrigins: Object.freeze(['https://school.example']) }),
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
    allowManualImport: false
  }),
  factCheck: Object.freeze({
    provider: 'school-server',
    endpoint: 'fact-check',
    timeoutMs: 18000
  })
});
