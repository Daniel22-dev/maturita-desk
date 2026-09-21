#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const target=path.resolve(process.argv[2]||path.join(root,'studio-manifest.json'));
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const fail=m=>{console.error(`[STUDIO-MANIFEST] FAIL: ${m}`);process.exit(1);};
if(!fs.existsSync(target)) fail(`missing ${target}`);
const m=JSON.parse(fs.readFileSync(target,'utf8'));
if(m.schema!=='ai-studio-app-manifest-v1') fail('schema');
if(m.id!=='maturita-desk') fail(`id=${m.id}`);
if(m.version!==pkg.version) fail(`version=${m.version} expected=${pkg.version}`);
if(String(m.repository||'').toLowerCase()!=='daniel22-dev/maturita-desk') fail('repository');
if(m.compatibility?.platformContract!=='ghrab-platform-v1') fail('compatibility.platformContract');
if(m.compatibility?.platformRange!=='>=1.1.2 <2.0.0') fail('compatibility.platformRange');
if(!['2.0',2,'2','ghrab-studio-handoff-v2'].includes(m.compatibility?.studioBridge)) fail('compatibility.studioBridge');
const p=m.platform||{};
const required={contract:'ghrab-platform-v1',platformVersion:'1.1.2',requiredPlatformRange:'>=1.1.2 <2.0.0',brandVersion:'1.0.0',storagePrefix:'ghrab.maturita-desk.',cacheName:`ghrab-maturita-desk-v${pkg.version}`};
for(const [k,v] of Object.entries(required)) if(p[k]!==v) fail(`platform.${k}=${p[k]} expected=${v}`);
if(!['2.0',2,'2','ghrab-studio-handoff-v2'].includes(p.studioBridge)) fail('platform.studioBridge');
if(![1,'ghrab-artifact-envelope-v1'].includes(p.artifactEnvelope)) fail('platform.artifactEnvelope');
if(m.releaseIdentity!=null){
  const r=m.releaseIdentity;
  if(r.contract!=='ghrab-release-integrity-v2'||r.url!=='./release-integrity.json') fail('releaseIdentity pointer');
  if(r.appId!==m.id||r.version!==m.version) fail('releaseIdentity app/version');
  if(r.source?.commit!=null&&!/^[0-9a-f]{40}$/i.test(String(r.source.commit))) fail('releaseIdentity source commit');
}
console.log(`[STUDIO-MANIFEST] PASS: ${path.relative(root,target)} preserves Maturita Desk + Platform 1.1.2 contract.`);
