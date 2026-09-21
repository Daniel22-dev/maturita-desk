#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const out=path.join(root,'dist-pages');
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(out,{recursive:true});

const files=[
  '.nojekyll','index.html','manifest.webmanifest','runtime-config.js','sw.js',
  'ghrab-platform.consumer.json','platform-build-info.json','studio-manifest.json'
];
const dirs=['assets','ghrab','config','src'];
for(const rel of files){
  const src=path.join(root,rel);
  if(!fs.existsSync(src)) throw new Error(`Pages build missing required file: ${rel}`);
  fs.copyFileSync(src,path.join(out,rel));
}
for(const rel of dirs){
  const src=path.join(root,rel);
  if(!fs.existsSync(src)) throw new Error(`Pages build missing required directory: ${rel}`);
  fs.cpSync(src,path.join(out,rel),{recursive:true});
}
fs.rmSync(path.join(out,'src','studio-manifest.template.json'),{force:true});

const forbidden=[];
function walk(dir,base=''){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const abs=path.join(dir,entry.name);
    const rel=path.posix.join(base,entry.name);
    if(entry.isDirectory()) walk(abs,rel);
    else if(entry.isFile() && /(?:^|\/)(?:tests?|scripts?|tools?|security|school-server|serverless)(?:\/|$)|\.(?:mdesk|mdreview|zip|docx|pdf|pptx|xlsx|tmp)$/i.test(rel)) forbidden.push(rel);
  }
}
walk(out);
if(forbidden.length) throw new Error(`Pages build contains forbidden release files: ${forbidden.join(', ')}`);
console.log(JSON.stringify({status:'PASS',output:'dist-pages',files:count(out)},null,2));

function count(dir){let n=0;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())n+=count(p);else if(e.isFile())n++;}return n;}
