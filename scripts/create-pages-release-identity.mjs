#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root=process.cwd();
const dist=path.join(root,'dist-pages');
const evidenceDir=path.join(root,'qa-results','release-current');
const foundationSummary=path.join(root,'audit-evidence','garp27-current','foundation-summary.json');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const appId='maturita-desk';
const version=pkg.version;
const source=String(process.env.GHRAB_SOURCE_COMMIT||process.env.GITHUB_SHA||'').trim().toLowerCase();
const repository=String(process.env.GHRAB_SOURCE_REPOSITORY||process.env.GITHUB_REPOSITORY||'Daniel22-dev/maturita-desk').trim();
const workflowRef=String(process.env.GHRAB_WORKFLOW_REF||process.env.GITHUB_WORKFLOW_REF||'local');
const runId=String(process.env.GITHUB_RUN_ID||'local');
const runAttempt=String(process.env.GITHUB_RUN_ATTEMPT||'1');
const buildId=String(process.env.GHRAB_BUILD_ID||`github-${runId}-${runAttempt}`);
const releaseStage=String(process.env.GHRAB_RELEASE_STAGE||'PREP-VALIDATION');
const createdAt=new Date().toISOString();
if(!fs.existsSync(dist)) throw new Error('Release identity: missing dist-pages');
if(!/^[0-9a-f]{40}$/.test(source)) throw new Error('Release identity: full 40-char source commit required');
if(!fs.existsSync(foundationSummary)) throw new Error('Release identity: missing admitted GARP 2.7 foundation-summary.json');
const foundation=JSON.parse(fs.readFileSync(foundationSummary,'utf8'));
if(foundation.status!=='FOUNDATION_PASS_LIVE_NOT_TESTED') throw new Error(`Release identity: GARP 2.7 foundation status=${foundation.status}`);
if(foundation.appId!==appId || foundation.appVersion!==version) throw new Error('Release identity: GARP 2.7 foundation identity mismatch');
if(foundation.sourceIdentity?.kind==='git-commit' && String(foundation.sourceIdentity?.value||'').toLowerCase()!==source) throw new Error('Release identity: GARP 2.7 foundation source commit mismatch');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function run(script,args=[],extraEnv={}){
  const r=spawnSync(process.execPath,[path.join(root,script),...args],{cwd:root,encoding:'utf8',env:{...process.env,...extraEnv}});
  if(r.status!==0) throw new Error(`${script} failed (exit ${r.status})\n${r.stdout||''}\n${r.stderr||''}`);
  return (r.stdout||'')+(r.stderr||'');
}

fs.rmSync(evidenceDir,{recursive:true,force:true});
fs.mkdirSync(evidenceDir,{recursive:true});
const context={schema:'ghrab-release-evidence-context-v1',appId,version,sourceCommit:source,buildRun:{provider:process.env.GITHUB_ACTIONS==='true'?'github-actions':'local',repository,workflowRef,runId,runAttempt},tooling:{garp:'2.7',legacyGarp:'2.5.1',platform:'1.1.2',node:process.version},profile:'GARP-2.7-FOUNDATION',gate:'P5-R2',releaseStage,environment:releaseStage==='LIVE-PUBLIC-PAGES'?'github-pages':'pre-production',status:'GREEN',serverPhase:'DEFERRED_BY_OWNER_DECISION',liveSchoolRuntime:'NOT_TESTED',createdAt};
fs.writeFileSync(path.join(evidenceDir,'release-context.json'),JSON.stringify(context,null,2)+'\n');
fs.copyFileSync(foundationSummary,path.join(evidenceDir,'garp27-foundation-summary.json'));

run('scripts/stamp-live-release-identity.mjs',[path.join(dist,'studio-manifest.json')],{GHRAB_SOURCE_COMMIT:source,GHRAB_SOURCE_REPOSITORY:repository,GHRAB_BUILD_ID:buildId});
run('scripts/verify-studio-manifest-contract.mjs',[path.join(dist,'studio-manifest.json')]);
run('scripts/generate-pages-sbom.mjs',[dist,path.join(dist,'sbom.cdx.json')]);
fs.writeFileSync(path.join(evidenceDir,'garp27-contract-gate.txt'),run('scripts/garp27/contract-gate.mjs'),'utf8');
fs.writeFileSync(path.join(evidenceDir,'garp27-architecture-integrity.txt'),run('scripts/garp27/architecture-integrity.mjs'),'utf8');
fs.writeFileSync(path.join(evidenceDir,'garp251-legacy-tooling.txt'),run('security/garp25/tools/selftest-garp251.mjs'),'utf8');
fs.writeFileSync(path.join(evidenceDir,'source-secret-scan.txt'),run('security/garp25/tools/scan-source-secrets.mjs',['.']),'utf8');
fs.writeFileSync(path.join(evidenceDir,'deployment-leak-scan.txt'),run('security/garp25/tools/scan-deployment-leaks.mjs',[dist]),'utf8');
fs.writeFileSync(path.join(evidenceDir,'manifest-contract.txt'),run('scripts/verify-studio-manifest-contract.mjs',[path.join(dist,'studio-manifest.json')]),'utf8');

run('security/garp25/tools/create-build-provenance.mjs',[path.join(dist,'studio-manifest.json'),path.join(dist,'build-provenance.json')],{
  GHRAB_SOURCE_REPOSITORY:repository,GHRAB_SOURCE_COMMIT:source,
  GHRAB_BUILDER_ID:process.env.GITHUB_ACTIONS==='true'?'github-actions':'local-untrusted-builder',
  GHRAB_WORKFLOW_REF:workflowRef,GHRAB_BUILD_ENTRYPOINT:'npm run prepare:pages',
  GHRAB_BUILD_STARTED_AT:process.env.GITHUB_RUN_STARTED_AT||createdAt,
  GHRAB_BUILD_FINISHED_AT:new Date().toISOString(),GHRAB_LOCKFILE:path.join(root,'package-lock.json'),
  GHRAB_BUILD_PROFILE:'GARP-2.7-FOUNDATION/GARP-2.5.1-LEGACY/P5-R2'
});
run('security/garp25/tools/create-evidence-manifest.mjs',[evidenceDir,path.join(dist,'security-evidence-manifest.json')],{
  GHRAB_APP_ID:appId,GHRAB_APP_VERSION:version,GHRAB_SOURCE_COMMIT:source
});

const manifestSha256=sha(path.join(dist,'studio-manifest.json'));
const sbomSha256=sha(path.join(dist,'sbom.cdx.json'));
const provenanceSha256=sha(path.join(dist,'build-provenance.json'));
const evidenceSha256=sha(path.join(dist,'security-evidence-manifest.json'));
const integrityPath=path.join(dist,'release-integrity.json');
run('security/garp25/tools/create-release-integrity.mjs',[dist,appId,version,'TRANSITIONAL-UNSIGNED',integrityPath],{
  GHRAB_BUILD_ID:buildId,GHRAB_SOURCE_COMMIT:source,
  GHRAB_BUILD_PROVENANCE_SHA256:provenanceSha256,GHRAB_SBOM_SHA256:sbomSha256,
  GHRAB_EVIDENCE_MANIFEST_SHA256:evidenceSha256
});
const integrity=JSON.parse(fs.readFileSync(integrityPath,'utf8'));
Object.assign(integrity,{assuranceMode:'TRANSITIONAL',releaseStage,status:'GREEN',environment:releaseStage==='LIVE-PUBLIC-PAGES'?'github-pages':'pre-production',garpProfile:'GARP-2.7-FOUNDATION',legacyGarpProfile:'GARP-2.5.1-REGRESSION',serverPhase:'DEFERRED_BY_OWNER_DECISION',liveSchoolRuntime:'NOT_TESTED',gate:'P5-R2',manifestSha256,sbomSha256,buildProvenanceSha256:provenanceSha256,evidenceManifestSha256:evidenceSha256,buildRun:context.buildRun,tooling:context.tooling,signature:{algorithm:'Ed25519',keyId:'TRANSITIONAL-UNSIGNED',status:'NOT_PRESENT',note:'TRANSITIONAL: exact release identity is machine-verified; no production signing key is asserted for this GitHub Pages release.'}});
fs.writeFileSync(integrityPath,JSON.stringify(integrity,null,2)+'\n');
run('security/garp25/tools/verify-release-integrity.mjs',[dist,integrityPath]);
run('security/garp25/tools/scan-deployment-leaks.mjs',[dist]);

for(const field of ['artifactDigest','manifestSha256','sbomSha256','buildProvenanceSha256','evidenceManifestSha256']) if(!/^[0-9a-f]{64}$/i.test(String(integrity[field]||''))) throw new Error(`Release identity invalid ${field}`);
console.log(JSON.stringify({status:'PASS',appId,version,sourceCommit:source,artifactDigest:integrity.artifactDigest,releaseStage,garpProfile:integrity.garpProfile,serverPhase:integrity.serverPhase,liveSchoolRuntime:integrity.liveSchoolRuntime,assuranceMode:integrity.assuranceMode,signatureStatus:integrity.signature.status,manifestSha256,sbomSha256,buildProvenanceSha256:provenanceSha256,evidenceManifestSha256:evidenceSha256},null,2));
