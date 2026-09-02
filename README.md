# Maturita Desk 0.10.1 — Stage 13R Serverless / Internal Review Candidate

Maturita Desk je učitelská PWA pro přípravu a průběh ústní maturitní zkoušky z anglického jazyka. Verze **0.10.1** je kandidát určený k uživatelskému a zařízení testování před produkčním serverless releasem.

## Dva bezpečně oddělené způsoby spuštění téhož balíku

### 1. Veřejný GitHub Pages build

Repozitář lze bezpečně zveřejnit. Neobsahuje reálný maturitní Content Pack, přístupovou frázi ani OpenAI API klíč. Na `daniel22-dev.github.io` zůstává ochrana **SYNTHETIC-ONLY** a `CONFIDENTIAL-EXAM` Content Pack je odmítnut.

### 2. Lokální interní revize na notebooku

Stejný balík lze spustit přes `START-MATURITA-DESK-INTERNAL.cmd`. Pouze na `localhost` / loopback adrese se aktivuje interní review režim, který dovolí ručně importovat samostatně držený šifrovaný `CONFIDENTIAL-EXAM` Content Pack. Reálný pack ani heslo nejsou součástí tohoto repozitáře a nesmí se na GitHub nahrát.

Tento režim je určen pro interní obsahové, UX a zařízení testování. Reálný obsah 2027.0.1-review stále vyžaduje pedagogickou revizi a není tímto releasem schválen pro ostrou maturitu.

## Serverless je plnohodnotná cílová cesta

Maturita Desk nemusí čekat na školní server. Core aplikace — Exam, Practice, Pictures, Task Box, Topic, Notes, časování, PWA/offline režim a lokálně šifrovaný Content Pack — je navržena pro `standalone-local` provoz.

Budoucí školní server má přidat zejména SSO, centrální autorizaci a automatickou distribuci šifrovaného obsahu; nemá být podmínkou pro základní používání aplikace.

## Ověřit / dohledat

Původní Fact Check je v UI rozšířen a přejmenován na **Ověřit / dohledat**. Učitel může přímo v Maturita Desk:

- ověřit tvrzení pronesené studentem;
- rychle dohledat aktuální faktickou informaci;
- zobrazit krátkou odpověď, míru jistoty a webové zdroje bez otevírání Google nebo další aplikace.

Soukromí je fail-closed: do online služby se odesílá pouze text, který učitel výslovně napíše do pole `query`. Téma, zadání, Teacher Guidance, Notes, Content Pack ani identita studenta se automaticky neposílají.

Public ZIP má endpoint záměrně prázdný. Samotné nahrání na GitHub tedy nevytvoří placenou AI bránu. Pro dobu před školním serverem je připraven samostatný edge/serverless Worker s OpenAI klíčem uloženým pouze jako serverový secret, povinným rate limiterem a dočasným učitelským přístupovým tokenem. Postup je v `serverless/SERVERLESS-FACT-CHECK-SETUP.txt`.

## Stage 13R acceptance

Automatické testy nenahrazují fyzickou akceptaci. Stále je třeba ověřit zejména notebook/iPad/telefon, 15minutovou relaci, background/lock/reopen, multi-tab ochranu, Service Worker update/recovery, offline cold start a výkon velkého syntetického packu.

Podrobnosti jsou v `STAGE-13-STATUS.md`, `STAGE13-PILOT-NAVOD.txt` a `DEVICE-PILOT-CHECKLIST.txt`.
