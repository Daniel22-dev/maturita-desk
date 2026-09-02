# SECURITY NOTES — Maturita Desk 1.0.1 Serverless

## Trust model

Veřejný shell neobsahuje reálné maturitní zadání, heslo, OpenAI API klíč ani privátní publisher klíč. `CONFIDENTIAL-EXAM` je přijímán pouze na localhostu pro řízený vývoj nebo na izolovaném HTTPS originu s platným podepsaným origin authorization grantem a platným ECDSA P-256 publisher podpisem.

GitHub Pages origin `https://daniel22-dev.github.io` zůstává demo/synthetic-safe. Produkční adresa není hard-coded; její přesný origin musí být autorizován podepsaným `config/origin-authorization.json`. Localhost je povolen pouze jako vývojový fallback.

## Content Pack

- AES-256-GCM + PBKDF2-SHA-256 chrání payload pod sdílenou passphrase;
- ciphertext SHA-256 je kontrolován před ověřením publisher signature;
- CONFIDENTIAL-EXAM vyžaduje `maturita-desk-publisher-signature-v1`, ECDSA P-256 / SHA-256;
- veřejný klíč je release trust anchor a síťová konfigurace jej smí pouze zúžit, nikoli nahradit;
- dešifrovaný pack a passphrase se trvale neukládají;
- Service Worker `.mdesk` necachuje;
- limit envelope zůstává 32 MiB.

## Fact Check / Ověřit / dohledat

Browser posílá pouze `{query}`. Automatický exam context, Notes, Content Pack a student identity jsou zakázány. OpenAI API klíč je pouze server-side. Serverless worker vyžaduje přesný Origin, rate limiter a právě jeden auth režim: dočasný teacher access token, nebo budoucí server-to-server inner gate.

## Browser threat model

Publisher signature nechrání proti oprávněnému uživateli, který již odemčený obsah fotografuje/kopíruje, ani proti plně kompromitovanému koncovému zařízení. Ochrana je určena proti neautorizované distribuci/tamperingu packu a proti náhodnému či chybnému nasazení.

## Stále externě ověřované body

Fyzické device acceptance, provozní security headers/hosting vlastnosti, pedagogické schválení konkrétního packu a behaviorální test živého AI provideru nejsou nahrazeny automatickými unit/regression testy.
