# Maturita Desk — Stage 6 status

Verze: **0.4.0**

## Cíl etapy

Oddělit neveřejný maturitní obsah od veřejné PWA a připravit bezpečnější serverless distribuční model pro iPad, telefon a desktop.

## Implementováno

- [x] verzovaný encrypted envelope `.mdesk`;
- [x] AES-256-GCM + AAD;
- [x] PBKDF2-SHA-256 (default 310k iterací);
- [x] SHA-256 kontrola ciphertextu;
- [x] IndexedDB protected store;
- [x] import bez automatického odemčení;
- [x] password-only-in-memory unlock;
- [x] lock/remove workflow;
- [x] session v3 svázaná s packId/verzí;
- [x] bezpečný resume gate po reloadu;
- [x] žádný protected topic title v persistované session;
- [x] service-worker bypass `.mdesk` / protected-content;
- [x] syntetický importovatelný sample pack;
- [x] CLI nástroj pro výrobu packu bez hesla na CLI;
- [x] kryptografické tamper/wrong-password testy;
- [x] zachování telefonu, iPadu i desktopového responsive UX.

## Záměrně ještě není součástí

- skutečný ostrý Content Pack;
- převod 20 školních témat do datového modelu;
- embed/optimalizace skutečných fotografií;
- finální Practice Teacher Guidance;
- centrální serverová autentizace;
- Fact Check provider.

## Gate

Stage 6 je hotová tehdy, pokud `npm test` projde a public-shell validator nadále klasifikuje build jako SYNTHETIC-ONLY. Následující etapa může bezpečně začít převádět reálné podklady do samostatného chráněného packu, nikoliv do veřejného shellu.

## Aktuální automatizovaný výsledek

`npm test` → **PASS**. Browser/device smoke zde zůstává neuzavřený kvůli administrativní blokaci navigace Chromium v pracovním prostředí.
