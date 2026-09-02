# Maturita Desk 0.10.0 — Stage 13 build report

## Cíl

Převést bezpečnostně ověřený 0.9.2 kandidát do řízeného **syntetického device pilotu** bez použití ostrého obsahu a bez předstírání fyzických testů, které zde nelze provést.

## Hlavní změny

- nový `src/pilot.js`: pilotní model, 18 scénářů, lokální metriky, JSON/TXT report;
- nový `src/session-coordinator.js`: writer lease proti destruktivnímu multi-tab last-write-wins;
- `main.js`: Pilot panel, automatic import/unlock timings, lifecycle/SW/concurrency events, explicit takeover;
- hard gate `SYNTHETIC-DEMO` pro Stage 13; `CONFIDENTIAL-EXAM` je blokovaný;
- service worker cachuje nové runtime moduly a používá cache v0.10.0;
- nový syntetický ~30 MiB stress pack je distribuován samostatně mimo public app ZIP;
- nový BroadcastChannel runtime smoke test skutečně spouští cestu, která byla v Stage 12R mocku vypnutá.

## Nově nalezená a opravená integrační chyba

Původní inicializace volala multi-tab setup před inicializací proměnné `sessionChannel`. Dokud byl `BroadcastChannel` v testu `undefined`, větev se neprovedla. Stage 13 test se skutečným BroadcastChannel stubem tuto cestu aktivoval a odhalil TDZ/initialization-order problém. Stav koordinátoru je nyní inicializován před bootstrapem aplikace.

## Co build netvrdí

- žádný skutečný Safari/iPad test zde nebyl proveden;
- žádný reálný multi-tab race na Safari zde nebyl proveden;
- žádný reálný Service Worker update/recovery na Safari zde nebyl proveden;
- žádný ostrý Content Pack nebyl použit;
- žádná skutečná studentská data nebyla použita;
- Fact Check nemá v public profilu živý endpoint.

## Release postup

Finální Stage 13 ZIP se vytvoří až po kompletním `npm test`, security scan a syntaktické kontrole. Poté se ZIP pouze read-only rozbalí do čistého adresáře, testy se zopakují a teprve na neměnném ZIPu se vytvoří finální SHA-256.


## Automatický test po implementaci

Kompletní `npm test`: **PASS**.

- Stage 13 validator: PASS;
- artifact security scan: PASS, 0 nálezů;
- všechny Stage 3–12R regresní testy: PASS;
- pilot model: PASS;
- session coordinator: PASS;
- runtime BroadcastChannel/multi-tab guard smoke: PASS;
- actual `main.js` Fact Check canary: PASS;
- main runtime smoke: PASS.

Samostatný Stage 13 stress pack má 30 969 778 B (~29,54 MiB), klasifikaci `SYNTHETIC-DEMO`, 20 témat a SHA-256 `2432e88d1c2485919c0560661f0a25afda73ed55ad3f64d52dba3faab0a0d4bb`. Kontrolní Node prostředí jej parse/decrypt zvládlo; tento údaj není náhradou za měření Safari na iPadu.


## Browser smoke

Stage 13 Playwright scénář byl spuštěn proti `http://127.0.0.1:8765/`, ale Chromium bylo zablokováno politikou prostředí chybou `ERR_BLOCKED_BY_ADMINISTRATOR` před prvním načtením stránky. Browser smoke proto zůstává `BLOCKED/NOT PASS`; důkaz je v `preview/browser-smoke-stage13.log`.
