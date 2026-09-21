#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=process.cwd();
const dist=path.resolve(process.argv[2]||'dist-pages');
const out=path.resolve(process.argv[3]||path.join(dist,'sbom.cdx.json'));
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
if(!fs.existsSync(dist)) throw new Error('SBOM: missing deployment directory');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const components=[
  {ref:'ghrab:platform-js:1.1.2',name:'GHRAB Platform JS',rel:'ghrab/ghrab-platform.js'},
  {ref:'ghrab:platform-css:1.1.2',name:'GHRAB Platform CSS',rel:'ghrab/ghrab-platform.css'}
].map(x=>{
  const file=path.join(dist,x.rel);
  if(!fs.existsSync(file)) throw new Error(`SBOM missing deployed component: ${x.rel}`);
  return {'bom-ref':x.ref,type:'library',name:x.name,version:'1.1.2',scope:'required',hashes:[{alg:'SHA-256',content:sha(file)}],properties:[{name:'ghrab:deploymentPath',value:x.rel},{name:'ghrab:vendored',value:'true'}]};
});
const appRef=`pkg:npm/${pkg.name}@${pkg.version}`;
const bom={'$schema':'https://cyclonedx.org/schema/bom-1.7.schema.json',bomFormat:'CycloneDX',specVersion:'1.7',version:1,metadata:{component:{'bom-ref':appRef,type:'application',name:pkg.name,version:pkg.version,purl:appRef},properties:[{name:'ghrab:scope',value:'github-pages deployment'},{name:'ghrab:npm-runtime-dependencies',value:'0'}]},components,dependencies:[{ref:appRef,dependsOn:components.map(x=>x['bom-ref']).sort()},...components.map(x=>({ref:x['bom-ref'],dependsOn:[]}))]};
fs.writeFileSync(out,JSON.stringify(bom,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',output:out,appId:'maturita-desk',version:pkg.version,components:components.length},null,2));
