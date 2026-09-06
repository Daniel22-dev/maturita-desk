# Maturita Desk 1.0.2 — GHRAB Platform 1.1.2 ecosystem-wave candidate

Maturita Desk je učitelská PWA pro přípravu a průběh ústní maturitní zkoušky z anglického jazyka. Verze **1.0.2** je kandidát pro koordinovanou release wave **GHRAB Platform 1.1.2**. Zachovává funkční serverless baseline 1.0.1 a přidává suite-level shared-device lifecycle `ghrab-suite-session-v1`, data manifest a fail-closed cleanup vlastních pracovních dat. Tento kandidát zatím není automaticky produkční release.


## GHRAB Platform 1.1.2 a sdílené zařízení

Aplikace načítá přesnou vendor vrstvu Platform 1.1.2 z referenčního AI Studia 0.21.40. Při suite-level „Ukončit práci“ reaguje přes `GHRAB_PLATFORM.session.onEnd(...)`, načte `src/config/data-manifest.json` a maže pouze přesné app-owned položky s `clearOnEndWork: true`. Writer guard kontroluje suite generation, takže stale/BFCache/multi-tab kontext nesmí po ukončení relace obnovit starý pracovní obsah.

Šifrovaný podepsaný Content Pack, statické PWA cache, instalační ID, legitimní UI nastavení a lifecycle tombstones se bez důvodu nemažou. School-server logout je při aktivním school-server režimu součástí fail-closed cleanupu a musí být serverem potvrzen.

F-02 je lokálně rozlišen stavem `observed -> cleanup-complete -> acknowledged`; finální per-app acknowledgement zapisuje až Platform 1.1.2 po úspěšném handleru. F-03 (same-origin schopnost kompromitovaného skriptu ovlivnit sdílený tombstone/ack jiné aplikace) zůstává ekosystémovou trust-boundary otázkou, nikoli vlastností, kterou může child aplikace sama kryptograficky vyřešit.

## Běžný serverless provoz

Normální používání **nevyžaduje příkazový řádek, localhost ani školní server**. Učitel otevře schválenou webovou adresu / nainstalovanou PWA, jednou importuje schválený šifrovaný `.mdesk`, při práci jej odemkne heslem a používá Exam, Practice, Pictures, Task Box, Topic, Notes a offline režim.

Šifrovaný pack zůstává v IndexedDB zařízení. Dešifrovaný obsah ani heslo se trvale neukládají. Po novém spuštění se chráněný obsah znovu odemkne heslem.

## Dvě role originů

### Veřejná demonstrační adresa

`https://daniel22-dev.github.io/maturita-desk/`

Tento sdílený GitHub Pages origin je podporován pro shell a syntetické testování, ale **CONFIDENTIAL-EXAM je na něm záměrně blokován**.

### Produkcni serverless adresa

Konkretni produkcni adresa neni v aplikaci napevno. Muze byt zvolena pozdeji jako samostatny izolovany HTTPS origin mimo sdileny `daniel22-dev.github.io`.

Stejny zdrojovy build prijme `CONFIDENTIAL-EXAM` pouze tehdy, kdyz ma dany presny origin platne kryptograficky podepsane opravneni v `config/origin-authorization.json`. Toto verejne opravneni lze vytvorit az po volbe hostingu, bez dalsi zmeny zdrojoveho kodu aplikace.

Soucasne musi mit Content Pack platny ECDSA P-256 publisher podpis a uzivatel musi zadat spravne heslo. Realny `.mdesk` se nikdy neuklada do verejneho GitHub repozitare.

## Content Pack release

`CONFIDENTIAL-EXAM` balíčky musí být před distribucí podepsány privátním publisher klíčem mimo veřejný repozitář. Aplikace podpis ověří ještě před uložením/odemčením packu. Privátní publisher klíč nikdy nepatří do GitHubu, aplikace, logů ani screenshotů.

Nástroje:

- `tools/generate-publisher-key.mjs` — vytvoření nového páru;
- `tools/sign-content-pack.mjs` — podepsání `.mdesk`;
- `tools/verify-content-pack-signature.mjs` — nezávislá kontrola podpisu.

## Ověřit / dohledat

Funkce **Ověřit / dohledat** je oddělená od Exam Engine. Do online služby se odesílá pouze text, který učitel výslovně napíše do pole `query`. Téma, zadání, Teacher Guidance, Notes, Content Pack ani identita studenta se automaticky neposílají.

Serverless varianta používá malou edge službu s OpenAI klíčem uloženým pouze jako serverový secret, povinným rate limiterem a samostatným učitelským přístupovým kódem. Veřejný build se vydává s prázdným endpointem; funkce se aktivuje až po samostatném nasazení edge služby. Exam, Practice ani Notes na této službě nezávisejí.

Podrobnosti: `serverless/SERVERLESS-FACT-CHECK-SETUP.txt`.

## Budoucí školní server

Architektura `school-server` zůstává připravena pro SSO, centrální autorizaci, automatickou distribuci šifrovaného Content Packu a serverovou Fact Check gateway. Není podmínkou serverless provozu 1.0.2.

## Co znamená „final baseline“

**Hotové z pohledu plánované funkčnosti:** serverless runtime, chráněné Content Packy, publisher signature, Exam/Practice workflow, Notes, PWA/offline, multi-tab guard, diagnostika zařízení, serverless-ready Ověřit / dohledat a budoucí school-server kontrakt.

**Stále vyžaduje lidskou/provozní akceptaci:** reálné device scénáře na cílovém notebooku/iPadu/telefonu, pedagogické schválení konkrétního maturitního Content Packu, jednorázové zřízení izolovaného produkčního originu a živé nasazení/behaviorální ověření Ověřit / dohledat, pokud se má používat.

Automatický PASS proto neznamená, že konkrétní obsah nebo konkrétní školní nasazení bylo lidsky schváleno.

Viz `RELEASE-1.0.1-STATUS.md`, `SERVERLESS-PRODUCTION-DEPLOY.txt` a `DEVICE-ACCEPTANCE-1.0.1.txt`.
