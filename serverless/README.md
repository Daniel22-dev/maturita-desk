# Maturita Desk — Ověřit / dohledat (serverless + school-server)

Tato složka obsahuje referenční edge Worker pro funkci **Ověřit / dohledat**. Veřejná PWA nikdy neobsahuje OpenAI API klíč a nikdy neposílá automaticky téma, Teacher Guidance, Notes, Content Pack ani identitu studenta. Do backendu jde pouze explicitně napsané pole `query`.

## Dva podporované autorizační režimy

Worker se záměrně spustí pouze v právě jednom z následujících režimů. Pokud není nakonfigurován žádný nebo jsou omylem nakonfigurovány oba, fail-closed vrací `NOT_CONFIGURED`.

### 1. Dočasný serverless režim — učitelský přístupový kód

Určeno pro období před školním serverem.

Serverové secrets/bindings:
- `OPENAI_API_KEY` — OpenAI API secret;
- `FACTCHECK_ACCESS_TOKEN` — silný náhodný přístupový kód, min. 32 znaků;
- `FACTCHECK_RATE_LIMITER` — povinný rate limiter;
- `ALLOWED_ORIGINS` — přesný origin Maturita Desk;
- `OPENAI_FACTCHECK_MODEL` — volitelně model, výchozí `gpt-5.6-terra`.

Učitel vloží `FACTCHECK_ACCESS_TOKEN` do UI **Ověřit / dohledat**. Aplikace jej drží pouze v `sessionStorage` daného panelu a posílá v hlavičce `X-Maturita-Desk-Access`. Token se nesmí vložit do GitHubu, `runtime-config.js`, URL ani do logů. Při podezření na únik se okamžitě rotuje.

Tento režim je dočasná serverless autentizace, nikoli náhrada individuálního školního SSO. Sdílený kód nerozlišuje jednotlivé učitele.

### 2. Budoucí school-server / inner-gate režim

Serverové secrets/bindings:
- `OPENAI_API_KEY`;
- `FACTCHECK_GATE_TOKEN` — server-to-server secret, min. 32 znaků;
- `FACTCHECK_RATE_LIMITER`;
- `ALLOWED_ORIGINS`.

Browser gate token nikdy nezná. Autentizovaná školní/edge gateway ověří učitele a teprve server-side přidá `X-Maturita-Desk-Gate`.

## Funkční kontrakt

- request body je výhradně `{ "query": "..." }`;
- maximální délka query: 700 znaků;
- vždy se vyžaduje web search;
- odpověď obsahuje krátké české vysvětlení, jistotu a max. 6 HTTPS zdrojů;
- přímý informační dotaz používá verdict `informational` (UI: **Dohledáno**);
- tvrzení používá `confirmed`, `inaccurate`, `mixed`, `uncertain` nebo `not_verifiable`;
- bez dohledatelného webového zdroje nesmí služba vrátit pozitivní faktický verdikt;
- OpenAI request používá `store: false`;
- request i response mají byte limity;
- selhání služby nikdy nesmí zastavit Exam Engine ani časomíru.

## Public GitHub profil

Repozitář se záměrně vydává s prázdným `factCheck.endpoint`. Samotné nahrání ZIPu na GitHub tedy nevytvoří placený veřejný endpoint. Po nasazeni serverless funkce se preferuje same-origin endpoint (napr. `/api/fact-check`) podle `runtime-config.serverless-fact-check.example.js`. Public build zustava bez endpointu, dokud sluzba neni ziva.
