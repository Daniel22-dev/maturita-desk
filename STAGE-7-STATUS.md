# Maturita Desk — Stage 7 status

Verze aplikace: **0.5.0**  
Verze obsahu: **2027.0.1-review**  
Stav: **INTERNAL-REVIEW-NOT-PEDAGOGICALLY-APPROVED**

## Cíl etapy

Převést kompletní školní balíček do jednotného datového modelu, rozšířit renderer o skutečné typy obsahu a vytvořit šifrovaný dvacetitematový Content Pack bez úniku do veřejné PWA.

## Implementováno

- [x] inventura a SHA-256 kontrola 80/80 zdrojových DOCX;
- [x] převod 20/20 ostrých učitelských témat;
- [x] převod 20/20 Picture Comparisons;
- [x] přesně dva komparační obrázky na téma;
- [x] převod 20/20 cvičných studentských listů;
- [x] plné ostré studentské listy vyloučené z runtime;
- [x] 64 koncových referenčních obrázků uchovaných uvnitř encrypted packu;
- [x] rich Task blocks;
- [x] section-level Extra Prompts;
- [x] Practice Teacher Guidance s review metadata;
- [x] raster-only media policy pro confidential pack;
- [x] clear-content validator;
- [x] encrypted-pack verifier a negative controls;
- [x] public sanitizovaný QA report;
- [x] public-shell leak gate;
- [x] telefon, iPad/tablet a desktop zachovány.

## Obsahové počty

- Exam Task steps: **75**
- Exam sections: **120**
- Exam questions: **515**
- Exam Extra Prompts: **99**
- Practice Task steps: **75**
- Practice sections: **120**
- Practice questions: **517**
- Source-matched Teacher Guidance drafts: **217**
- Scaffold-only Teacher Guidance drafts: **300**
- Review priority HIGH: **135**
- Review priority NORMAL: **382**
- Comparison images: **40**
- Reference images: **64**

## Záměrně neimplementováno / odloženo

- automatické známkování;
- student identity data;
- živý Fact Check provider;
- centrální serverové přihlášení;
- veřejná distribuce ostrého obsahu;
- pedagogické automatické schválení;
- plné zobrazení ostrého studentského pracovního listu.

## Technický gate

- source inventory + hash verification: **PASS**;
- clear content validation: **PASS**;
- media integrity + uniqueness: **PASS**;
- encrypted pack verification: **PASS**;
- wrong-passphrase negative control: **PASS**;
- ciphertext tamper negative control: **PASS**;
- AAD metadata tamper negative control: **PASS**;
- public-shell leak gate: **PASS**;
- `npm test`: **PASS**;
- lokální Chromium smoke: **BLOCKED BY BUILD ENVIRONMENT** (`ERR_BLOCKED_BY_ADMINISTRATOR`, jeden pokus);
- Safari/iPad, telefon a desktop device smoke: **REQUIRED / NOT YET CLOSED**.

## Pedagogický gate

**OPEN.** Před ostrým použitím musí angličtináři zkontrolovat všech 20 témat, 40 komparačních obrázků, 64 referenčních obrázků, zdrojové odpovědi a všech 517 Teacher Guidance draftů. Přednostně se kontroluje 135 položek s prioritou HIGH.


## Finální packaging gate

- veřejný shell klasifikován jako **SYNTHETIC-ONLY**;
- žádný skutečný `.mdesk`, passphrase, zdrojový DOCX ani otevřený confidential JSON není součástí veřejného balíčku;
- oddělený encrypted pack byl ověřen včetně negative controls;
- skutečný Safari/device smoke zůstává podmínkou pilotního a ostrého nasazení.
