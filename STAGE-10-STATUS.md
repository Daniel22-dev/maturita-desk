# Maturita Desk — Stage 10 status

**Verze:** 0.8.0  
**Etapa:** Auth & Server Architecture  
**Verdikt:** TECHNICAL_READY_FOR_SCHOOL_SERVER_INTEGRATION / SERVER_NOT_CONNECTED

## Hotovo

- konfigurací přepínatelný `standalone-local` / `school-server` profil;
- `AuthProvider`: local-device a school-server-session;
- cookie-based server session (`credentials: include`, `cache: no-store`);
- capability gate pro Exam, Practice, Review, Content download a Fact Check;
- volitelný kryptograficky podepsaný offline authorization lease (ECDSA P-256 / SHA-256);
- lease vázaný na installationId, appId, capabilities a expiraci;
- `ContentProvider`: lokální encrypted import a server-authorized encrypted delivery;
- school-server sync nikdy nepřepisuje lokální cache při chybě;
- Fact Check umí server-session režim a stále odesílá pouze `{query}`;
- access UI a server/local status přímo v aplikaci;
- Content Pack se v server profilu bez platné authorization state neodemkne;
- runtime/deployment config a API cesty jsou mimo service-worker cache;
- zachována kontinuita již běžící exam session při síťovém výpadku.

## Záměrně není hotovo

- není připojen skutečný školní Identity Provider;
- není nasazen školní backend;
- není vložen produkční ECDSA public key ani server private key;
- není přesunuta reálná confidential `.mdesk` distribuce na server;
- není proveden live Fact Check přes školní gateway;
- nejsou provedeny device/integration testy proti skutečnému serveru.

Stage 10 proto nepředstírá produkční login. Ve standalone buildu je přístup výslovně označen jako lokální režim bez centrální identity.

## Automatické testy

- public-shell / no-secret validator: PASS
- runtime config + baked/network parity: PASS
- AuthProvider: PASS
- signed offline lease + tamper negative control: PASS
- ContentProvider: PASS
- provider registry: PASS
- synthetic school-server integration: PASS
- Fact Check query-only regression: PASS
- Exam/Notes/crypto/review/runtime regrese: PASS
- Chromium browser gate: BLOCKED_BY_ENVIRONMENT (`ERR_BLOCKED_BY_ADMINISTRATOR`), nikoli PASS
