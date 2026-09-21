# Maturita Desk — Stage 11 status

**Verze:** 0.9.0  
**Etapa:** iPad / telefon / PWA hardening  
**Verdikt:** TECHNICAL_READY_FOR_REAL_DEVICE_PILOT / DEVICE_ACCEPTANCE_PENDING

## Hotovo

- phone / tablet / desktop runtime klasifikace;
- tablet landscape preferovaný, portrait plně funkční a pouze doporučeně označený;
- telefonní portrait/landscape layout bez ztráty Exam/Practice funkcí;
- VisualViewport handling softwarové klávesnice;
- safe-area handling pro iOS/iPadOS;
- 16px mobile form controls proti Safari input auto-zoomu;
- coarse-pointer touch target baseline 44 px;
- comparison images bez cropu (`object-fit: contain`);
- lightbox s pan/pinch zoomem;
- lifecycle persistence: visibility, pagehide/pageshow, freeze/resume, focus, beforeunload;
- sleep/background timer recovery a clock rollback protection;
- Wake Lock re-request po návratu do foregroundu;
- service-worker update je z UI odložen během running session;
- protected Exam Mode má offline-shell pre-flight gate;
- deployment-relative PWA manifest identity;
- Stage 3–10 regresní testy zůstaly PASS.

## Automatické QA

- `npm test`: PASS;
- 18 samostatných `.test.mjs` sad + hlavní runtime smoke: PASS;
- device runtime: PASS;
- keyboard/pinch negative control: PASS;
- device sleep/resume timer: PASS;
- PWA/touch static contract: PASS;
- no-secret / synthetic-only validator: PASS;
- Stage 10 server/provider regrese: PASS.
- clean-unpack verification finálního veřejného ZIPu: PASS; jediný `.mdesk` v balíku je syntetický sample.

## Browser smoke

Playwright test byl aktualizován pro:
- desktop;
- telefon 390 × 844;
- iPad portrait 820 × 1180;
- iPad landscape 1180 × 820;
- offline reload;
- protected pack unlock/re-unlock;
- Fact Check query-only;
- picture no-crop;
- orientation hint.

V tomto prostředí Chromium zablokovalo localhost na `ERR_BLOCKED_BY_ADMINISTRATOR`. Browser smoke proto **není PASS ani FAIL aplikace**; je `BLOCKED_BY_ENVIRONMENT`. Log: `preview/browser-smoke-stage11.log`.

## Co ještě musí proběhnout

Fyzický acceptance test na skutečném iPadu a telefonu podle `DEVICE-PILOT-CHECKLIST.txt`. Do té doby Stage 11 neoznačuje Safari/iPadOS device gate za ověřený.
