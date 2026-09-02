# Maturita Desk — Fact Check inner proxy (Stage 13; security baseline Stage 12R)

Tato složka je **serverová reference**, ne kód s API klíčem. Veřejná PWA nikdy nevolá OpenAI přímo.

## Důležitá změna Stage 12R

Worker už **nesmí být anonymní placená brána chráněná pouze CORS/Origin hlavičkou**. Stage 12R proto vyžaduje současně:

- `OPENAI_API_KEY` jako serverový secret;
- `FACTCHECK_RATE_LIMITER` jako povinnou serverovou vazbu;
- `FACTCHECK_GATE_TOKEN` jako minimálně 32znakový serverový secret;
- přesný `ALLOWED_ORIGINS` jako doplňkovou browserovou ochranu.

Bez kteréhokoli z prvních tří prvků endpoint fail-closed vrací `NOT_CONFIGURED`. Bez správného gate tokenu vrací `AUTH_REQUIRED` a OpenAI upstream se nevolá.

**FACTCHECK_GATE_TOKEN se nesmí vložit do veřejného runtime-config.js, HTML ani JS.** Proto tento Worker není určen k přímému anonymnímu volání z GitHub Pages. Má být vnitřní downstream za autentizovaným edge/school gateway, který gate hlavičku doplní server-side. Dokud taková vrstva neexistuje, Fact Check zůstává v public PWA nenakonfigurován.

## Bezpečnostní hranice

- aplikační klient posílá své důvěryhodné gateway vrstvě pouze JSON `{ "query": "..." }`;
- proxy odmítá jakákoli další pole;
- `OPENAI_API_KEY` a `FACTCHECK_GATE_TOKEN` jsou pouze serverové secrety;
- těla requestů i upstream odpovědí mají **streamovaný byte cap** — limit se nevynucuje až po načtení celého chunked body;
- odpovědi OpenAI používají `store: false`;
- pro každý dotaz se vyžaduje web search;
- proxy vrací maximálně šest HTTPS zdrojů;
- `.mdesk`, Notes ani session storage nejsou tímto endpointem dostupné;
- `/health` neprozrazuje stav konfigurace a je chráněný gate kontrolou;
- `Origin` je pouze doplňková CORS hranice, nikoli autentizace.

## Bezpečný deployment

Doporučené varianty jsou dvě:

1. **Školní server / School Gateway** — preferovaná cílová architektura. Učitel je ověřen cookie session a školní gateway volá tento downstream server-side.
2. **Autentizovaný edge gateway** — např. samostatná přístupová vrstva, která ověří školní identitu a teprve potom server-side přidá `X-Maturita-Desk-Gate` při volání tohoto Workeru.

Nedoporučeno a Stage 12R záměrně nepodporuje: veřejná PWA -> přímo veřejný Worker -> OpenAI pouze s CORS allowlistem.

## Secrets / bindings

- `OPENAI_API_KEY` — secret;
- `FACTCHECK_GATE_TOKEN` — secret, min. 32 znaků;
- `FACTCHECK_RATE_LIMITER` — povinná binding/služba;
- `ALLOWED_ORIGINS` — přesný browser origin gateway/PWA podle deploymentu;
- `OPENAI_FACTCHECK_MODEL` — volitelný model.

## Budoucí školní server

PWA komunikuje přes abstrakci `FactCheckProvider`, takže přechod na školní server nemění Exam Engine ani UI. Ve školním profilu se používá cookie session a same-origin School Gateway; gate token zůstává čistě serverový detail mezi backendovými vrstvami.
