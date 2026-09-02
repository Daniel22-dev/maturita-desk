from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json, re, time

ROOT = Path(__file__).resolve().parents[1]
PREVIEW = ROOT / 'preview'
PREVIEW.mkdir(exist_ok=True)
URL = 'http://127.0.0.1:8765/'

def no_serious_errors(messages):
    bad = [m for m in messages if m['type'] in ('error',) and 'favicon' not in m['text'].lower()]
    if bad:
        raise AssertionError(f"Console errors: {bad}")

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])

    # Desktop / iPad-like workflow
    context = browser.new_context(viewport={'width': 1366, 'height': 900}, service_workers='allow')
    page = context.new_page()
    fact_requests = []
    page.route('**/config/deployment.json', lambda route: route.fulfill(status=200, content_type='application/json', body='{"schema":"maturita-desk-runtime-v1","version":1,"environmentId":"standalone-local","mode":"standalone-local","serverBaseUrl":"","allowedOrigins":["self"],"auth":{"provider":"local-device","offlineLease":{"enabled":false,"publicKeys":{}}},"content":{"provider":"encrypted-local","allowManualImport":true},"factCheck":{"provider":"isolated-http","endpoint":"http://127.0.0.1:8765/api/fact-check","timeoutMs":8000}}'))
    def fact_mock(route):
        if route.request.method == 'POST':
            payload = route.request.post_data_json
            fact_requests.append(payload)
            route.fulfill(status=200, content_type='application/json', body=json.dumps({
                'schema':'maturita-desk-fact-check-v1',
                'verdict':'inaccurate',
                'confidence':'high',
                'answer':'Sydney není hlavním městem Austrálie; hlavním městem je Canberra.',
                'sources':[{'title':'Synthetic official source','url':'https://example.gov/fact'}],
                'checkedAt':'2026-09-01T12:00:00Z',
                'model':'synthetic-browser-provider',
                'searched':True
            }))
        else:
            route.continue_()
    page.route('**/api/fact-check', fact_mock)
    logs = []
    page.on('console', lambda msg: logs.append({'type': msg.type, 'text': msg.text}))
    page.goto(URL, wait_until='networkidle')
    expect(page.get_by_text('Maturita Desk', exact=True).first).to_be_visible()
    expect(page.get_by_text(re.compile('Lokální zařízení.*bez centrální identity'))).to_be_visible()
    # give SW a moment to settle and let UI rerender
    page.wait_for_timeout(800)
    page.screenshot(path=str(PREVIEW/'stage13-home-desktop.png'), full_page=True)

    # Import and unlock the encrypted synthetic Content Pack.
    page.get_by_role('button', name='Content Pack', exact=True).click()
    sample = ROOT / 'samples' / 'synthetic-demo-2027.mdesk'
    page.locator('[data-content-pack-file]').set_input_files(str(sample))
    expect(page.get_by_text(re.compile('Synthetic Demo 2027.*zamčeno'))).to_be_visible()
    page.locator('[data-pack-passphrase]').fill('DEMO-ONLY-2027')
    page.get_by_role('button', name='Odemknout Content Pack').click()
    expect(page.get_by_text(re.compile('Synthetic Demo 2027.*odemčeno'))).to_be_visible()

    # Stage 8/10 pedagogical review workspace: human decisions are local and separate from the pack.
    page.get_by_role('button', name='Otevřít revizi').click()
    expect(page.get_by_role('heading', name='Teacher Guidance')).to_be_visible()
    expect(page.get_by_text(re.compile(r'\d+ / \d+'))).to_be_visible()
    first_review = page.locator('[data-action="review-select"]').first
    expect(first_review).to_be_visible()
    first_review.click()
    expect(page.get_by_text('Student prompt', exact=True)).to_be_visible()
    page.get_by_role('button', name=re.compile('Schválit beze změny')).click()
    expect(page.get_by_text(re.compile('Schváleno beze změny'))).to_be_visible()
    page.screenshot(path=str(PREVIEW/'stage13-review-desktop.png'), full_page=True)
    page.get_by_role('button', name='Úvod').click()

    page.get_by_role('button', name=re.compile('Ostrá zkouška')).click()
    page.get_by_role('button', name=re.compile(r'^14')).click()
    expect(page.get_by_role('button', name=re.compile('Zahájit zkoušku'))).to_be_enabled()
    expect(page.get_by_text(re.compile('Struktura validní'))).to_be_visible()
    page.screenshot(path=str(PREVIEW/'stage13-preflight-desktop.png'), full_page=True)

    page.get_by_role('button', name=re.compile('Zahájit zkoušku')).click()
    expect(page.get_by_role('heading', name='Picture Comparison')).to_be_visible()
    expect(page.get_by_text('Target question', exact=True)).to_be_visible()
    expect(page.get_by_text('Body k porovnání', exact=True)).to_be_visible()

    # Stage 13 Fact Check: only explicit teacher query is sent; exam timer keeps running.
    page.get_by_role('button', name='Ověřit / dohledat').first.click()
    fact_query = 'Student tvrdí, že Sydney je hlavní město Austrálie.'
    page.locator('[data-fact-query]').fill(fact_query)
    page.get_by_role('button', name='Ověřit na webu').click()
    expect(page.get_by_text('Nepřesné', exact=True)).to_be_visible()
    expect(page.get_by_text(re.compile('Sydney není hlavním městem'))).to_be_visible()
    expect(page.get_by_role('link', name='Synthetic official source')).to_be_visible()
    assert fact_requests == [{'query': fact_query}]
    page.screenshot(path=str(PREVIEW/'stage13-fact-check-desktop.png'), full_page=True)
    page.get_by_role('button', name='Zavřít').click()
    # Peek into Topic: active phase must remain pictures.
    page.get_by_role('button', name='Topic', exact=True).first.click()
    expect(page.get_by_text(re.compile('Pouze náhled'))).to_be_visible()
    session = json.loads(page.evaluate("localStorage.getItem('ghrab.maturita-desk.session.v1')"))
    assert session['activePhase'] == 'pictures' and session['viewPhase'] == 'topic'

    # Notes persist.
    page.get_by_role('button', name='Poznámky').first.click()
    page.get_by_role('button', name='Pictures').last.click()
    expect(page.get_by_text(re.compile('Bez identifikace studenta'))).to_be_visible()
    note = 'synthetic browser note'
    note_field = page.locator('[data-notes-input][data-phase="pictures"]')
    expect(note_field).to_have_attribute('maxlength', '5000')
    note_field.fill(note)
    page.get_by_role('button', name='Zavřít').click()
    expect(page.locator('[data-note-indicator-phase="pictures"].has-note').first).to_be_attached()
    page.get_by_role('button', name='Vrátit se').click()

    # Explicit transition confirmation.
    page.get_by_role('button', name='Přejít na Task Box').click()
    expect(page.get_by_role('heading', name=re.compile('Přejít na Task Box'))).to_be_visible()
    page.get_by_role('button', name='Přejít a spustit čas').click()
    expect(page.get_by_role('heading', name='Task Box')).to_be_visible()
    expect(page.locator('.task-data-card')).to_have_count(3)
    expect(page.locator('.task-quote')).to_have_count(1)

    # Simulate elapsed time + reload to verify timestamp restoration.
    page.evaluate("""
      const key='ghrab.maturita-desk.session.v1';
      const s=JSON.parse(localStorage.getItem(key));
      const now=Date.now();
      s.startedAt=now-390000;
      s.phaseStartedAt=now-250000;
      s.lastKnownNow=now-250000;
      s.updatedAt=now-250000;
      localStorage.setItem(key, JSON.stringify(s));
    """)
    page.reload(wait_until='networkidle')
    expect(page.get_by_role('heading', name='Odemkněte Content Pack')).to_be_visible()
    expect(page.get_by_text(re.compile('Probíhající relace'))).to_be_visible()
    page.locator('[data-pack-passphrase]').fill('DEMO-ONLY-2027')
    page.get_by_role('button', name='Odemknout a obnovit relaci').click()
    expect(page.get_by_text(re.compile('obnoveno'))).to_be_visible()
    # Phase clock should be roughly 4:10 and class over; unlock must not reset timestamps.
    phase_clock = page.locator('[data-phase-clock][data-phase="task"]')
    expect(phase_clock).to_have_class(re.compile('over'))
    expect(phase_clock.locator('strong')).to_contain_text('04:')
    page.get_by_role('button', name='Poznámky').first.click()
    page.get_by_role('button', name='Pictures').last.click()
    expect(page.locator('[data-notes-input][data-phase="pictures"]')).to_have_value(note)
    page.get_by_role('button', name='Zavřít').click()

    # Move to Topic, use section navigation, finish with confirmation.
    page.get_by_role('button', name='Přejít na téma').click()
    page.get_by_role('button', name='Přejít a spustit čas').click()
    expect(page.get_by_role('heading', name='Topic')).to_be_visible()
    section_buttons = page.locator('[data-section-button]')
    assert section_buttons.count() >= 3
    section_buttons.nth(2).click()
    page.screenshot(path=str(PREVIEW/'stage13-console-desktop.png'), full_page=True)

    page.get_by_role('button', name='Ukončit zkoušku').click()
    expect(page.get_by_role('heading', name='Ukončit zkoušku?')).to_be_visible()
    page.get_by_role('button', name='Ukončit a zastavit čas').click()
    expect(page.get_by_text('Relace ukončena')).to_be_visible()
    expect(page.get_by_text(note)).to_be_visible()
    page.screenshot(path=str(PREVIEW/'stage13-summary-desktop.png'), full_page=True)

    # New topic must confirm deletion because notes exist.
    page.get_by_role('button', name='Nové téma').click()
    expect(page.get_by_role('heading', name='Smazat pracovní poznámky?')).to_be_visible()
    page.get_by_role('button', name='Smazat a pokračovat').click()
    expect(page.get_by_role('heading', name='Vyberte téma')).to_be_visible()
    assert page.evaluate("localStorage.getItem('ghrab.maturita-desk.session.v1')") is None

    # Offline reload: shell must remain usable after SW cache warm-up.
    page.goto(URL, wait_until='networkidle')
    page.wait_for_timeout(800)
    context.set_offline(True)
    page.reload(wait_until='domcontentloaded')
    expect(page.get_by_text('Maturita Desk', exact=True).first).to_be_visible()
    expect(page.get_by_text('Offline', exact=True)).to_be_visible()
    page.screenshot(path=str(PREVIEW/'stage13-offline-desktop.png'), full_page=True)
    context.set_offline(False)
    no_serious_errors(logs)
    context.close()

    # Phone workflow
    mobile = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='allow')
    page = mobile.new_page()
    mlogs = []
    page.on('console', lambda msg: mlogs.append({'type': msg.type, 'text': msg.text}))
    page.goto(URL, wait_until='networkidle')
    page.get_by_role('button', name=re.compile('Ostrá zkouška')).click()
    page.get_by_role('button', name=re.compile(r'^14')).click()
    page.get_by_role('button', name=re.compile('Zahájit zkoušku')).click()
    expect(page.get_by_role('heading', name='Picture Comparison')).to_be_visible()
    # Mobile picture selector and sticky phase nav must exist.
    expect(page.get_by_role('button', name='Picture A')).to_be_visible()
    page.get_by_role('button', name='Picture B').click()
    expect(page.locator('.picture-card.mobile-show')).to_have_count(1)
    page.screenshot(path=str(PREVIEW/'stage13-console-phone.png'), full_page=True)
    # Notes full-screen drawer on phone remains editable.
    page.get_by_role('button', name='Poznámky').last.click()
    expect(page.get_by_text(re.compile('Bez identifikace studenta'))).to_be_visible()
    page.locator('[data-notes-input]').fill('phone synthetic note')
    page.screenshot(path=str(PREVIEW/'stage13-notes-phone.png'), full_page=True)
    no_serious_errors(mlogs)
    mobile.close()

    # iPad portrait/landscape hardening: portrait is supported but gets a non-blocking recommendation.
    tablet = browser.new_context(viewport={'width': 820, 'height': 1180}, is_mobile=True, has_touch=True, service_workers='allow')
    page = tablet.new_page()
    tlogs = []
    page.on('console', lambda msg: tlogs.append({'type': msg.type, 'text': msg.text}))
    page.goto(URL, wait_until='networkidle')
    page.get_by_role('button', name=re.compile('Ostrá zkouška')).click()
    page.get_by_role('button', name=re.compile(r'^14')).click()
    page.get_by_role('button', name=re.compile('Zahájit zkoušku')).click()
    expect(page.locator('.orientation-hint')).to_be_visible()
    assert page.locator('.picture-card img').first.evaluate("el => getComputedStyle(el).objectFit") == 'contain'
    page.screenshot(path=str(PREVIEW/'stage13-console-ipad-portrait.png'), full_page=True)
    page.set_viewport_size({'width': 1180, 'height': 820})
    expect(page.locator('.orientation-hint')).to_be_hidden()
    page.screenshot(path=str(PREVIEW/'stage13-console-ipad-landscape.png'), full_page=True)
    no_serious_errors(tlogs)
    tablet.close()

    browser.close()

print('Browser smoke: PASS')
