const APP_ID = "maturita-desk";
const STUDIO_URL = new URL("/AI-Studio-GHRAB/", location.origin).href;
function fail(error) {
  console.error("[Maturita Desk manual] Authorization failed", error);
  document.documentElement.dataset.ghrabAccess = "denied";
  document.body.style.visibility = "visible";
  const main = document.createElement("main");
  main.style.cssText = "max-width:680px;margin:11vh auto;padding:28px;background:#201926;color:#fff;border:1px solid #765b80;border-radius:18px;font:16px/1.7 system-ui";
  const h = document.createElement("h1"); h.textContent = "Přístup k příručce nebyl ověřen";
  const p = document.createElement("p"); p.textContent = "Tato příručka používá stejný školní přístup jako Maturita Desk. Otevřete ji prosím z AI Studia. Bez ověřeného oprávnění se obsah nenačte.";
  const a = document.createElement("a"); a.href = STUDIO_URL; a.textContent = "Otevřít AI Studio";a.style.color = "#eab5db";
  main.append(h,p,a);
  document.body.replaceChildren(main);
}
async function start() {
  try {
    if (!["https:", "http:"].includes(location.protocol)) throw new Error("Invalid manual origin");
    const { protectApp } = await import(new URL("access/app-guard.js", STUDIO_URL).href);
    const allowed = await protectApp(APP_ID, { studioUrl: STUDIO_URL, telemetry: false, errorReporter: false });
    if (!allowed || document.documentElement.dataset.ghrabAccess !== "granted") throw new Error("Application permission not granted");
    document.body.style.visibility = "visible";
  } catch (error) { fail(error); }
}
void start();
