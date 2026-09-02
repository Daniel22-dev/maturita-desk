# Maturita Desk 1.0.1 - Origin-neutral serverless build report

Software baseline: **FEATURE-COMPLETE SERVERLESS 1.0.1**  
Automated regression/security suite: **PASS**  
Physical / pedagogical / live-service acceptance: **PENDING**

## Release changes against 1.0.0

- removed the hard-coded school production domain;
- source repository stays `Daniel22-dev/maturita-desk`;
- the shared GitHub Pages origin stays public/demo-only;
- added signed `maturita-desk-origin-authorization-v1` grants, bound to an
  exact HTTPS origin and environment id;
- a future neutral isolated host can therefore be authorized without another
  application source-code release;
- unknown HTTPS hosts fail closed when the signed origin grant is missing,
  invalid, for another origin, for another environment, or signed by an
  unapproved key;
- `CONFIDENTIAL-EXAM` still requires a valid publisher signature and correct
  pack passphrase;
- `runtime-config.js` and the signed origin authorization file are included in
  the versioned offline shell cache with network-first refresh and cache
  fallback; `.mdesk` remains excluded from the Service Worker cache;
- public CSP is narrowed to `connect-src 'self'`; a same-origin Fact Check
  endpoint is preferred for the future live serverless deployment;
- the platform consumer manifest explicitly records both standalone PWA use and
  AI Studio entry use of the same application.

## Automated verification executed

Full `npm test` on the 1.0.1 working tree: **PASS**.

Covered gates include:

- public artifact validation and secret/private-key scan;
- Exam Engine / Notes / rich content;
- Content Pack encryption/decryption and publisher signature controls;
- pedagogical review model/patch;
- Verify / Lookup privacy, response limits and worker anti-abuse controls;
- runtime fail-closed and baked/network parity;
- signed neutral-origin authorization positive and negative controls;
- auth/offline lease, content providers and school-server integration;
- device runtime, sleep/resume and PWA hardening;
- Stage 12/12R security regressions and structural AI-RED harness;
- session coordinator, multi-tab smoke and main runtime smoke.

## Explicitly not claimed by this build report

- no physical notebook/iPad/phone acceptance was executed here;
- no live neutral isolated host was provisioned here;
- no live OpenAI/serverless request was executed;
- no pedagogical approval of the real 2027 review pack is implied;
- no claim is made that the school-server/SSO backend exists.

These are external acceptance/configuration gates, not missing core features.
