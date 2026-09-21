# Maturita Desk 1.0.4 — final audit baseline

## Current release invariants

- durable pre-production branch: `candidate`;
- protected production branch: `main`;
- canonical promotion: `candidate -> main` PR only;
- required checks: `p5-release-gate` and `candidate-to-main`;
- deletion and force-push blocked; no bypass actor;
- missing/stale promotion credentials fail closed;
- production deploy accepts only a GREEN `main` P5;
- `ghrab-release-integrity-v2` binds version, source SHA, exact artifact
  digest, manifest, SBOM, provenance and security evidence;
- live release verification precedes `app-updated`;
- AI Studio auto-patch accepts only higher patch versions on the enrolled 1.0.x
  line, requires live deployment evidence and blocks rollback/minor/major;
- Studio ingest mutates `candidate`, never `main` directly;
- duplicate/concurrent ingest is serialized and stale persistence is rejected;
- N5 secret scanning covers JWK private material, encrypted private-key PEM,
  PGP private-key blocks and encoded/private-key variants.

## Product-status boundary

GREEN release infrastructure does not equal approval for real confidential exam
operation. The public GitHub Pages build remains demo/synthetic-only.
`CONFIDENTIAL-EXAM` still requires an isolated signed-authorized HTTPS origin,
physical-device acceptance and pedagogical approval of the exact Content Pack.

Optional live Fact Check and future school-server mode retain their own
operational acceptance gates.

## Evidence hygiene

Historical Stage and pre-1.0.4 reports live under
`docs/archive/pre-1.0.4/`. They are regression context, not current GREEN
release evidence. Current root documentation describes 1.0.4.
