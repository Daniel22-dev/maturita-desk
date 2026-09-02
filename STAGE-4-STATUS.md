# Etapa 4 — stav Exam Engine

Verze: **0.2.0**

## Gate této etapy

Cílem Stage 4 je mít spolehlivé jádro skutečné 15minutové relace ještě před připojením ostrého Content Packu.

### Splněno

- [x] START je oddělen od otevření tématu.
- [x] Exam Mode má pevné pořadí Pictures → Task → Topic.
- [x] Celkový čas běží nepřetržitě od START do potvrzeného ukončení.
- [x] Sekční čas běží pouze aktivní fázi.
- [x] Pouhé zobrazení jiné záložky aktivní fázi nezmění.
- [x] Aktivní fázi nelze přeskočit ani vrátit zpět.
- [x] Přechod mezi fázemi vyžaduje explicitní potvrzení.
- [x] Ukončení relace vyžaduje explicitní potvrzení.
- [x] Refresh/uspání zachová relaci, Notes i správný časový základ.
- [x] Poškozené téma je blokováno před STARTem.
- [x] Nefunkční lokální úložiště je blokováno před STARTem.
- [x] Practice Mode funguje časovaně i bez času.
- [x] Telefon používá stejné funkce jako tablet/desktop.
- [x] Public shell je stále SYNTHETIC-ONLY.

## Automatické ověření

`npm test` — **PASS**

Sady:
- Stage 4 public-shell validator;
- pure Exam Engine unit tests;
- content-schema validator tests;
- main runtime smoke přes DOM stub.

## Browser integration

Je připraven `tests/browser-smoke.py` pro skutečný Chromium průchod (desktop + phone + reload + offline). V tomto pracovním kontejneru byl lokální browser navigation blokován administrativní politikou prostředí (`ERR_BLOCKED_BY_ADMINISTRATOR`), takže tento konkrétní integrační běh zde nelze označit jako PASS. Musí se spustit v běžném lokálním/CI prostředí před release.

## Následující logická etapa

Po schválení Stage 4 navazuje práce na Notes/working-session hardeningu a poté chráněném Content Packu. Ostré podklady se nesmí přidávat do tohoto veřejného buildu.
