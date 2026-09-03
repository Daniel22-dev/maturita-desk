# Maturita Desk 1.0.1 – integrace do AI Studia

## Cíl

Maturita Desk zůstává samostatná PWA na vlastním izolovaném HTTPS originu. AI Studio ji pouze eviduje, zobrazuje oprávněným učitelům jako dlaždici a po kontrole oprávnění spouští.

AI Studio **nenahrazuje** ochranu maturitního obsahu a nepřenáší do Maturita Desk svůj `localStorage` permit. Ostrý obsah zůstává chráněn vlastními vrstvami Maturita Desk:

1. podepsaná autorizace přesného produkčního originu;
2. platný publisher podpis `.mdesk` Content Packu;
3. šifrování Content Packu;
4. heslo k Content Packu.

Veřejný origin `https://daniel22-dev.github.io/maturita-desk/` zůstává pouze demo/syntetický shell a nesmí být použit pro `CONFIDENTIAL-EXAM`.

## Aktivace po zvolení hostingu

1. Zvolit izolovaný HTTPS origin, například adresu poskytnutou hostingem.
2. Nasadit na něj přesně schválený build Maturita Desk.
3. Pomocí `tools/sign-origin-authorization.mjs` vytvořit `config/origin-authorization.json` svázaný s přesným produkčním originem. Privátní podpisový klíč zůstává mimo GitHub.
4. Ověřit, že produkční origin přijímá pouze platně podepsaný `CONFIDENTIAL-EXAM` pack a odmítá neplatný podpis / nesprávné heslo.
5. Z `studio/app-manifest.production.template.json` vytvořit veřejný `studio-manifest.json`: nahradit `__PRODUCTION_ORIGIN__` přesným produkčním originem.
6. V AI Studio GHRAB přidat do `src/config/sources.json` zdroj `maturita-desk` s URL `${PRODUCTION_ORIGIN}/studio-manifest.json`.
7. Přidat stejný manifest do fallback registru AI Studia a ikonu dlaždice.
8. Vydat nový podepsaný access config bundle obsahující aplikační ID `maturita-desk` a následně nové učitelské permits jen těm kolegům, kteří mají mít aplikaci dostupnou.
9. Ověřit scénáře: admin, oprávněný učitel, neoprávněný učitel, přímá URL, chybný/platný `.mdesk`, chybné/platné heslo, offline restart a návrat do AI Studia.

## Aplikační ID

`maturita-desk`

Navržený kód proškolení v serverless access policy AI Studia: `MAT-01`.

## Bezpečnostní hranice

Dlaždice AI Studia je **launcher gate**, nikoli jediná ochranná vrstva. Znalost produkční URL sama o sobě nesmí zpřístupnit maturitní obsah.

Maturita Desk se kvůli `CONFIDENTIAL-EXAM` nesmí přesunout pod sdílený produkční origin ostatních aplikací jen kvůli společnému `localStorage` tokenu.

## Co se nesmí publikovat

- reálný ostrý `.mdesk`;
- heslo k Content Packu;
- publisher private key;
- origin-authorization private key;
- OpenAI API key;
- studentská data.
