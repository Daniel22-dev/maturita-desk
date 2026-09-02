# Maturita Desk — Stage 8 status

**Verze aplikace:** 0.6.0  
**Etapa:** Pedagogická revize + Practice Teacher Layer  
**Technický stav:** COMPLETE  
**Pedagogický stav skutečného Content Packu:** OPEN / HUMAN REVIEW REQUIRED  
**Release stav:** NOT FOR LIVE MATURITA

## Dokončeno

- Pedagogical Review Workspace přímo v Maturita Desk;
- revizní model pro Practice Topic questions i Practice Task steps;
- ověřený skutečný rozsah: **592 položek = 517 otázek + 75 Task kroků**;
- priority: **135 HIGH / 457 NORMAL**;
- stavy `approved`, `edited`, `rejected`, plus implicitní `pending`;
- filtry podle priority, stavu, tématu a typu;
- lokální oddělené IndexedDB revizní úložiště;
- Practice Mode používá lidskou revizi okamžitě lokálně, aniž by měnil `.mdesk`;
- export/import source-bound `.mdreview`;
- SHA-256 fingerprint původní položky;
- kontrola packId, contentVersion, locatoru, fingerprintu a deklarovaného summary;
- forged-completion negative control;
- soukromý merge patchů s fail-closed konflikty;
- soukromý apply pipeline s defaultním zákazem partial/rejected produkčního kandidáta;
- service worker záměrně necachuje `.mdreview`;
- veřejný shell zůstává `SYNTHETIC-ONLY`.

## Automatické ověření

- `npm test`: PASS;
- Exam Engine: PASS;
- Notes/session: PASS;
- Content validator: PASS;
- rich content model: PASS;
- Content Pack crypto: PASS;
- pedagogical review model: PASS;
- review patch tests + tamper/forged-summary control: PASS;
- runtime smoke: PASS;
- skutečný review scope nad interním packem: PASS (592/592, 20 témat);
- private real-content leak scan veřejného Stage 8 shellu: PASS, 0 nálezů;
- syntetický end-to-end `create review → merge → apply → re-encrypt → decrypt`: PASS.

## Záměrně neuděláno

- žádná AI položka nebyla automaticky označena za pedagogicky schválenou;
- nebyl vytvořen nový „produkční“ `.mdesk`, protože lidská revize ještě neproběhla;
- browser nepřepisuje interní Content Pack;
- reviewer identity se neukládá;
- žádná studentská identita není součástí review workflow.

## Otevřené gate

1. lidsky projít 135 HIGH položek;
2. následně projít 457 NORMAL položek;
3. vyřešit všechny `rejected` položky lidskou úpravou;
4. exportovat kompletní `.mdreview`;
5. v private pipeline vytvořit nový pedagogicky revidovaný encrypted pack;
6. provést reálné testy na iPadu, telefonu a desktopu;
7. dokončit GARP a release integrity.
