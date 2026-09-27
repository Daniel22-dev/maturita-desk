# Maturita Desk 1.0.6 — GARP 2.7 migration final audit

## Scope

This audit covers the migration of the supplied Maturita Desk source package to the authoritative **GARP 2.7 consolidated r2 / G-02 FIX** contract while preserving the existing GHRAB Platform 1.1.2, GARP 2.5.1/N5 regression controls, P5 release path, Safe Promotion, exact release identity, protected Content Pack model and query-only Fact Check boundary.

## Input identity

- application input: `maturita-desk-main(6).zip`
- application SHA-256: `f6b71d38972edacb1fbd0a9707166513e89da49278562695d6c56bfa229fc779`
- source commit recorded in archive comment: `4018fdd3f31a4ac372a92ea27af48a76166ff134`
- GARP input: `GARP-2.7-KONSOLIDOVANY-FINAL-r2-G02-FIX(6).zip`
- GARP SHA-256: `0c278aefa0581b3ba13dd5725da9d3fc624976c255602ec16b054fc81da6f7c8`
- canonical package contract check SHA-256: `ddc64e0f88ff82e4af9440a3e8f5dcabafa83eb7ab45bf7efb2d84b4b34f47e5`

The reference package selftest passed **19/19** checks and the contract selftest passed **25/25**, including the G-02 set. A-01 through A-07 are accepted as closed in the supplied reference MASTER.

## Migration result

**Active authority:** GARP 2.7 FOUNDATION  
**Legacy regression authority:** GARP 2.5.1/N5  
**Server phase:** `DEFERRED_BY_OWNER_DECISION`  
**Live school-runtime status:** `NOT_TESTED`

The migration adds:

- the exact consolidated GARP 2.7 reference package under `vendor/garp-2.7-consolidated-r2/`;
- application-specific `security/garp27/garp-policy.json`;
- capability inventory and migration profile;
- architecture policy and import/artifact integrity gate;
- policy-admission negative mutations;
- Maturita Desk boundary mutations for Fact Check, Content Pack, identity/data and Studio dispatch;
- GARP 2.7 auto-patch contract validation;
- a cumulative FOUNDATION gate with machine evidence;
- GARP 2.7 participation in P5 and verified deploy;
- GARP 2.7 FOUNDATION identity in release context, provenance and `release-integrity.json`.

## Regression and security verification

Observed local verification after migration:

- `npm test`: **PASS**;
- public artifact security scan: **PASS**, 0 findings;
- GHRAB Platform 1.1.2 conformance: **PASS**;
- Content Pack crypto + publisher signature regressions: **PASS**;
- Fact Check client/worker anti-abuse and privacy regressions: **PASS**;
- AI-RED structural campaign: **PASS** (24 variants / 6 families, no live-model attempts);
- GARP 2.7 static contract/architecture/mutation/auto-patch suite: **PASS**;
- GARP 2.7 FOUNDATION: **14/14 PASS**, derived status `FOUNDATION_PASS_LIVE_NOT_TESTED`.

The first post-version-bump regression run identified one stale test assertion expecting the old `v1.0.5` cache marker. The production files already used `v1.0.6`; the stale test references were updated and the complete suite was rerun successfully.

## Security boundary conclusions

1. Browser Fact Check remains query-only and cannot directly use a provider API key.
2. The isolated worker remains the only registered AI operation and has bounded request shape, authentication/rate-limit fail-closed behavior and fixed provider egress.
3. `CONFIDENTIAL-EXAM` still requires signed origin authorization and ECDSA P-256 publisher signature; public GitHub Pages remains demo/synthetic-only.
4. Student identity fields remain outside the application data contract.
5. GARP 2.5.1 tooling remains retained solely for regressions; GARP 2.7 is the single active security authority.
6. No school-server SHIELD-LIVE claim is made. Server-dependent controls require later runtime evidence after infrastructure approval.

## Release conclusion

The source candidate is suitable for the existing protected release flow: `candidate -> P5 -> Safe Promotion -> protected main -> verified Pages deploy -> live release verification -> app-updated`.

Local automated evidence is GREEN for the GARP 2.7 FOUNDATION scope. This audit deliberately does **not** convert `NOT_TESTED` school-runtime controls into PASS and does not claim production release signing or live school-server validation.
