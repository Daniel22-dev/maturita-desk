# Maturita Desk 1.0.5 — current build and release report

Software version: **1.0.5**  
GHRAB Platform: **1.1.2**  
Release-path status: **LOCAL 1.0.5 CANDIDATE / automated QA PASS; Safe Promotion + live verification pending**  
Operational product status: **AMBER / controlled pilot**

## 1.0.5 change
- přidána karta **O aplikaci** podle společného vzoru AI Studia / AI Akademie;
- doplněna identita, účel, autor a vývojový garant, školní projekt, určení, technický stav a provozní zásady;
- **Katalog změn** je rozbalovací část uvnitř stránky O aplikaci;
- domovská utility lišta a patička odkazují na O aplikaci;
- záměrně nejsou přidány Podpora, Licence/právní informace ani samostatný blok Práce s daty.

## Current release controls
`candidate → P5 release gate → canonical PR → Safe Promotion → protected main → main P5 → verified GitHub Pages deploy → live release verification → app-updated dispatch → AI Studio auto-patch`.

The protected `main` Ruleset requires `p5-release-gate` and `candidate-to-main`, blocks deletion and force-push, and has no bypass actor.

## GARP / N5
The gate includes GARP 2.5.1 tooling self-tests, source/deployment secret scans, release-chain verification, SBOM/build-provenance checks, Studio manifest verification, and negative controls for private JWK material, encrypted private-key PEM, PGP private-key blocks and encoded private-key classes.

## Release identity
`ghrab-release-integrity-v2` binds app id, version, source commit, exact artifact digest, manifest digest, SBOM, build provenance and security evidence. Live verification must pass before AI Studio receives `app-updated`.

Release signing remains **TRANSITIONAL** until a production release-signing key is provisioned.

## Operational gates still open
- physical notebook/iPad/phone acceptance;
- pedagogical approval of the real maturita Content Pack;
- isolated signed-authorized HTTPS origin for `CONFIDENTIAL-EXAM`;
- live behavioral verification of Ověřit / dohledat if enabled;
- live school-server/SSO validation if that future mode is adopted.

Historical Stage/QA material in `docs/archive/pre-1.0.4/` is regression context only, not current 1.0.5 release evidence. 1.0.5 has local automated QA PASS; protected promotion and live deployment evidence are still pending.
