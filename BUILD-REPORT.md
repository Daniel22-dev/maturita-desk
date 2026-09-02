# Maturita Desk 0.10.1 — Stage 13R build report

## Cíl

Vytvořit jeden GitHub-safe update kandidát, který:

- zachová veřejný build synthetic-only;
- umožní na localhostu interně testovat reálný šifrovaný Content Pack;
- opraví potvrzenou chybu ručního importu Content Packu;
- zachová Stage 13 device/PWA/multi-tab instrumentaci;
- připraví pohodlný serverless provoz před existencí školního serveru;
- rozšíří online pomoc na **Ověřit / dohledat** bez úniku kontextu zkoušky.

## Hlavní změny

- `src/content-import-bridge.js` + regresní test opravují browserový import z body-level draweru;
- localhost-only `PILOT_INTERNAL_REVIEW` dovoluje `CONFIDENTIAL-EXAM` pouze na loopback hostu;
- veřejný GitHub origin dál odmítá `CONFIDENTIAL-EXAM`;
- `Ověřit / dohledat` podporuje tvrzení i přímé faktické dotazy;
- klient posílá pouze `{ query }` a v temporary serverless režimu volitelnou hlavičku `X-Maturita-Desk-Access`;
- přístupový kód se ukládá jen do `sessionStorage`, nikoli do localStorage, URL nebo public configu;
- serverless worker má dva vzájemně výlučné auth režimy: dočasný teacher access token nebo budoucí server-to-server inner gate;
- worker vyžaduje rate limiter, exact Origin allowlist a OpenAI API key jako serverový secret;
- public `runtime-config.js` a `config/deployment.json` nadále obsahují prázdný Fact Check endpoint a žádný secret;
- cache/PWA verze zvýšena na 0.10.1.

## Co tento ZIP záměrně neobsahuje

- reálný maturitní `.mdesk`;
- přístupovou frázi k reálnému packu;
- OpenAI API key;
- `FACTCHECK_ACCESS_TOKEN` ani `FACTCHECK_GATE_TOKEN`;
- skutečná studentská data.

## Co tento build netvrdí

- fyzický iPad/telefon acceptance zde nebyl proveden;
- reálný Safari multi-tab race zde nebyl proveden;
- produkční izolovaný origin zatím není zřízen;
- serverless Ověřit / dohledat endpoint není samotným GitHub uploadem nasazen;
- reálný Content Pack není pedagogicky schválen pro ostrou maturitu;
- školní server není připojen.

## Finální ověření

Před vydáním ZIPu se spustí kompletní `npm test`, security scan a syntax/regresní sada. Následně se ZIP rozbalí do čisté složky a stejná sada se zopakuje nad přesným obsahem distribuovaného archivu. Výsledný SHA-256 se vypočítá až po tomto read-only ověření.

## Automatický test před balením

Kompletní `npm test`: **PASS**.

- Stage 13R validator: PASS;
- artifact security scan: PASS, 0 nálezů;
- Content Pack import bridge regression: PASS;
- Content Pack crypto/validator tests: PASS;
- Ověřit / dohledat client tests: PASS;
- serverless worker anti-abuse/privacy/auth tests: PASS;
- runtime query-only canary: PASS;
- Stage 3–12R regresní sada: PASS;
- PWA/device static hardening: PASS;
- multi-tab coordinator + actual main.js smoke: PASS.

Fyzické browser/device testy nejsou tímto automatickým PASS nahrazeny.
