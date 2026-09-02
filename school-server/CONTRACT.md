# Maturita Desk 1.0.1 — School Server Contract v1

Tento kontrakt je **server-ready reference**, nikoli hotový školní backend. Neobsahuje tajné klíče, skutečný Content Pack ani osobní údaje.

## 1. Deployment profil

Klient načítá `config/deployment.json` s `cache: no-store`. Baked `runtime-config.js` je však release trust anchor: obsahuje očekávaný režim/environment, endpoint-origin allowlist a `trust.appOrigins`. Network konfigurace může baked důvěru pouze **zúžit**, nikdy rozšířit. Aplikace spuštěná na originu, který není připnutý v baked release profilu, skončí `locked` ještě před network config fetch.

Síťově získaná, ale semanticky neplatná konfigurace se **nesmí** změnit na lokální oprávněný režim. Při legitimní síťové nedostupnosti lze použít pouze baked profil stejného release deploymentu a UI musí zobrazit fallback warning.

Při školním buildu proto musí **oba** konfigurační zdroje obsahovat school-server profil a baked `trust.appOrigins` musí obsahovat přesný produkční origin aplikace. Veřejný standalone baked fallback nesmí zůstat ve školním deploymentu.

Podporované režimy:
- `standalone-local` — žádná centrální identita; lokální šifrovaný `.mdesk`;
- `school-server` — školní session, autorizovaná distribuce encrypted `.mdesk`, Fact Check přes školní API;
- `locked` — fail-closed interní stav, který nelze ručně nakonfigurovat jako provozní profil.

## 2. Session endpoint

`GET /api/v1/maturita-desk/session`

Požadavek:
- `credentials: include`;
- `cache: no-store`;
- `X-Maturita-Desk-Client: auth-v1`;
- `X-Maturita-Desk-Installation: <random installation id>`.

Doporučená serverová session: `HttpOnly; Secure; SameSite=Lax` nebo přísnější podle login flow. Klient **neukládá bearer token do localStorage**. Odpověď má mít `Cache-Control: no-store` a rozumný response-size limit.

Odpověď používá `maturita-desk-auth-session-v1` a obsahuje pouze minimální teacher authorization data. `displayName` je volitelný a klient jej drží jen v paměti.

Schopnosti v1: `exam`, `practice`, `review`, `content:download`, `fact-check`.

## 3. Offline authorization lease

Volitelná odpověď session může obsahovat podepsaný `maturita-desk-signed-auth-lease-v1`.

- ECDSA P-256 + SHA-256;
- klient má pouze veřejný ověřovací JWK; private `d` je v runtime konfiguraci odmítnut;
- lease je vázán na `installationId`, `appId`, expiraci a seznam capabilities;
- klientský hard maximum: **24 hodin**;
- lease neobsahuje jméno učitele, e-mail ani studentská data;
- privátní podpisový klíč nikdy neopouští server.

`installationId` není hardware attestation. Je to náhodný browser-local identifikátor a jeho storage lze při vysokých lokálních právech kopírovat. Offline expirace se zároveň opírá o systémový čas. Pro produkční iPady proto musí IT vynutit automatický čas/MDM politiku a otestovat rollback. Vyšší assurance vyžaduje zařízení-/WebAuthn-bound klíč nebo online challenge.

Offline režim nemůže provést okamžitou revokaci; ta nastane po znovupřipojení nebo expirací lease.

## 4. Login / logout

Login URL je serverová navigace (např. Workspace/Microsoft 365 SSO). Klient do `returnTo` přidává pouze application pathname; query/hash se do IdP nereflektují.

`POST /api/v1/maturita-desk/session/logout`
- `logoutEndpoint` je pro school-server profil povinný; jeho absence uzamkne runtime konfiguraci;
- `credentials: include`;
- `X-CSRF-Token`, pokud jej session endpoint vydal;
- logout vždy odstraní lokální offline lease;
- klient označí logout za potvrzený pouze při úspěšné serverové odpovědi;
- aplikace nedovolí logout během rozpracované exam/practice session.

Server musí skutečně zneplatnit session cookie/server-side session. UI potvrzení samo o sobě není důkaz revokace; deployment test musí po logoutu znovu zavolat `/session` a dostat neautorizovaný stav.

## 5. Content delivery

`GET /api/v1/maturita-desk/content/active`

Server musí vyžadovat platnou session a capability `content:download`.

Odpověď:
- buď přímo `maturita-desk-encrypted-pack-v1`, nebo
- wrapper `maturita-desk-content-delivery-v1` s polem `envelope`.

Server **nesmí** vracet cleartext zkouškové JSONy, DOCX ani dešifrovací heslo. Klient uloží doručený envelope do IndexedDB stále šifrovaný. Při neúspěšném syncu se stávající lokální pack nemaže. Klient odmítá envelope větší než **32 MiB** a neomezené PBKDF2 work factors. 32 MiB je bezpečnostní strop, nikoli náhrada fyzického iPad performance testu.

Verze 1.0.1 nadále používá lokální passphrase unlock a současně vyžaduje pro `CONFIDENTIAL-EXAM` samostatný publisher podpis `maturita-desk-publisher-signature-v1` (ECDSA P-256 + SHA-256). Server smí distribuovat pouze envelope podepsaný klíčem, jehož veřejná část je připnuta v baked release profilu. Síťová konfigurace smí seznam publisher klíčů pouze zúžit, nikoli přidat či nahradit klíč mimo release trust anchor.

## 6. Fact Check

`POST /api/v1/maturita-desk/fact-check`

Tělo požadavku je striktně pouze:

```json
{"query":"..."}
```

Školní session se přenáší cookie/header vrstvou, nikoli v JSON payloadu. Do request body se nesmí automaticky přidávat topic, exam prompt, Content Pack, Teacher Guidance, Notes ani session objekt.

Server musí vynutit autorizaci `fact-check`, rate limiting, request/response size limit a nepersistovat payload do obecných access logů. Fact Check selhání nesmí blokovat Exam Engine.

Pokud je použit referenční `serverless/fact-check-worker.mjs`, nesmí být browseru vystaven jako anonymní placená brána. Worker vyžaduje server-side `FACTCHECK_GATE_TOKEN`; autentizovaný school/edge endpoint po vlastní kontrole session/capability přidá `X-Maturita-Desk-Gate` server-to-server. Tento secret se nikdy nevkládá do PWA.

## 7. CSRF, Origin, CORS a security headers

Pro serverový profil je preferovaný same-origin deployment. Server musí:
- kontrolovat `Origin` u state-changing/API POST požadavků;
- používat CSRF token nebo ekvivalentní ochranu pro cookie-based session;
- nepovolovat wildcard credentialed CORS;
- vracet `Cache-Control: no-store` pro session, Fact Check a authorization odpovědi;
- necacheovat confidential content přes veřejnou CDN bez explicitní privátní politiky;
- nastavit response CSP nejméně podle klientského meta profilu a přidat `frame-ancestors`;
- používat `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, vhodný `Referrer-Policy` a `Permissions-Policy`.

Client meta CSP je defense-in-depth, nikoli náhrada serverových hlaviček.

## 8. Audit a logy

Server může auditovat: přihlášení, stažení verze packu, autorizované Fact Check volání a administrativní změny. Nemá logovat:
- obsah Notes;
- obsah maturitního zadání z klienta;
- studentovu identitu (aplikace ji vůbec nesbírá);
- cleartext dešifrovaného `.mdesk` payloadu;
- Fact Check query v reverse-proxy/access logu, pokud to není výslovně bezpečně navrženo.

## 9. Fail-safe chování

- nová serverová session bez autorizace: fail closed;
- chybná runtime konfigurace nebo nepřipnutý app origin: locked/no capabilities;
- cached encrypted pack bez platné server session/offline lease: nelze odemknout v `school-server` profilu;
- výpadek sítě během běžící zkoušky: Exam Engine pokračuje;
- refresh offline: znovuotevření protected obsahu vyžaduje platný podepsaný offline lease + passphrase;
- Content sync chyba: existující encrypted cache zůstává;
- Fact Check chyba: zkouška pokračuje nezávisle;
- logout bez serverového potvrzení: klient hlásí `logout-unconfirmed`, nikoli success.
