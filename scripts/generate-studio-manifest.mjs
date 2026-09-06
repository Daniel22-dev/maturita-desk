import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const template = fs.readFileSync(path.join(root, 'src', 'studio-manifest.template.json'), 'utf8');
const buildTime = new Date().toISOString();
const rendered = template
  .replaceAll('__APP_VERSION__', pkg.version)
  .replaceAll('__BUILD_TIME__', buildTime);
const manifest = JSON.parse(rendered);
fs.writeFileSync(path.join(root, 'studio-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`studio-manifest.json generated for Maturita Desk ${pkg.version}`);
