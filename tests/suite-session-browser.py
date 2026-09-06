from pathlib import Path
from urllib.parse import urlparse, unquote
import mimetypes
from playwright.sync_api import sync_playwright, expect
import json, os, secrets, re

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('MATURITA_DESK_TEST_URL', 'https://daniel22-dev.github.io/maturita-desk/')
ROUTED_LOCAL = os.environ.get('GHRAB_BROWSER_ROUTED', '1') == '1'
CANARY_ID = os.environ.get('GARP_CANARY_ID') or f"20260906-MD112-{secrets.token_hex(4).upper()}"
CANARY = f'GARP-STUDENT-CANARY-{CANARY_ID}'
CANARY_EMAIL = f'garp.student.canary.{CANARY_ID}@example.invalid'
GEN_KEY = 'ghrab.platform.suite-session-generation.v1'
SEEN_KEY = 'ghrab.maturita-desk.suite-session-seen.v1'
STATUS_KEY = 'ghrab.maturita-desk.suite-session-status.v1'
SESSION_KEY = 'ghrab.maturita-desk.session.v1'

CLEAR_LOCAL = [
    SESSION_KEY,
    'ghrab.maturita-desk.session-owner.v1',
    'ghrab.maturita-desk.pilot-run.v1',
    'ghrab.maturita-desk.auth-lease.v1'
]
CLEAR_SESSION = ['ghrab.maturita-desk.fact-access.v1']
REVIEW_DB = 'ghrab.maturita-desk.pedagogical-review.v1'
PROTECTED_DB = 'ghrab.maturita-desk.protected-content.v1'



def routed_context(browser):
    context = browser.new_context(service_workers='block')
    if not ROUTED_LOCAL:
        return context
    base = urlparse(URL)
    prefix = base.path if base.path.endswith('/') else base.path + '/'
    def handler(route):
        req = urlparse(route.request.url)
        if req.scheme != base.scheme or req.netloc != base.netloc or not req.path.startswith(prefix):
            route.abort()
            return
        rel = unquote(req.path[len(prefix):])
        if rel in ('', '/'):
            rel = 'index.html'
        if rel == 'neutral.html':
            route.fulfill(status=200, content_type='text/html; charset=utf-8', body='<!doctype html><html><body>neutral same-origin coordinator</body></html>')
            return
        target = (ROOT / rel).resolve()
        try:
            target.relative_to(ROOT.resolve())
        except ValueError:
            route.fulfill(status=403, body='forbidden')
            return
        if not target.is_file():
            route.fulfill(status=404, body='not found')
            return
        ctype = mimetypes.guess_type(str(target))[0] or 'application/octet-stream'
        if target.suffix in ('.js', '.mjs'):
            ctype = 'text/javascript'
        elif target.suffix == '.webmanifest':
            ctype = 'application/manifest+json'
        route.fulfill(status=200, content_type=ctype, body=target.read_bytes())
    context.route('**/*', handler)
    return context

def seed_owned_data(page):
    page.evaluate("""async ({canary,email}) => {
      localStorage.setItem('ghrab.maturita-desk.session.v1', JSON.stringify({schema:'synthetic-suite-canary',notes:canary,email}));
      localStorage.setItem('ghrab.maturita-desk.session-owner.v1', canary);
      localStorage.setItem('ghrab.maturita-desk.pilot-run.v1', JSON.stringify({note:canary}));
      localStorage.setItem('ghrab.maturita-desk.auth-lease.v1', 'lease-'+canary);
      localStorage.setItem('ghrab.maturita-desk.installation-id.v1', 'mdi-SYNTHETIC-PRESERVE');
      localStorage.setItem('ghrab.maturita-desk.ui-settings.v1', JSON.stringify({theme:'dark'}));
      sessionStorage.setItem('ghrab.maturita-desk.fact-access.v1', 'token-'+canary);
      await new Promise((resolve,reject) => {
        const req=indexedDB.open('ghrab.maturita-desk.pedagogical-review.v1',1);
        req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains('records')) req.result.createObjectStore('records',{keyPath:'key'}); };
        req.onerror=()=>reject(req.error);
        req.onsuccess=()=>{
          const db=req.result; const tx=db.transaction('records','readwrite');
          tx.objectStore('records').put({key:'synthetic-canary',record:{note:canary,email}});
          tx.oncomplete=()=>{db.close(); resolve();}; tx.onerror=()=>reject(tx.error);
        };
      });
    }""", {'canary': CANARY, 'email': CANARY_EMAIL})


def assert_cleanup(page):
    snapshot = page.evaluate("""async ({clearLocal,clearSession,reviewDb,protectedDb}) => {
      const local=Object.fromEntries(clearLocal.map(k=>[k,localStorage.getItem(k)]));
      const session=Object.fromEntries(clearSession.map(k=>[k,sessionStorage.getItem(k)]));
      const dbs=typeof indexedDB.databases==='function' ? (await indexedDB.databases()).map(x=>x.name) : [];
      return {local,session,dbs,install:localStorage.getItem('ghrab.maturita-desk.installation-id.v1'),ui:localStorage.getItem('ghrab.maturita-desk.ui-settings.v1')};
    }""", {'clearLocal': CLEAR_LOCAL, 'clearSession': CLEAR_SESSION, 'reviewDb': REVIEW_DB, 'protectedDb': PROTECTED_DB})
    assert all(value is None for value in snapshot['local'].values()), snapshot
    assert all(value is None for value in snapshot['session'].values()), snapshot
    if snapshot['dbs']:
        assert REVIEW_DB not in snapshot['dbs'], snapshot
        assert PROTECTED_DB in snapshot['dbs'], snapshot
    assert snapshot['install'] == 'mdi-SYNTHETIC-PRESERVE', snapshot
    assert json.loads(snapshot['ui'])['theme'] == 'dark', snapshot


def wait_ack(page, generation):
    page.wait_for_function("([seen,g]) => localStorage.getItem(seen) === g", [SEEN_KEY, generation], timeout=10000)
    page.wait_for_function("([status,g]) => { try { const x=JSON.parse(localStorage.getItem(status)||'null'); return x && x.generation===g && x.phase==='acknowledged'; } catch { return false; } }", [STATUS_KEY, generation], timeout=10000)


def start_demo_session(page, note):
    page.get_by_role('button', name=re.compile('Ostrá zkouška')).click()
    page.get_by_role('button', name=re.compile(r'^14')).click()
    page.get_by_role('button', name='Zahájit zkoušku').click()
    expect(page.get_by_role('heading', name='Picture Comparison')).to_be_visible()
    page.get_by_role('button', name='Poznámky').first.click()
    field = page.locator('[data-notes-input][data-phase="pictures"]')
    field.fill(note)
    page.get_by_role('button', name='Zavřít').click()


def no_unexpected_canary(page):
    data = page.evaluate("""async (canary) => {
      const hits=[];
      for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); const v=localStorage.getItem(k)||''; if(v.includes(canary)) hits.push('localStorage:'+k); }
      for(let i=0;i<sessionStorage.length;i++){ const k=sessionStorage.key(i); const v=sessionStorage.getItem(k)||''; if(v.includes(canary)) hits.push('sessionStorage:'+k); }
      for(const name of await caches.keys()){
        const cache=await caches.open(name); for(const req of await cache.keys()) { try { const res=await cache.match(req); const txt=await res.clone().text(); if(txt.includes(canary)) hits.push('cache:'+name+':'+req.url); } catch {} }
      }
      return hits;
    }""", CANARY)
    assert data == [], data


with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])

    # 1) Open-child suite end, real Platform 1.1.2, cache preservation and canary cleanup.
    context = routed_context(browser)
    page = context.new_page()
    page.goto(URL, wait_until='networkidle')
    expect(page.get_by_text('Maturita Desk', exact=True).first).to_be_visible()
    assert page.evaluate("GHRAB_PLATFORM.version") == '1.1.2'
    assert page.evaluate("GHRAB_PLATFORM.session.contract") == 'ghrab-suite-session-v1'
    # Runtime a11y smoke: every visible button exposed by Chromium has a non-empty accessible name.
    unnamed = page.locator('button:visible').evaluate_all("els => els.filter(el => !(el.innerText||el.getAttribute('aria-label')||el.getAttribute('title')||'').trim()).length")
    assert unnamed == 0
    # Cache Storage is explicitly non-content and must survive suite cleanup. In the routed browser harness
    # service workers are blocked by the environment, so seed the real app cache namespace directly.
    page.evaluate("""async () => { const c=await caches.open('ghrab-maturita-desk-v1.0.3'); await c.put('./synthetic-static', new Response('synthetic static cache')); }""")
    caches_before = page.evaluate("caches.keys()")
    assert 'ghrab-maturita-desk-v1.0.3' in caches_before, caches_before
    # Protected DB is opened by the normal content manager and must survive suite cleanup.
    page.wait_for_timeout(250)
    seed_owned_data(page)
    result = page.evaluate("GHRAB_PLATFORM.session.end({reason:'qa-open-child'})")
    generation = result['generation']
    wait_ack(page, generation)
    assert_cleanup(page)
    assert page.evaluate("caches.keys()") == caches_before
    no_unexpected_canary(page)
    context.close()

    # 2) Delayed-open replay and idempotent reload.
    context = routed_context(browser)
    page = context.new_page()
    page.goto(URL + 'neutral.html', wait_until='domcontentloaded')
    seed_owned_data(page)
    delayed_gen = 'browser-delayed-' + CANARY_ID
    page.evaluate("([gk,sk,g]) => { localStorage.setItem(gk,g); localStorage.removeItem(sk); }", [GEN_KEY, SEEN_KEY, delayed_gen])
    page.goto(URL, wait_until='networkidle')
    wait_ack(page, delayed_gen)
    assert_cleanup(page)
    status_before = page.evaluate("key => localStorage.getItem(key)", STATUS_KEY)
    page.reload(wait_until='networkidle')
    expect(page.get_by_text('Maturita Desk', exact=True).first).to_be_visible()
    status_after = page.evaluate("key => localStorage.getItem(key)", STATUS_KEY)
    assert status_after == status_before, 'same generation replayed destructive cleanup on reload'
    no_unexpected_canary(page)
    context.close()

    # 3) Multi-tab: stale in-memory Notes must not resurrect after suite end.
    context = routed_context(browser)
    page1 = context.new_page(); page1.goto(URL, wait_until='networkidle')
    start_demo_session(page1, CANARY)
    page2 = context.new_page(); page2.goto(URL, wait_until='networkidle')
    assert CANARY in (page1.evaluate("key => localStorage.getItem(key)", SESSION_KEY) or '')
    result = page1.evaluate("GHRAB_PLATFORM.session.end({reason:'qa-multitab'})")
    multitab_gen = result['generation']
    # Trigger lifecycle persistence aggressively while cross-tab cleanup is in flight.
    page2.evaluate("() => { window.dispatchEvent(new Event('pagehide')); window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('pageshow')); }")
    wait_ack(page1, multitab_gen)
    page1.wait_for_timeout(400)
    assert page1.evaluate("key => localStorage.getItem(key)", SESSION_KEY) is None
    assert page2.evaluate("key => localStorage.getItem(key)", SESSION_KEY) is None
    assert CANARY not in page1.locator('body').inner_text()
    assert CANARY not in page2.locator('body').inner_text()
    no_unexpected_canary(page1)
    context.close()

    # 4) Browser Back/Forward / BFCache-like restore: pageshow reconcile must clear stale session.
    context = routed_context(browser)
    page = context.new_page(); page.goto(URL, wait_until='networkidle')
    start_demo_session(page, CANARY)
    page.goto(URL + 'neutral.html', wait_until='domcontentloaded')
    history_gen = 'browser-history-' + CANARY_ID
    page.evaluate("([gk,sk,g]) => { localStorage.setItem(gk,g); localStorage.removeItem(sk); }", [GEN_KEY, SEEN_KEY, history_gen])
    page.go_back(wait_until='domcontentloaded')
    wait_ack(page, history_gen)
    assert page.evaluate("key => localStorage.getItem(key)", SESSION_KEY) is None
    assert CANARY not in page.locator('body').inner_text()
    page.go_forward(wait_until='domcontentloaded')
    page.go_back(wait_until='domcontentloaded')
    expect(page.get_by_text('Maturita Desk', exact=True).first).to_be_visible()
    assert page.evaluate("key => localStorage.getItem(key)", SESSION_KEY) is None
    no_unexpected_canary(page)
    context.close()

    # 5) Fail-closed runtime: forced localStorage delete error prevents acknowledgement; reload retries once restored.
    context = routed_context(browser)
    page = context.new_page(); page.goto(URL, wait_until='networkidle')
    seed_owned_data(page)
    page.evaluate("""(target) => {
      window.__suiteOriginalRemoveItem = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function(key) {
        if (key === target) throw new Error('synthetic suite delete failure');
        return window.__suiteOriginalRemoveItem.call(this, key);
      };
    }""", SESSION_KEY)
    result = page.evaluate("GHRAB_PLATFORM.session.end({reason:'qa-fail-closed'})")
    fail_gen = result['generation']
    page.wait_for_function("([status,g]) => { try { const x=JSON.parse(localStorage.getItem(status)||'null'); return x && x.generation===g && x.phase==='failed'; } catch { return false; } }", [STATUS_KEY, fail_gen], timeout=10000)
    assert page.evaluate("([seen,g]) => localStorage.getItem(seen) !== g", [SEEN_KEY, fail_gen])
    assert CANARY in (page.evaluate("key => localStorage.getItem(key)", SESSION_KEY) or '')
    page.evaluate("Storage.prototype.removeItem = window.__suiteOriginalRemoveItem")
    page.reload(wait_until='networkidle')
    wait_ack(page, fail_gen)
    assert_cleanup(page)
    no_unexpected_canary(page)
    context.close()

    browser.close()

print(f'Suite-session browser QA: PASS | canary={CANARY} | email={CANARY_EMAIL}')
