const root=document.documentElement;
const APP_ID='maturita-desk';
const onLocal=location.protocol==='file:'||['localhost','127.0.0.1'].includes(location.hostname);
function errorScreen(){
  root.dataset.ghrabAccess='denied';
  document.body.style.visibility='visible';
  const main=document.createElement('main');
  main.style.cssText='max-width:42rem;margin:4rem auto;padding:1.5rem;font:16px/1.7 system-ui;color:#fff';
  const h=document.createElement('h1');h.textContent='Přístup k manuálu nelze ověřit';
  const p=document.createElement('p');p.textContent='Tento manuál používá oprávnění Maturita Desk v AI Studiu. Přihlaste se do školního Studia a otevřete jej odtud.';
  const a=document.createElement('a');a.href='/AI-Studio-GHRAB/';a.textContent='Zpět do AI Studia';a.style.color='#ffa8ce';
  main.append(h,p,a);document.body.replaceChildren(main);
}
try{
  let allowed=onLocal;
  if(!onLocal){
    const module=await import('/AI-Studio-GHRAB/access/app-guard.js');
    allowed=await module.protectApp(APP_ID,{studioUrl:'/AI-Studio-GHRAB/',telemetry:false,errorReporter:false});
  }
  if(!allowed)throw Error('Missing GHRAB permit');
  root.dataset.ghrabAccess='granted';
  document.body.style.visibility='visible';
  window.GHRAB_MANUAL_DOC_INFO=Object.freeze({
    appId:APP_ID,appVersion:'1.0.6',docRevision:'D-2026-10-08',
    lastReviewedAt:'2026-10-08',reviewStatus:'review-required',
    pdfContentContract:'static-complete-sections-v1'
  });
}catch(error){
  console.error('Protected Maturita Desk manual access denied',error);
  errorScreen();
}
