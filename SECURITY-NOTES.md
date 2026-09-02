# SECURITY NOTES — Maturita Desk 0.10.0 / Stage 13

## Status

Stage 13 vychází z nezávisle znovu ověřeného 0.9.2 / Stage 12R kandidáta. Bezpečnostní opravy Stage 12R zůstávají zachované. Tato etapa přidává pilotní instrumentation a souběhovou ochranu; **není to ostrý release**.

## Synthetic-only safety gate

Stage 13 je záměrně omezen na `SYNTHETIC-DEMO` Content Pack. `CONFIDENTIAL-EXAM` je blokovaný:

- při načtení metadat již uloženého packu;
- před uložením ručně importovaného `.mdesk`;
- před odemčením;
- po dešifrování jako druhá kontrola;
- serverový Content Pack sync je v tomto pilotním buildu vypnutý.

To je provozní pojistka Stage 13, nikoli nový obecný Content Pack formát. Produkční verze po pilotu bude mít jinou release politiku.

## Multi-tab / concurrent writer

Stage 13 zavádí `ghrab.maturita-desk.session-owner.v1`:

- krátkodobý writer lease v localStorage;
- heartbeat aktivního panelu;
- BroadcastChannel signalizaci;
- fail-closed blokaci `saveSession`, pokud čerstvý lease vlastní jiná instance;
- explicitní takeover pouze z viditelné konflikt obrazovky.

Tato vrstva omezuje dřívější `last write wins` problém, ale stále nejde o distribuovaný databázový lock ani hardware bezpečnost. Reálný Safari multi-tab race je povinný Stage 13 device test.

Při implementaci byl nalezen init-order problém předchozího kandidáta: multi-tab setup mohl při dostupném `BroadcastChannel` přistoupit k `sessionChannel` před jeho inicializací. Stage 13 přesouvá stav koordinátoru před bootstrap a obsahuje runtime test s aktivním BroadcastChannel stubem.

## Content Pack

Kryptografické schéma zůstává:

- AES-256-GCM;
- PBKDF2-SHA-256;
- validovaný rozsah KDF iterací;
- max. envelope 32 MiB;
- encrypted-at-rest IndexedDB;
- passphrase ani plaintext pack se nepersistují;
- service worker `.mdesk` necachuje.

Stage 13 vydává samostatný ~29,5 MiB **syntetický** stress pack pro reálné měření iPadu. Není uvnitř public app ZIPu.

## Fact Check

Query-only hranice zůstává beze změny. Browser automaticky nepřidává Topic, zadání, Content Pack, Teacher Guidance, Notes ani session objekt. Public profil nemá živý Fact Check endpoint. Inner worker stále vyžaduje rate limiter a server-side gateway secret.

Behaviorální AIR proti živému produkčnímu provideru nebyl proveden a není tímto buildem uzavřen.

## Release / origin dluh před ostrým obsahem

Před uložením ostrého Content Packu je stále nutné řešit zejména:

1. oddělený origin/subdoménu místo sdíleného `daniel22-dev.github.io` originu;
2. publisher signature / důvěryhodný podpis ostrého Content Packu;
3. produkční serverové security headers a governance;
4. živé IdP/session/CSRF/CORS ověření;
5. behaviorální AIR a provider retention evidence.

Stage 13 proto nesmí být použit jako záminka k importu ostrého packu. Ten je v kódu této verze aktivně odmítán.

## Privacy

Pilotní report:

- neobsahuje pole student identity;
- neobsahuje pole reviewer identity;
- ukládá se pouze do localStorage tohoto zařízení;
- neodesílá se automaticky;
- exportuje se pouze explicitně uživatelem;
- volné pilotní poznámky mají limit a UI výslovně zakazuje osobní údaje.

## Otevřené provozní gate

Fyzický iPad/Safari, telefon, Service Worker update/recovery, offline cold start a plná 15minutová relace jsou `PENDING`. Automatické Node testy je nenahrazují.
