# Maturita Desk 1.0.0 — Serverless Final Build Report

Software baseline: **FEATURE-COMPLETE SERVERLESS 1.0.0**  
Automated regression/security suite: **PASS**  
Physical / pedagogical / live-service acceptance: **PENDING**

## Release changes against 0.10.1

- application, manifest and PWA cache version raised to 1.0.0;
- normal serverless use no longer depends on the temporary localhost/`.cmd` review workflow; the launcher and browser import bridge hotfix were removed from the final public package;
- Content Pack file change handling is now directly delegated at `document` level;
- introduced pinned isolated confidential-content origin `https://maturita.ghrabuvka.cz`;
- shared `https://daniel22-dev.github.io` origin remains shell/demo-only for confidential content;
- added `maturita-desk-publisher-signature-v1`, ECDSA P-256 + SHA-256;
- `CONFIDENTIAL-EXAM` requires a valid publisher signature under a baked public trust key;
- Content Provider checks origin policy and publisher signature before encrypted storage/use;
- network runtime configuration may narrow publisher trust but cannot add/replace baked publisher keys;
- private publisher key patterns are forbidden by validation/security scan and `.gitignore`;
- added public key generation/sign/verify tooling; private key is never generated into or bundled with the public repository by default;
- retained encrypted-local IndexedDB, password re-unlock, Exam/Practice, Notes, offline shell, lifecycle recovery and multi-tab writer guard;
- `Ověřit / dohledat` remains query-only and supports protected serverless teacher-token mode or future school-server inner gate;
- future school-server reference now preserves publisher signature policy.

## Automated verification executed

Full `npm test` on the 1.0.0 working tree: **PASS**.

Covered gates include:

- final 1.0.0 artifact validation;
- public artifact secret/private-key scan + negative controls;
- Exam Engine / Notes / rich content;
- Content Pack encryption/decryption, malicious KDF control, publisher signing/verification/tamper controls;
- pedagogical review model/patch;
- Ověřit / dohledat client, response byte caps, worker auth/privacy/rate-limit controls;
- runtime fail-closed, baked/network parity and final origin/publisher trust profile;
- auth/offline lease, content providers and school-server integration;
- device runtime, sleep/resume and PWA hardening;
- Stage 12/12R security regressions and structural AI-RED harness;
- local device diagnostics model;
- session coordinator / real main multi-tab smoke;
- real main runtime smoke including query-only egress canaries.

## Explicitly not claimed by this build report

- no physical iPad/phone acceptance was executed in this build environment;
- no live production custom domain was configured from this build environment;
- no live OpenAI/serverless edge request was executed; the public endpoint ships intentionally empty;
- no pedagogical approval of the real 2027 review pack is implied;
- no claim is made that the school-server/SSO backend exists.

These are external acceptance/configuration gates, not planned missing core features in the 1.0.0 application baseline.
