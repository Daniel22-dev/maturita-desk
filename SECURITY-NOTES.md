# SECURITY NOTES — Maturita Desk 0.10.1 / Stage 13R

## Status

Stage 13R vychází ze Stage 12R hardeningu a ze Stage 13 device-pilot vrstvy. Přidává opravu ručního Content Pack importu, localhost-only interní review reálného obsahu a serverless-ready **Ověřit / dohledat**. **Není to produkční 1.0.0.**

## Public GitHub vs. localhost internal review

Stejný zdrojový balík má dvě odlišné provozní politiky:

- na veřejném `daniel22-dev.github.io` je `CONFIDENTIAL-EXAM` aktivně odmítán a běh zůstává `SYNTHETIC-ONLY`;
- na `localhost`, `127.0.0.1` nebo `[::1]` se interní review režim aktivuje pouze tehdy, když je baked flag `MATURITA_DESK_INTERNAL_REVIEW` zapnutý;
- samotný real Content Pack ani passphrase nejsou v repozitáři;
- localhost je výjimka pouze pro interní obsahovou/UX revizi, nikoli schválení veřejné distribuce ostrého obsahu.

Tento model umožňuje testovat reálný šifrovaný pack bez jeho vložení do GitHubu a současně zachovat fail-closed veřejnou stránku.

## Content Pack

Kryptografické schéma zůstává:

- AES-256-GCM;
- PBKDF2-SHA-256;
- validovaný rozsah KDF iterací;
- max. envelope 32 MiB;
- encrypted-at-rest IndexedDB;
- passphrase ani plaintext pack se nepersistují;
- service worker `.mdesk` necachuje.

Ruční browserový import má nově regresní test pro případ, kdy je file input renderován v body-level draweru mimo `#app`.

## Multi-tab / concurrent writer

Stage 13/13R používá `ghrab.maturita-desk.session-owner.v1`:

- krátkodobý writer lease v localStorage;
- heartbeat aktivního panelu;
- BroadcastChannel signalizaci;
- fail-closed blokaci zápisu, pokud čerstvý lease vlastní jiná instance;
- explicitní takeover pouze z viditelné konflikt obrazovky.

Tato vrstva není distribuovaný databázový lock ani hardware attestation. Reálný multi-tab race na cílových prohlížečích zůstává fyzickým acceptance testem.

## Ověřit / dohledat — privacy boundary

Browser automaticky neposílá Topic, zadání, Content Pack, Teacher Guidance, Notes, session objekt ani identitu studenta. Request body je pouze `{ query }` a klient akceptuje omezenou strukturovanou odpověď se zdroji.

Public profil má endpoint prázdný, takže samotný GitHub upload nevystaví placenou AI službu.

### Dočasný serverless auth před školním serverem

Edge Worker podporuje explicitní `FACTCHECK_ACCESS_TOKEN`:

- OpenAI API key je výhradně serverový secret;
- teacher access token je samostatný secret a není OpenAI key;
- klient jej drží pouze v `sessionStorage` aktivního panelu;
- posílá se v `X-Maturita-Desk-Access`, nikdy v URL;
- Worker vyžaduje přesný allowed Origin a povinný rate limiter;
- CORS není považován za autentizaci;
- token je sdílené dočasné oprávnění, nerozlišuje individuální učitele a při úniku musí být rotován.

Budoucí school-server režim používá místo browserového access tokenu server-to-server `FACTCHECK_GATE_TOKEN`. Worker fail-closed odmítne konfiguraci, ve které nejsou nastaveny žádné auth secrets nebo jsou omylem zapnuty oba režimy současně.

Behaviorální AIR proti živému produkčnímu provideru zatím nebyl proveden.

## Co zbývá před ostrým serverless releasem

1. izolovaný produkční origin/subdoména místo sdíleného `daniel22-dev.github.io` originu;
2. dokončená lidská pedagogická revize reálného Content Packu;
3. publisher signature / kontrolovaný podpis finálního ostrého packu;
4. dokončené fyzické device/PWA acceptance testy;
5. pokud má být online Ověřit / dohledat aktivní: nasazený edge endpoint, secret management, rate limit, rotace přístupu a behaviorální ověření;
6. produkční response security headers podle zvoleného hostingu.

Školní server/SSO je nadále podporovaná budoucí cesta, ale není podmínkou pro základní serverless Exam/Practice/Notes/Content Pack provoz.

## Privacy

- žádná student identity pole v core session;
- pilotní report neobsahuje jméno studenta ani testera;
- report se automaticky neodesílá;
- do volných pilotních poznámek se nesmí opisovat ostré zadání ani osobní údaje;
- reálný Content Pack zůstává oddělený od veřejného shellu.

## Otevřené provozní gate

Fyzický notebook/iPad/Safari, telefon, Service Worker update/recovery, offline cold start a plná 15minutová relace jsou `PENDING`, dokud je uživatel reálně neotestuje. Automatické Node testy je nenahrazují.
