# Maturita Desk 0.9.2 — Stage 12R independent-audit remediation review

Datum: 2026-09-01  
Vstupní nezávislý audit: Claude / role B, nad artefaktem Stage 12, který auditor identifikoval hashem `73d59fb5f304a2176c481b04e838b41cff6d5fc2e7f21ce6fe8688ac9d479452`.

## 1. Jak byly nálezy posuzovány

Každý nález byl znovu ověřen proti zdrojům 0.9.1 a/nebo reprodukován testem. Stage 12R nesměřuje k „vynulování“ auditu; rozlišuje:

- **FIXED** — problém je v kódu uzavřen a má regresní kontrolu;
- **FIXED BY ARCHITECTURE** — rizikový způsob nasazení je záměrně zakázán a podporovaný tok má novou trust boundary;
- **MITIGATED / OPEN DEVICE GATE** — technická plocha je významně zmenšena, ale bez fyzického cílového zařízení nelze vydat PASS;
- **OPEN / DOCUMENTED** — omezení je reálné a zůstává v debt registru.

## 2. Nálezy nezávislého auditu

### B-01 — Release integrity / ACCEPTED, process remediated

Auditovaný ZIP neodpovídal předanému `.sha256`. Interní opětovný výpočet potvrdil skutečný hash vstupního ZIPu `73d59fb5...`; starý checksum byl chybný/stale. Toto nebyla chyba kryptografie aplikace, ale tvrdá chyba release evidence.

Stage 12R zavádí immutable packaging postup. Finální 0.9.2 ZIP se vytvoří až po dokončení všech souborů. SHA se počítá až poté a čistý retest pracuje pouze s read-only rozbalením stejného ZIPu. Finální release-integrity PASS je ale možné vydat až po externím opětovném ověření stejného SHA.

### B-02 — Response body cap / FIXED

Původní implementace používala při chybějícím `Content-Length` `response.text()` a limit kontrolovala až po materializaci celého body. V 0.9.2 je společný `src/net/read-limited.js`, který čte `ReadableStream` po chunkech a při překročení limitu reader zruší. Pokud stream není k dispozici, failuje bezpečně a `response.text()` nepoužije.

Pokryto pro:
- Fact Check klient;
- school-session AuthProvider;
- school ContentProvider;
- request body a OpenAI upstream v referenčním workeru.

Regrese: `tests/response-limits.test.mjs`, `tests/claude-stage12-findings.test.mjs`.

### B-03 — Logout without endpoint / FIXED

`logoutEndpoint` je v `school-server` profilu povinný. Jeho absence vede do `locked` runtime a `createSchoolServerAuthProvider()` takovou konfiguraci nevytvoří. Interní `confirmed` začíná `false` a true vzniká pouze po úspěšné serverové odpovědi.

Regrese: `tests/auth-provider.test.mjs`, `tests/runtime-config.test.mjs`, `tests/claude-stage12-findings.test.mjs`.

### N-01 — Unavailable runtime config fail-open / FIXED

Baked profil je nyní explicitní release trust anchor:
- `trust.expectedMode`;
- `trust.expectedEnvironmentId`;
- `trust.appOrigins`.

Před network fetch se kontroluje, zda aplikace běží na release-pinned originu. Veřejný standalone build zkopírovaný na cizí/školní origin proto skončí `locked`, nikoli local-device fallbackem. Při legitimním network výpadku na správném originu může aplikace použít baked profil, ale UI zobrazí `configurationLoadError` a viditelný warning.

### N-02 — Circular allowedOrigins trust / FIXED

Network `deployment.json` už není autoritou pro přidání nových důvěryhodných originů. Trust allowlist se vezme z baked release profilu a síťový config jej může pouze zúžit. Endpoint origin kontrola platí i pro `standalone-local` Fact Check provider.

Hostile config, který si sám deklaruje `https://attacker.example` a nasměruje tam auth/content/fact endpointy, končí `locked`.

### N-03 — Origin-only paid gateway / FIXED BY ARCHITECTURE

Origin zůstává doplňková browser protection, nikoli autentizace. Referenční Fact Check worker nově vyžaduje:
- `FACTCHECK_GATE_TOKEN` minimálně 32 znaků;
- validní `X-Maturita-Desk-Gate` request header;
- funkční `FACTCHECK_RATE_LIMITER`;
- povolený browser Origin tam, kde je relevantní.

Gate token je **server-side secret** a nesmí být ve veřejné PWA. Podporovaný model je school/authenticated edge → inner Fact Check worker, kde edge po vlastní autorizaci přidá gate header. Přímý anonymní browser→worker deployment je záměrně odmítnut.

`/health` už neprozrazuje `configured` a je chráněn gate kontrolou.

### N-04 — Offline lease clone / OPEN, DOCUMENTED

Nález potvrzuje známou hranici: browser-local `installationId` není hardware binding a při plné kontrole storage lze klonovat; offline expirace spoléhá na systémový čas. Stage 12R toto nepřejmenovává na FIXED. Produkční mitigace patří do MDM/WebAuthn/device-bound nebo online-auth architektury.

### N-05 — 120 MiB import ceiling / MITIGATED, DEVICE GATE OPEN

Limit encrypted envelope byl snížen na **32 MiB**. Reálný interní encrypted pack má přibližně 21 MiB, takže vzniká rozumná rezerva bez 120MiB extrému.

Tím se významně omezuje memory/CPU DoS plocha, ale neprokazuje se plynulost importu na konkrétní generaci iPadu/Safari. Pokud Stage 13 ukáže UI stall/memory pressure, dalším krokem je Worker-based decrypt/parse nebo jiný packaging model.

### N-06 — String topic.id / FIXED

Validator vyžaduje `typeof topic.id === 'number'`, integer a rozsah 1–20. String `"01"` je odmítnut. Hodnota `data-topic` je navíc escapována při renderování.

### N-07 — Multi-tab collision / OPEN, DOCUMENTED

BroadcastChannel je pouze varování, ne distribuovaný lock. Stage 12R tento fakt zachovává jako otevřený provozní dluh. Reálný SIM-04 race musí proběhnout ve Stage 13; podle výsledku se rozhodne o leader lock/epoch/transaction strategii.

### N-08 — Deep route navigation fallback / FIXED

Místo vložení globálního `<base>` je opravena samotná offline navigační politika. Service worker vrátí cached app shell pouze pro kanonický root nebo `index.html`. Arbitrary deep path offline vrací kontrolovanou 503, takže nevzniká falešně načtený shell, který by následně hledal moduly/config relativně k neexistující deep cestě.

### N-09 — AI-RED harness evidence gap / FIXED

Původní provider-only harness zůstává užitečný, ale nestačil k tvrzení o skutečném call-site. `tests/main-runtime-smoke.mjs` proto naplní skutečný stav aplikace canary hodnotami v:
- topicu;
- Notes;
- session;
- pack/runtime kontextu.

Poté vyvolá skutečný Fact Check submit z `main.js`, zachytí request body a ověří přesně jediný klíč `query` a nulový výskyt canary hodnot.

## 3. Pozitivní nálezy z nezávislého auditu, které zůstávají zachovány

Stage 12R nemění již ověřené silné části:
- textová XSS escaping boundary;
- zákaz SVG/externích confidential médií;
- AES-256-GCM + AAD + PBKDF2-SHA-256 Content Pack;
- query-only Fact Check egress;
- encrypted-only IndexedDB a memory-only decrypted pack/passphrase;
- nulová produkční tajemství/PII v public shellu;
- poctivé označování browser/live-server/live-model mezer jako NOT TESTED.

## 4. Gate po opravách

Stage 12R je **AMBER**.

Není znám potvrzený neopravený CRITICAL/HIGH kódový exploit z předaného auditního seznamu. Přesto nelze vydat GREEN, dokud nejsou uzavřeny skutečné device/server/release důkazy a behaviorální live-provider test. Release integrity 0.9.2 je interně self-verified až po final packaging kroku a musí ji znovu potvrdit nezávislý auditor nad přesným SHA.

## 5. Co má nezávislý auditor v druhém kole udělat

1. Nejdřív ověřit SHA-256 finálního 0.9.2 ZIPu proti externímu `.sha256`.
2. Znovu spustit `npm test`.
3. Zopakovat původní PoC pro B-02, B-03, N-01, N-02, N-03, N-05, N-06 a N-08.
4. Prověřit novou streaming helper boundary a její failure behavior bez streamu.
5. Ověřit, že gateway secret není ve veřejném JS/configu a že forged Origin bez gate nevolá upstream.
6. Ověřit nový actual-app-state Fact Check canary test, ne pouze provider mock.
7. Potvrdit, že N-04 a N-07 jsou stále otevřené a dokumentace je nepřeceňuje.
8. Vydat nový Security/Privacy/Red Team/Release Integrity/Overall verdict pro přesný 0.9.2 SHA.
