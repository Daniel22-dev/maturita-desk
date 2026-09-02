# Maturita Desk 1.0.0 — Serverless Final Baseline

Maturita Desk je učitelská PWA pro přípravu a průběh ústní maturitní zkoušky z anglického jazyka. Verze **1.0.0** je první **feature-complete serverless software baseline**. Od této verze se další běžné změny vedou jako aktualizace 1.0.x/1.x, ne jako další vývojové Stage.

## Běžný serverless provoz

Normální používání **nevyžaduje příkazový řádek, localhost ani školní server**. Učitel otevře schválenou webovou adresu / nainstalovanou PWA, jednou importuje schválený šifrovaný `.mdesk`, při práci jej odemkne heslem a používá Exam, Practice, Pictures, Task Box, Topic, Notes a offline režim.

Šifrovaný pack zůstává v IndexedDB zařízení. Dešifrovaný obsah ani heslo se trvale neukládají. Po novém spuštění se chráněný obsah znovu odemkne heslem.

## Dvě role originů

### Veřejná demonstrační adresa

`https://daniel22-dev.github.io/maturita-desk/`

Tento sdílený GitHub Pages origin je podporován pro shell a syntetické testování, ale **CONFIDENTIAL-EXAM je na něm záměrně blokován**.

### Produkční serverless adresa

`https://maturita.ghrabuvka.cz`

Stejný statický build zde může přijmout `CONFIDENTIAL-EXAM`, pokud současně:

1. běží na přesně připnutém izolovaném originu;
2. Content Pack má platný ECDSA P-256 publisher podpis známým veřejným klíčem;
3. uživatel zadá správné heslo k šifrovanému packu.

Tím se ostrý obsah nemusí ukládat do GitHub repozitáře ani na veřejný web. Na GitHub jde jen aplikace a **veřejný** ověřovací klíč vydavatele.

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

Architektura `school-server` zůstává připravena pro SSO, centrální autorizaci, automatickou distribuci šifrovaného Content Packu a serverovou Fact Check gateway. Není podmínkou serverless provozu 1.0.0.

## Co znamená „final baseline“

**Hotové z pohledu plánované funkčnosti:** serverless runtime, chráněné Content Packy, publisher signature, Exam/Practice workflow, Notes, PWA/offline, multi-tab guard, diagnostika zařízení, serverless-ready Ověřit / dohledat a budoucí school-server kontrakt.

**Stále vyžaduje lidskou/provozní akceptaci:** reálné device scénáře na cílovém notebooku/iPadu/telefonu, pedagogické schválení konkrétního maturitního Content Packu, jednorázové zřízení izolovaného produkčního originu a živé nasazení/behaviorální ověření Ověřit / dohledat, pokud se má používat.

Automatický PASS proto neznamená, že konkrétní obsah nebo konkrétní školní nasazení bylo lidsky schváleno.

Viz `RELEASE-1.0.0-STATUS.md`, `SERVERLESS-PRODUCTION-DEPLOY.txt` a `DEVICE-ACCEPTANCE-1.0.0.txt`.
