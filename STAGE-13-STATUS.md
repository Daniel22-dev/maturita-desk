# Stage 13R — Serverless / Internal Review Candidate

Verze: **0.10.1**  
Stav: **READY FOR USER + DEVICE REVIEW / PRODUCTION GATE OPEN**

## Účel 13R

Stage 13R uzavírá kandidáta, který lze bezpečně nahrát do veřejného GitHub repozitáře a současně použít na notebooku pro interní revizi reálného šifrovaného obsahu bez vložení tohoto obsahu do GitHubu.

## Veřejný GitHub Pages profil

- klasifikace běhu: **SYNTHETIC-ONLY**;
- `CONFIDENTIAL-EXAM` je při importu/odemčení odmítnut;
- žádný reálný `.mdesk`, heslo ani API secret nejsou součástí balíku;
- ruční encrypted-local Content Pack workflow zůstává zachováno;
- `Ověřit / dohledat` má endpoint záměrně prázdný, dokud nebude samostatně nasazena chráněná serverless služba.

## Lokální interní review profil

Při spuštění přes `START-MATURITA-DESK-INTERNAL.cmd` na `127.0.0.1` / `localhost` se aktivuje explicitní interní režim:

- lze importovat `SYNTHETIC-DEMO` i `CONFIDENTIAL-EXAM`;
- reálný Content Pack zůstává samostatný, šifrovaný a mimo repozitář;
- přístupová fráze se neukládá;
- tento režim slouží k obsahové, UX a zařízení revizi, nikoli jako finální produkční distribuce.

## Změny v 0.10.1

1. Opraven skutečný browserový problém ručního importu Content Packu z draweru; přidán regresní test `content-import-bridge.test.mjs`.
2. Přidán bezpečný localhost-only interní review režim pro reálný `CONFIDENTIAL-EXAM` pack.
3. Serverless provoz je explicitně veden jako podporovaná cesta i před existencí školního serveru.
4. `Fact Check` je v UX rozšířen na **Ověřit / dohledat** pro ověřování tvrzení i přímé informační dotazy.
5. Query-only privacy boundary zůstává zachována: bez automatického tématu, zadání, Teacher Guidance, Notes nebo identity studenta.
6. Připraven dočasný serverless edge režim s `FACTCHECK_ACCESS_TOKEN`, rate limiterem a OpenAI klíčem pouze jako serverovým secretem.
7. Budoucí school-server inner-gate režim zůstává podporován; worker fail-closed odmítne nejasnou konfiguraci obou auth režimů současně.
8. Stage 13 multi-tab guard, lifecycle/PWA instrumentace, offline režim a Pilot report zůstávají zachovány.

## Co stále není uzavřeno

- fyzický iPad/Safari acceptance;
- fyzický telefon acceptance;
- reálný Service Worker update/recovery drill;
- celá 15minutová relace na cílových zařízeních;
- pedagogická revize reálného Content Packu;
- publisher signature pro finální ostrý pack;
- izolovaný produkční origin pro ostrý serverless release;
- živé nasazení serverless `Ověřit / dohledat` endpointu;
- školní server/SSO (není podmínkou pro budoucí serverless 1.0.0, ale zůstává připravenou variantou).

## Gate

| Oblast | Stav |
|---|---|
| Build / syntax / unit regression | **PASS po finálním balení** |
| Public-shell leak gate | **PASS po finálním balení** |
| GitHub-safe public policy | **PASS po finálním balení** |
| Content Pack import regression | **PASS po finálním balení** |
| Query-only Ověřit / dohledat | **PASS po finálním balení** |
| Localhost confidential-review gate | **PASS po finálním balení** |
| Physical notebook/iPad/phone acceptance | **PENDING** |
| Pedagogický gate reálného obsahu | **PENDING** |
| Produkční serverless release | **NO-GO do uzavření výše uvedených gate** |

Stage 13R není souhlas s uložením reálného Content Packu na sdílený GitHub Pages origin a není produkční 1.0.0.
