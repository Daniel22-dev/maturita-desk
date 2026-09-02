# Stage 13 — Controlled Synthetic Device Pilot

Verze: **0.10.0**  
Klasifikace: **SYNTHETIC-ONLY / DEVICE PILOT BUILD**

## Stav

Stage 13 není tvrzení, že fyzický pilot už proběhl. Tato etapa připravuje a instrumentuje přesný build pro reálné testování na iPadu, telefonu a desktopu. V tomto prostředí nebylo možné fyzické Safari/iPad acceptance provést.

**Aktuální gate: READY FOR SYNTHETIC DEVICE PILOT / PHYSICAL ACCEPTANCE PENDING.**

## Bezpečnostní omezení pilotu

- `CONFIDENTIAL-EXAM` Content Pack je v tomto buildu záměrně blokovaný při inicializaci, importu i odemčení.
- Stage 13 přijímá pouze `SYNTHETIC-DEMO` balíčky.
- Reálná studentská data se nepoužívají.
- Pilotní report se ukládá pouze lokálně a neodesílá se automaticky.
- Pilotní report neobsahuje pole pro jméno testera ani studenta.
- Fact Check zůstává v public profilu bez nakonfigurovaného endpointu.

## Co přibylo v 0.10.0

1. **In-app Pilot panel** s 18 scénáři, z nichž 16 je povinných pro pilot gate.
2. **Automatické měření** času importu a odemčení syntetického `.mdesk`, základního PWA prostředí, lifecycle událostí a SW update stavu.
3. **Export pilotního reportu** do JSON i TXT pro následné vyhodnocení.
4. **Multi-tab writer guard**: lokální writer lease + BroadcastChannel. Druhý panel nesmí přepisovat aktivní session/Notes; případné převzetí musí být explicitní.
5. **Synthetic-only runtime gate**: ostrý Content Pack se v Stage 13 nedá použít ani omylem.
6. **Samostatný ~30 MiB syntetický stress pack** pro měření importu/dešifrování na cílovém iPadu; není součástí veřejného ZIPu aplikace.
7. Připravený **Service Worker update drill B** pro ověření čekající aktualizace během běžící relace.

## Nově nalezený integrační problém

Při zapnutí skutečné cesty `BroadcastChannel` byl odhalen problém inicializačního pořadí zděděný z předchozího kandidáta: setup multi-tab vrstvy mohl přistoupit k `sessionChannel` před jeho inicializací. Automatický Stage 12R smoke tuto větev neměřil, protože v testu byl BroadcastChannel vypnutý.

Stage 13 přesunul runtime stav koordinátoru před inicializaci aplikace a přidal `main-multitab-smoke.mjs`, který BroadcastChannel cestu skutečně spouští. Tento test nyní musí zůstat součástí regresní sady.

## Povinné fyzické scénáře

- velký syntetický Content Pack: import + unlock na cílovém iPadu;
- celá 15minutová relace 2 + 4 + 9;
- background, lock screen, Back/Restore/Reopen;
- multi-tab konkurence a ochrana Notes;
- Service Worker update/recovery;
- offline cold start po úplném zavření PWA;
- iPad landscape;
- telefon portrait + soft keyboard;
- Picture A/B bez cropu + zoom;
- ztráta sítě během relace;
- izolace nedostupného Fact Checku.

## Browser smoke v tomto prostředí

Playwright/Chromium byl pro Stage 13 skutečně spuštěn proti lokálnímu serveru, ale navigace byla zablokována politikou prostředí chybou `ERR_BLOCKED_BY_ADMINISTRATOR` ještě před načtením aplikace. Tento výsledek se **nepočítá jako PASS**. Log je v `preview/browser-smoke-stage13.log`.

## Gate po automatických testech

| Gate | Stav |
|---|---|
| Build / syntax / unit regression | **PASS** |
| Public-shell leak gate | **PASS** |
| Synthetic-only pilot policy | **PASS** |
| Multi-tab guard – model/runtime smoke | **PASS** |
| Physical iPad/Safari | **PENDING** |
| Physical phone | **PENDING** |
| Real SW update/recovery | **PENDING** |
| Real 15min session | **PENDING** |
| Overall Stage 13 | **OPEN until pilot reports are returned** |

Stage 13 nesmí být interpretována jako souhlas s ostrou maturitou nebo s uložením ostrého Content Packu na sdílený GitHub Pages origin.
