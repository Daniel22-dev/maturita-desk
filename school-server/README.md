# School-server reference — 1.0.1 compatible reference (Stage 12R hardened baseline)

Obsah této složky je bezpečná integrační reference pro budoucí školní backend. Nejde o produkční server a nejsou zde žádné secrets.

Soubory:
- `CONTRACT.md` — klientský kontrakt a Stage 12R fail-closed/security požadavky;
- `deployment.school-server.example.json` — non-secret deployment příklad;
- `runtime-config.school-server.example.js` — baked fallback stejného school-server profilu;
- `session-response.example.json` — syntetický tvar serverové session a signed offline lease;
- `content-delivery.example.json` — pouze tvar encrypted delivery wrapperu;
- `DEPLOY-CHECKLIST.txt` — povinné server/device/release kontroly před aktivací.

Produkční přechod vyžaduje skutečný IdP, cookie/CSRF/CORS/Origin politiku, security response headers, MDM/time policy pro offline authorization, správu podpisových a OpenAI klíčů, audit/log retention, kontrolovaný Content Pack release proces, zálohování a revokaci.

Stage 12R navíc vyžaduje release-pinned app origin v baked `runtime-config.js`, povinný logout endpoint a server-side gateway authentication pro případný inner Fact Check worker. Network deployment config není oprávněn rozšířit baked origin trust.
