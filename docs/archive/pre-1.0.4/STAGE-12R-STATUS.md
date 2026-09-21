# Stage 12R — Independent-audit remediation

Verze: **0.9.2**  
Klasifikace: **SYNTHETIC-ONLY / SECURITY RE-AUDIT CANDIDATE**

## Stav nálezů z nezávislé kontroly 0.9.1

| ID | Stav 0.9.2 | Poznámka |
|---|---|---|
| B-01 | **REMEDIATED IN RELEASE PROCESS** | Finální ZIP a `.sha256` se vytvářejí v závěrečném immutable kroku; přesný pár musí znovu ověřit nezávislý auditor. |
| B-02 | **FIXED** | Streamovaný byte cap; žádný neomezený `response.text()` fallback. |
| B-03 | **FIXED** | School-server bez logout endpointu je invalid/locked; success pouze po `response.ok`. |
| N-01 | **FIXED** | Release-pinned expected mode/environment/app origin + viditelný config fallback warning. |
| N-02 | **FIXED** | Důvěryhodné originy pocházejí z baked release profilu; network config je může jen zúžit. |
| N-03 | **FIXED BY ARCHITECTURE** | Worker vyžaduje server-side gateway secret + rate limiter. Direct anonymous browser→worker deployment je odmítnut. |
| N-04 | **OPEN / DOCUMENTED** | Offline lease není hardware-bound a spoléhá na systémový čas. |
| N-05 | **MITIGATED / DEVICE GATE OPEN** | Limit envelope snížen na 32 MiB; fyzický Safari/iPad výkon ještě nebyl změřen. |
| N-06 | **FIXED** | `topic.id` pouze number 1–20 + escaped attribute rendering. |
| N-07 | **OPEN / DOCUMENTED** | Multi-tab je warning, nikoli lock; reálný race zůstává Stage 13/device test. |
| N-08 | **FIXED** | Offline app-shell fallback jen pro root/index; deep path při offline failuje kontrolovaně. |
| N-09 | **FIXED EVIDENCE GAP** | AI-RED doplněn o skutečný `main.js` call-site se stavovými canary. |

## Automatické ověření

- `npm test`: **PASS**;
- public-shell/security scan: **PASS**;
- streamed response cap regressions: **PASS**;
- Claude Stage 12 finding regressions: **PASS**;
- AI-RED structural/provider: **24/24 / 6 families**;
- actual `main.js` Fact Check call-site canary: **PASS**, payload přesně `{query}`;
- behaviorální live-model AIR: **NOT TESTED / ASR N/A**;
- live school server/IdP: **NOT CONNECTED / NOT TESTED**;
- real Safari/iPad/device lifecycle: **NOT TESTED** v tomto prostředí;
- exact-SHA independent re-check: **PENDING**.

## Gate

| Gate | Stav |
|---|---|
| Security | **AMBER** |
| Privacy | **AMBER** |
| Red Team | **AMBER** |
| Release Integrity | **AMBER — self-verified, independent re-check pending** |
| Overall | **AMBER** |

Stage 12R nemění dokumentované provozní dluhy na PASS. Kandidát je připraven pro druhou nezávislou kontrolu, nikoli pro ostrou maturitu.

**REÁLNÁ STUDENTSKÁ DATA: NEPOUŽÍVAT**  
**TESTOVACÍ PROVOZ POUZE SE SYNTETICKÝMI DATY**
