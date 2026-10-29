import {posix} from 'node:path';
export const LEGACY_APP='/opt/zeeswap-testnet/releases/linux-live-20261024/app';
export const LEGACY_GUARDS=[LEGACY_APP+'/api/scripts/reverse-linux-broadcast-guard.ts',LEGACY_APP+'/api/scripts/refund-linux-broadcast-guard.ts'];
export const ORIGIN_PROFILE_SHA='76711023c2313cf7e1e30382ea1591f5ff7721b56f68b3094ad7dd0f92ff8251';
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)&&v!=='0'.repeat(64);
const need=(v,c)=>{if(!v)throw Error('LEGACY_MAIN_PG_MANIFEST_'+c);};
export function requireLegacyFileEntryArguments(execArgv){
  need(!execArgv.some(a=>/^(?:-e|-p|--eval(?:=|$)|--print(?:=|$)|--input-type(?:=|$))/.test(a)),'FILE_ENTRY_REQUIRED');
}
export function validateLegacyPreloadManifest(m,self){
  const suffix='/api/src/legacy-pg-transport-preload.mjs',app=self.slice(0,-suffix.length);
  need(self.endsWith(suffix)&&/^\/opt\/zeeswap-testnet\/releases\/[a-z0-9][a-z0-9._-]{0,79}\/app$/.test(app),'SELF');
  need(m?.version===1&&m.status==='ROOT_PINNED_LEGACY_MAIN_PG_PRELOAD'&&/^[a-f0-9]{40}$/.test(m.publicCommit),'SCOPE');
  need(m.operatorProfile?.path==='/opt/zeeswap-testnet/secrets/linux-operator-profile.private.json'&&m.operatorProfile.sha256===ORIGIN_PROFILE_SHA,'ORIGIN_PROFILE');
  need(m.originRuntime?.path?.startsWith('/opt/zeeswap-testnet/secrets/')&&!m.originRuntime.path.includes('..')&&hash(m.originRuntime.sha256),'ORIGIN_RUNTIME');
  need(Array.isArray(m.files)&&m.files.length>=10&&m.files.length<=300,'FILES');
  const files=new Map();for(const p of m.files){need(p?.path?.startsWith('/opt/zeeswap-testnet/releases/')&&posix.normalize(p.path)===p.path&&!p.path.split('/').includes('..')&&hash(p.sha256)&&!files.has(p.path),'FILE_PIN');files.set(p.path,p);}
  need(Array.isArray(m.entries)&&m.entries.length===3&&new Set(m.entries.map(e=>e.path)).size===3,'ENTRIES');
  for(const e of m.entries){need(files.get(e.path)?.sha256===e.sha256,'ENTRY_PIN');
    if(e.kind==='passthrough')need(e.path===app+'/api/scripts/work-linux-testnet-policy.ts'&&e.roles===undefined,'PASSTHROUGH');
    else need(e.kind==='legacy'&&LEGACY_GUARDS.includes(e.path)&&Array.isArray(e.roles)&&e.roles.length===1&&e.roles[0]==='zee_app_worker_20261023','LEGACY_ROLE');
  }
  need(m.entries.filter(e=>e.kind==='passthrough').length===1&&LEGACY_GUARDS.every(path=>m.entries.some(e=>e.kind==='legacy'&&e.path===path)),'ENTRY_SET');
  for(const name of['packageJson','cjs','client','pool'])need(typeof m.legacyPg?.[name]==='string'&&m.legacyPg[name].startsWith(LEGACY_APP+'/')&&files.has(m.legacyPg[name]),'PG_PIN');
  for(const path of[self,app+'/api/src/legacy-pg-transport-adapter.mjs',app+'/api/src/legacy-pg-transport-manifest.mjs',app+'/api/src/main-database-relocation.ts'])need(files.has(path),'HOOK_CODE_PIN');
  return {app,files,entries:m.entries};
}
