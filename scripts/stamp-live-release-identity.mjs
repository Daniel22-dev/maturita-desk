#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const file=path.resolve(process.argv[2]||'dist-pages/studio-manifest.json');
const commit=String(process.env.GHRAB_SOURCE_COMMIT||process.env.GITHUB_SHA||'').trim().toLowerCase();
const repository=String(process.env.GHRAB_SOURCE_REPOSITORY||process.env.GITHUB_REPOSITORY||'Daniel22-dev/maturita-desk').trim();
const buildId=String(process.env.GHRAB_BUILD_ID||'local').trim();
if(!/^[0-9a-f]{40}$/.test(commit)) throw new Error('Cannot stamp release identity without full source commit SHA');
const m=JSON.parse(fs.readFileSync(file,'utf8'));
m.releaseIdentity={contract:'ghrab-release-integrity-v2',url:'./release-integrity.json',appId:m.id,version:m.version,source:{repository,commit},buildId};
fs.writeFileSync(file,JSON.stringify(m,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',appId:m.id,version:m.version,sourceCommit:commit,buildId},null,2));
