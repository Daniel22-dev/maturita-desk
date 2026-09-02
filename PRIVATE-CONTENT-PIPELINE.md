# Maturita Desk 0.7.0 — private content & review pipeline

Tento dokument popisuje neveřejnou cestu od zdrojových DOCX přes interní Content Pack až k lidsky pedagogicky revidovanému kandidátu.

## 1. Zdrojový obsah

Stage 7 vytvořil encrypted interní pack `2027.0.1-review` z 80 zdrojových DOCX. Otevřený `real-content.json`, source extraction a explicitní mapping/refinement pravidla jsou **CONFIDENTIAL-EXAM** a nepatří do veřejného repozitáře.

## Stage 9 — Fact Check je mimo content pipeline

Fact Check nemá přístup k clear-content buildům, `.mdesk` payloadu ani review patchům. Stage 9 pouze přidává query-only online provider. Žádný krok private content pipeline nevolá Fact Check endpoint a žádný Fact Check query/result se nepřidává do Content Packu.


## 2. Lidská Stage 8 revize

Po importu a odemčení interního `.mdesk` otevře učitel v Maturita Desk **Pedagogickou revizi**.

Revizní rozsah skutečného packu:

- 517 Practice Topic questions;
- 75 Practice Task steps;
- 592 items celkem;
- 135 HIGH, 457 NORMAL.

Doporučený postup: nejprve HIGH, potom NORMAL. Každá položka musí skončit `approved` nebo `edited`. `rejected` je blokující stav.

## 3. Export `.mdreview`

Browser exportuje pouze interní source-bound review patch. Původní exam prompt text ani source-match text se do patche automaticky nekopíruje. Lidsky editovaná guidance a poznámka jsou však volný vstup, proto `.mdreview` zůstává interním artefaktem. Patch lze předat mezi oprávněnými revizory nebo zálohovat odděleně od `.mdesk`.

## 4. Sloučení více review patchů

```bash
node merge-review-patches.mjs \
  --inputs revize-a.mdreview,revize-b.mdreview \
  --output revize-merged.mdreview
```

Povinná pravidla:

- packId a contentVersion musí být shodné;
- fingerprinty musí odpovídat stejné zdrojové verzi;
- konfliktní lidská rozhodnutí se automaticky nepřepisují;
- při konfliktu pipeline skončí FAIL.

## 5. Aplikace kompletní revize

Passphrase se předávají pouze environment proměnnými:

```bash
MATURITA_DESK_SOURCE_PASSPHRASE='...' \
MATURITA_DESK_OUTPUT_PASSPHRASE='...' \
node apply-review-patch.mjs \
  --pack Maturita-Desk-AJ-2027-interni-revize-2027.0.1.mdesk \
  --patch finalni-revize.mdreview \
  --output Maturita-Desk-AJ-2027-pedagogicky-kandidat.mdesk \
  --version 2027.0.2-review
```

Bez `--allow-partial true` nástroj odmítne neúplnou nebo odmítnutou revizi. Pro kandidáta určeného k dalším release gate se partial režim nepoužívá.

## 6. Po aplikaci

Nový encrypted pack dostane novou verzi a metadata o aplikované pedagogické revizi. Původní interní pack zůstává neměnným auditovatelným vstupem.

Poté následuje:

1. strukturální a cryptographic verification nového packu;
2. private real-content leak scan public shellu;
3. reálné device testy;
4. GARP;
5. teprve potom finální produkční pack s novou provozní passphrase.

## 7. Úklid

- veřejně publikovat pouze public PWA se syntetickými daty;
- `.mdesk`, `.mdreview`, source DOCX a private tools držet mimo veřejný GitHub;
- passphrase nikdy nebalit do stejného artefaktu s Content Packem;
- po dokončení odstranit otevřené dočasné obsahové soubory.

## Stage 10 — serverová distribuce

Stage 10 nemění confidential source pipeline ani stav pedagogické revize. Přidává pouze možnost, aby budoucí školní backend po autorizaci doručil výsledný **encrypted `.mdesk` envelope**. Server delivery endpoint nesmí vracet clear build, source DOCX/PDF ani passphrase. Private pipeline zůstává jediným místem, kde vzniká a schvaluje finální encrypted Content Pack.
