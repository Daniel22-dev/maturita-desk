/*
 * Maturita Desk Stage 13R serverless/internal-review runtime profile (provider contract unchanged from Stage 10).
 * PUBLIC/standalone profile: no user identity is asserted and no API secret exists here.
 * A school-server deployment replaces this non-secret config with the approved server profile;
 * application source code remains unchanged.
 */
// Internal review capability is honored by the app only on localhost/loopback.
// It does not weaken the public GitHub Pages deployment.
globalThis.MATURITA_DESK_INTERNAL_REVIEW = true;

globalThis.MATURITA_DESK_RUNTIME = Object.freeze({
  schema: 'maturita-desk-runtime-v1',
  version: 1,
  environmentId: 'standalone-local',
  mode: 'standalone-local',
  serverBaseUrl: '',
  allowedOrigins: ['self'],
  trust: Object.freeze({ expectedMode: 'standalone-local', expectedEnvironmentId: 'standalone-local', appOrigins: Object.freeze(['https://daniel22-dev.github.io']) }),
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
    allowManualImport: true
  }),
  factCheck: Object.freeze({
    provider: 'isolated-http',
    endpoint: '',
    timeoutMs: 18000
  })
});
