# Maturita Desk 1.0.6 — current build and release report

Software version: **1.0.6**  
GHRAB Platform: **1.1.2**  
Release-path status: **LOCAL 1.0.6 CANDIDATE / automated QA PASS; Safe Promotion + live verification pending**  
Operational product status: **AMBER / controlled pilot**

## 1.0.6 change
- přidána karta **O aplikaci** podle společného vzoru AI Studia / AI Akademie;
- doplněna identita, účel, autor a vývojový garant, školní projekt, určení, technický stav a provozní zásady;
- **Katalog změn** je rozbalovací část uvnitř stránky O aplikaci;
- domovská utility lišta a patička odkazují na O aplikaci;
- záměrně nejsou přidány Podpora, Licence/právní informace ani samostatný blok Práce s daty.

## Current release controls
`candidate → P5 release gate → canonical PR → Safe Promotion → protected main → main P5 → verified GitHub Pages deploy → live release verification → app-updated dispatch → AI Studio auto-patch`.

The protected `main` Ruleset requires `p5-release-gate` and `candidate-to-main`, blocks deletion and force-push, and has no bypass actor.

## GARP 2.7 / legacy N5
Aktivní bezpečnostní kontrakt je **GARP 2.7 FOUNDATION**. Kandidát obsahuje přesný konsolidovaný referenční balík `2026-09-23-r2` s G-02 fixem, aplikační policy, capability inventory, architecture-integrity gate, policy/application mutation testy a auto-patch contract gate. Původní GARP 2.5.1/N5 tooling zůstává povinnou regresní baseline a není druhou aktivní autoritou.

Lokální FOUNDATION audit prošel **14/14** kroky se stavem `FOUNDATION_PASS_LIVE_NOT_TESTED`. Serverově závislé kontroly zůstávají `DEFERRED_BY_OWNER_DECISION` / `NOT_TESTED`, dokud nebude schválen cílový školní runtime.

## Release identity
`ghrab-release-integrity-v2` binds app id, version, source commit, exact artifact digest, manifest digest, SBOM, build provenance and security evidence. Live verification must pass before AI Studio receives `app-updated`.

Release signing remains **TRANSITIONAL** until a production release-signing key is provisioned.

## Operational gates still open
- physical notebook/iPad/phone acceptance;
- pedagogical approval of the real maturita Content Pack;
- isolated signed-authorized HTTPS origin for `CONFIDENTIAL-EXAM`;
- live behavioral verification of Ověřit / dohledat if enabled;
- live school-server/SSO validation if that future mode is adopted.

Historical Stage/QA material in `docs/archive/pre-1.0.4/` is regression context only, not current 1.0.6 release evidence. 1.0.6 has local automated QA PASS; protected promotion and live deployment evidence are still pending.
