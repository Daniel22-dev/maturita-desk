# Maturita Desk 1.0.1 — private content & release pipeline

Tento dokument popisuje neveřejnou cestu pro skutečný maturitní obsah. Public GitHub repozitář smí obsahovat pouze shell, syntetický demo pack, veřejné publisher klíče a validační/signing nástroje. Zdrojové DOCX, clear-content mezivýstupy, `.mdreview`, reálné `.mdesk`, passphrase a publisher private key zůstávají mimo repozitář.

## 1. Obsahová revize

Aktuální reálný pack `2027.0.1-review` je interní kandidát, nikoli pedagogicky schválený ostrý obsah. Revizní rozsah zůstává 592 položek (517 Practice Topic questions + 75 Practice Task steps). Dokud lidská revize není kompletní, verze musí nést review stav a nesmí být označena jako finální obsah pro ostrou maturitu.

## 2. Šifrování

Content Pack je `maturita-desk-encrypted-pack-v1`, AES-256-GCM, PBKDF2-SHA-256. Passphrase se distribuuje odděleně od `.mdesk` a nevkládá se do GitHubu, aplikace, screenshotů ani logů.

## 3. Publisher signature — povinná pro CONFIDENTIAL-EXAM

Maturita Desk 1.0.1 před importem/odemčením `CONFIDENTIAL-EXAM` ověřuje samostatný publisher podpis:

- schema `maturita-desk-publisher-signature-v1`;
- ECDSA P-256 + SHA-256;
- veřejný ověřovací klíč je připnut v release buildu;
- privátní podpisový klíč je samostatný release secret a nikdy nesmí být v public repozitáři.

Podepsání existujícího encrypted packu:

```text
node tools/sign-content-pack.mjs <input.mdesk> <publisher.private.jwk> <output.mdesk>
```

Nezávislá kontrola podpisu:

```text
node tools/verify-content-pack-signature.mjs <output.mdesk> <publisher.public.jwk>
```

Podpis pokrývá immutable metadata a SHA-256 ciphertextu; před ověřením podpisu aplikace sama přepočítá hash přijatého payloadu.

## 4. Distribuce serverless

1. Public app build je nasazen na izolovany HTTPS origin, ktery ma platny podepsany `config/origin-authorization.json`.
2. Podepsaný reálný `.mdesk` se oprávněným učitelům předá odděleně — není hostován v public GitHub repo.
3. Učitel jej na zařízení importuje jednou; envelope zůstává šifrovaný v IndexedDB.
4. Při běžném spuštění se Content Pack odemkne heslem. Heslo ani dešifrovaný payload se trvale neukládají.
5. Nový import je potřeba až při vydání nové verze Content Packu nebo při záměrném odstranění lokální kopie.

## 5. Ověřit / dohledat je mimo content pipeline

Do online služby jde pouze explicitní `query`. Content Pack, Teacher Guidance, Notes ani identita studenta se nikdy automaticky nepřipojují. OpenAI API key je server-side secret serverless/school gateway a nemá přístup do private content pipeline.

## 6. Budoucí školní server

School-server může po autorizaci doručovat pouze encrypted + validně podepsaný `.mdesk` envelope. Clear content ani passphrase se delivery endpointem nevrací. Serverová distribuce nenahrazuje publisher signature.

## 7. Rotace klíče

Při úniku publisher private key:

1. okamžitě přestat starým klíčem podepisovat;
2. vygenerovat nový keyId/pár;
3. vydat novou verzi aplikace s novým veřejným klíčem a podle potřeby revokovat starý keyId v release policy;
4. znovu podepsat schválené distribuované packy;
5. zaznamenat incident a datum rotace.

Ztracený private key nelze obnovit z public key. Proto se bezpečně zálohuje odděleně od aplikace a Content Packů.
