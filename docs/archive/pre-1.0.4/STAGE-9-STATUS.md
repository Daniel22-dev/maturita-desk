# Maturita Desk — Stage 9 status

**Verze aplikace:** 0.7.0  
**Etapa:** Isolated Fact Check  
**Public shell:** SYNTHETIC-ONLY

## Implementováno

- samostatný `FactCheckProvider` modul;
- runtime-config endpoint bez secretu;
- query-only privacy boundary;
- nepersistovaný Fact Check stav;
- responsive drawer/sheet pro iPad, telefon a desktop;
- loading, cancel, error a source-aware result UX;
- serverless OpenAI web-search proxy reference;
- exact Origin allowlist;
- body/query limits;
- upstream `store: false`;
- structured verdict;
- fail-closed při chybějících zdrojích;
- volitelný serverový rate limiter;
- client + worker automated negative controls.

## Neimplementováno / otevřené

- skutečně nasazený proxy endpoint;
- serverový API secret v cílové infrastruktuře;
- live OpenAI integrační test;
- finální školní autentizace Fact Check endpointu (patří do server/auth etapy);
- reálný iPad/telefon browser gate.

## Release verdict Stage 9

**TECHNICAL_READY_FOR_PROXY_DEPLOYMENT**

Stage 9 je dokončená jako aplikační a serverless reference vrstva. Nelze ji označit za live Fact Check release, dokud není proxy nasazena, zabezpečena a otestována na cílových zařízeních.
