# Maturita Desk 0.10.0 — Stage 13 Synthetic Device Pilot

Maturita Desk je učitelská PWA pro průběh ústní zkoušky z anglického jazyka. Verze **0.10.0** je řízený pilotní build určený k reálnému testování zařízení po dokončení Stage 12R security re-auditu.

## Důležité omezení

Stage 13 je **SYNTHETIC-ONLY**. Aplikace v této verzi záměrně odmítá `CONFIDENTIAL-EXAM` Content Pack při inicializaci, importu i odemčení. Build není určen pro ostrou maturitu ani pro skutečná studentská data.

## Co Stage 13 měří

Pilot má na cílovém iPadu/telefonu ověřit zejména výkon importu a dešifrování velkého `.mdesk`, celou 15minutovou relaci, sleep/background/Back/Restore/Reopen, offline cold start, Service Worker update/recovery, dotykovou ergonomii a reálný multi-tab race.

Aplikace má nový **Pilot panel**, který vede lokální checklist, automaticky zachytí několik technických metrik a umí exportovat JSON/TXT report. Nic se neodesílá automaticky.

## Multi-tab guard

Stage 12R měl pouze varovný BroadcastChannel mechanismus. Stage 13 přidává krátkodobý lokální writer lease. Aktivní panel pravidelně obnovuje vlastnictví session; jiný panel nesmí zapisovat do stejného session storage, pokud lease vlastní jiná instance. Explicitní takeover je dostupný pouze přes viditelnou konflikt obrazovku.

Při zavádění této vrstvy byl zároveň nalezen a opraven problém pořadí inicializace `BroadcastChannel` runtime stavu, který předchozí Node smoke neodhalil, protože BroadcastChannel v testu vypínal.

## Stress pack

Samostatně se vydává syntetický `.mdesk` o velikosti přibližně 29,5 MiB. Není součástí veřejného ZIPu aplikace. Slouží výhradně pro Stage 13 měření cílového iPadu.

## Otevřené gate

Automatický PASS neuzavírá Stage 13. Fyzický iPad/Safari, telefon, SW update/recovery a plná 15minutová relace zůstávají `PENDING`, dokud se nevrátí reálné pilotní reporty.

Podrobný postup je v `STAGE13-PILOT-NAVOD.txt` a `DEVICE-PILOT-CHECKLIST.txt`.
