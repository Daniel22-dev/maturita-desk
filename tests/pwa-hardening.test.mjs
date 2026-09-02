import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = rel => fs.readFileSync(new URL(rel, root), 'utf8');
const index = read('index.html');
const css = read('src/styles.css');
const main = read('src/main.js');
const sw = read('sw.js');
const manifest = JSON.parse(read('manifest.webmanifest'));

assert.match(index, /viewport-fit=cover/);
assert.match(index, /interactive-widget=resizes-content/);
assert.doesNotMatch(index, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i, 'page zoom must remain available');
assert.match(index, /apple-mobile-web-app-capable/);
assert.match(index, /format-detection/);

assert.equal(manifest.orientation, 'any');
assert.equal(manifest.id, './');
assert.deepEqual(manifest.display_override, ['standalone', 'minimal-ui']);
assert.equal(manifest.version, '0.10.1');
assert.match(manifest.ghrab_platform.cache_name, /v0\.10\.1$/);

assert.match(css, /safe-area-inset-top/);
assert.match(css, /--visual-viewport-height/);
assert.match(css, /data-keyboard="open"/);
assert.match(css, /font-size:\s*16px\s*!important/);
assert.match(css, /object-fit:\s*contain/);
assert.match(css, /@media \(pointer: coarse\)/);
assert.match(css, /min-height:\s*44px/);
assert.match(css, /@media \(max-width: 430px\)/);
assert.match(css, /data-form-factor="tablet"\]\[data-orientation="portrait"/);
assert.doesNotMatch(css, /touch-action:\s*none/);

assert.match(main, /installDeviceRuntime/);
assert.match(main, /document\.addEventListener\('freeze'/);
assert.match(main, /document\.addEventListener\('resume'/);
assert.match(main, /window\.addEventListener\('pagehide'/);
assert.match(main, /window\.addEventListener\('pageshow'/);
assert.match(main, /state\.session\?\.status === 'running'/);
assert.match(main, /Aktualizaci neprovádím během zkoušky/);
assert.match(main, /GHRAB_SKIP_WAITING/);
assert.match(main, /touchClock\(state\.session\)/);
assert.match(main, /shellRequired = mode === 'exam' && usingProtectedContent\(\)/);
assert.match(main, /Offline shell ještě není připravený/);

assert.match(sw, /ghrab-maturita-desk-v0\.10\.1/);
assert.match(sw, /\.\/src\/device-runtime\.js/);
assert.match(sw, /runtime-config\.js/);
assert.match(sw, /config\/deployment\.json/);
assert.match(sw, /isProtectedOrRuntime/);
assert.match(sw, /canonicalEntry = relative === '\.\/' \|\| relative === '\.\/index\.html'/);
assert.match(sw, /tato offline cesta není dostupná/);

console.log('PWA/device hardening static tests: PASS');
