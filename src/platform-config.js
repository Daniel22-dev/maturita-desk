(function (global) {
  'use strict';
  global.GHRAB_PLATFORM_CONFIG = Object.freeze({
    schema: 'ghrab-platform-app-config-v1',
    appId: 'maturita-desk',
    appName: 'Maturita Desk',
    appVersion: '1.0.3',
    requiredPlatformRange: '>=1.1.2 <2.0.0',
    platformContract: 'ghrab-platform-v1',
    brandVersion: '1.0.0',
    autoFooter: false,
    bridgeWriteLegacy: false,
    bridgeMaxBytes: 20000,
    theme: { contract: 'ghrab-theme-v1', supported: ['light', 'dark', 'system'], default: 'system', systemFallback: 'light' },
    storageMigration: { id: 'maturita-desk-storage-v1', backup: 'none', mappings: [] },
    artifactContract: 'ghrab-artifact-envelope-v1',
    quality: {
      schema: 'ghrab-quality-consumer-v1',
      accessibilityContract: 'ghrab-a11y-v1',
      performanceContract: 'ghrab-performance-v1',
      stage: 'serverless-1.0.3'
    }
  });
})(window);
