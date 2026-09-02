# Maturita Desk 1.0.0 — Serverless Final Baseline

Verze: **1.0.0**  
Software status: **FEATURE-COMPLETE SERVERLESS BASELINE**  
Produkční akceptace: **PENDING EXTERNAL / HUMAN GATES**

## Rozhodnutí

Od verze 1.0.0 je serverless varianta hlavní plnohodnotný provozní režim do doby, než bude dostupný školní server. Další opravy a úpravy se vydávají jako aktualizace této řady (např. 1.0.1), nikoli jako další Stage kandidáti.

## Uzavřeno v software

- Exam Engine 15 min s orientačními fázemi 2 + 4 + 9;
- Practice workflow;
- Pictures bez cropu, Task Box, Topic, Teacher Guidance;
- lokální Notes a session recovery;
- PWA/offline shell a bezpečné odložení SW update během relace;
- multi-tab writer lease / konflikt ochrana;
- lokálně šifrovaný Content Pack v IndexedDB;
- CONFIDENTIAL-EXAM pouze na připnutém izolovaném originu;
- povinný ECDSA P-256 publisher podpis pro CONFIDENTIAL-EXAM;
- privátní publisher klíč není součástí public buildu;
- Ověřit / dohledat s query-only privacy hranicí;
- dočasná serverless autentizace Ověřit / dohledat přes samostatný učitelský přístupový kód;
- school-server provider kontrakt zůstává kompatibilní pro budoucí migraci;
- lokální device diagnostika bez automatického uploadu.

## Bezpečnostní role originů

- `https://daniel22-dev.github.io` — povolený shell/demo origin, CONFIDENTIAL-EXAM blokován;
- `https://maturita.ghrabuvka.cz` — připnutý izolovaný serverless produkční origin pro podepsaný CONFIDENTIAL-EXAM;
- localhost — povolen pouze jako vývojový fallback; není běžný provozní workflow.

## Otevřené akceptační/provozní body — nejsou dalším vývojem core aplikace

1. Zřídit a ověřit custom origin `maturita.ghrabuvka.cz` na schváleném statickém hostingu.
2. Projít reálné device scénáře: notebook, iPad, telefon, background/lock/reopen, multi-tab, SW update/recovery, offline cold start.
3. Pedagogicky schválit konkrétní reálný Content Pack; současný 2027.0.1-review je interní revizní kandidát.
4. Pokud má být Ověřit / dohledat živé, nasadit edge worker, secrets, rate limiter a provést behaviorální test proti reálnému provideru.
5. Nastavit provozní custody/rotaci publisher private key a distribuční postup pro podepsané Content Packy.

## Gate interpretace

Automatizované build/security/regression testy mohou být GREEN, zatímco celkové nasazení zůstává AMBER do dokončení výše uvedených fyzických, pedagogických a provozních kroků. To není skrytý backlog core funkcí; je to akceptace konkrétního nasazení a konkrétního obsahu.
