# Maturita Desk 1.0.1 - Origin-neutral serverless baseline

Version: **1.0.1**
Status: **FINAL SOFTWARE BASELINE / EXTERNAL ACCEPTANCE PENDING**

## What changed from 1.0.0

- Removed the hard dependency on a school-owned production domain.
- The source repository remains `Daniel22-dev/maturita-desk`.
- The GitHub Pages origin remains public/demo-only.
- A future isolated HTTPS production origin is authorized by a signed
  `config/origin-authorization.json`, so choosing or changing the host does not
  require an application source-code release.
- Maturita Desk remains a standalone PWA and may also be launched from AI
  Studio as the same application, not as a second copy.
- Runtime trust config and the signed origin authorization are available in the
  offline shell cache, while confidential `.mdesk` files remain excluded.
- Fact Check remains unconfigured in the public build. Same-origin deployment
  is preferred when the live serverless endpoint is added.

## Security invariants

- No real exam pack, pack passphrase, OpenAI secret or private signing key is in
  the public repository.
- `CONFIDENTIAL-EXAM` requires both a valid publisher signature and an
  authorized isolated origin (or controlled localhost development mode).
- Unknown HTTPS hosts fail closed unless their exact origin has a valid signed
  authorization grant.
- The shared `daniel22-dev.github.io` origin never receives confidential access
  from the default release profile.

## External gates still pending

- physical notebook/iPad/phone acceptance;
- pedagogical approval of the real review Content Pack;
- selection and live validation of the isolated production host;
- live Fact Check deployment and behavioral AI review if that feature is used.
