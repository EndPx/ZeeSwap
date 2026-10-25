import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {mkdtemp,readFile,readdir,writeFile,rm,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
import {superviseChild,drainGroup,commandFor} from './runtime.mjs';
import {validateConfig,validateSourceCheckpoint,engineEnvironment,GENERATION,PROJECTION} from './config.mjs';
import {readCheckpoint,boundedJson} from './healthcheck.mjs';import {prepareContext,BUILD_FILES} from './prepare-context.mjs';
const spec={command:'fixture',args:[],cwd:'.',env:{}};
function fake(){return Object.assign(new EventEmitter(),{pid:12345});}
test('unexpected exit latches before cleanup and never resolves while owned descendants remain',async()=>{
 const events=[],child=fake(),signals=new EventEmitter();let release,finished=false;const cleanup=new Promise(r=>release=r);
 const p=superviseChild(spec,{signals,spawnChild:()=>child,onSpawn:async()=>child.emit('exit',1,null),onFatal:async()=>events.push('latch'),drain:async()=>{events.push('cleanup-start');await cleanup;events.push('group-absent');}}).then(v=>{finished=true;return v;});
 await new Promise(r=>setImmediate(r));assert.deepEqual(events,['latch','cleanup-start']);assert.equal(finished,false);release();assert.equal((await p).fatal,true);assert.deepEqual(events,['latch','cleanup-start','group-absent']);
});
test('failed durable latch still drains before reporting unknown failure; no child retry',async()=>{
 let count=0,drained=false;const child=fake();await assert.rejects(superviseChild(spec,{signals:new EventEmitter(),spawnChild:()=>{count++;return child;},onSpawn:async()=>child.emit('exit',1,null),onFatal:async()=>{throw Error('FSYNC_UNKNOWN');},drain:async()=>{drained=true;}}),/FSYNC_UNKNOWN/);assert.equal(count,1);assert.equal(drained,true);
});
test('TERM during creation is retained and forwarded only to the new owned group',async()=>{
 const child=fake(),signals=new EventEmitter(),sent=[];const result=await superviseChild(spec,{signals,spawnChild:()=>{signals.emit('SIGTERM');return child;},signalGroup:(p,s)=>sent.push([p,s]),onSpawn:async()=>child.emit('exit',0,'SIGTERM'),onFatal:async()=>assert.fail('manual stop is not fatal'),drain:async()=>sent.push('reaped')});assert.equal(result.stopped,true);assert.deepEqual(sent,[[12345,'SIGTERM'],'reaped']);
});
test('unknown process creation is latched once and is never retried or falsely acknowledged as cleaned',async()=>{
 let count=0;const codes=[];const result=await superviseChild(spec,{signals:new EventEmitter(),spawnChild:()=>{count++;throw Error('UNKNOWN_HANDLE');},onFatal:async c=>codes.push(c),drain:async()=>assert.fail()});assert.equal(count,1);assert.equal(result.cleanupUnknown,true);assert.deepEqual(codes,['CHILD_CREATION_UNKNOWN']);
});
test('group cleanup waits beyond TERM, escalates once, and acknowledges only actual absence',async()=>{
 const calls=[];let now=0,reads=0;await drainGroup(123,{exists:async()=>++reads<6,kill:(p,s)=>calls.push([p,s]),pause:async()=>{now+=100;},now:()=>now,termMs:100});assert.deepEqual(calls,[[123,'SIGTERM'],[123,'SIGKILL']]);assert.equal(reads,6);
});
test('only exact existing engine start and standalone readonly export commands are available',()=>{
 assert.deepEqual(commandFor('engine').args,['/opt/zeeswap-testnet/current/app/deploy/linux/envio/run-engine.sh']);assert.deepEqual(commandFor('export').args,['--import','tsx','scripts/envio-export-server.ts','/run/zeeswap-envio/export-profile.private.json']);assert.throws(()=>commandFor('reset'));assert.deepEqual(engineEnvironment('ENVIO_PG_PASSWORD="literal$notExecuted"\nENVIO_PG_DATABASE=zee_envio_20261023'),{ENVIO_PG_PASSWORD:'literal$notExecuted',ENVIO_PG_DATABASE:'zee_envio_20261023'});assert.throws(()=>engineEnvironment('NODE_EXTRA_CA_CERTS=/unapproved'));
});
test('protected runtime descriptors cannot change source namespace, enable finance, omit native pins or mount private code',async()=>{
 const source=dirname(fileURLToPath(import.meta.url)),cfg=JSON.parse((await readFile(source+'/engine-config.example.json','utf8')).replace(/ROOT_[A-Z0-9_]+/g,'a'.repeat(64)));validateConfig(cfg,'engine');
 for(const change of [c=>c.database='old_g5',c=>c.noFinance=false,c=>c.generation='new',c=>c.publicPins=c.publicPins.filter(p=>!p.path.endsWith('/envio.node')),c=>c.publicPins.push({path:'/opt/zeeswap-testnet/secrets/wallet.private.json',sha256:'a'.repeat(64)})]){const c=structuredClone(cfg);change(c);assert.throws(()=>validateConfig(c,'engine'));}
 assert.throws(()=>validateConfig(cfg,'export'));
});
test('health uses original real source clock and full producer identity; container liveness cannot renew it',()=>{
 const now=Date.now(),p={complete:true,generation:GENERATION,projectionDigest:PROJECTION,through:{height:100},sourceHead:{height:140},sourceSampledAt:new Date(now-60000).toISOString()};validateSourceCheckpoint(p,now);for(const change of[{sourceSampledAt:new Date(now-60001).toISOString()},{sourceHead:{height:141}},{generation:'new'},{complete:false}])assert.throws(()=>validateSourceCheckpoint({...p,...change},now));
});
test('health database probe is readonly and rejects a writable or wrong role before reading checkpoint',async()=>{
 const sql=[],row={db:'zee_envio_20261023',role:'zee_envio_export_20261023',rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,writable:false},checkpoint={complete:true,generation:GENERATION,projectionDigest:PROJECTION,registryDigest:'registry',through:{height:100},sourceHead:{height:101},sourceSampledAt:new Date().toISOString()};let released=0,tableWritable=false;
 const pool={connect:async()=>({query:async q=>{sql.push(q);return{rows:q.startsWith('SELECT current_')?[row]:q.startsWith('SELECT bool_or')?[{writable:tableWritable}]:q.startsWith('SELECT payload')?[{payload:checkpoint}]:[]};},release:()=>released++})};
 await readCheckpoint(pool,{}, {policy:{registryDigest:'registry'}});assert.ok(sql[0].includes('READ ONLY'));assert.ok(sql.includes('COMMIT'));assert.equal(released,1);row.writable=true;sql.length=0;await assert.rejects(readCheckpoint(pool,{}, {policy:{registryDigest:'registry'}}),/READONLY_HEALTH_ROLE/);assert.ok(!sql.some(q=>q.startsWith('SELECT payload')));assert.equal(released,2);row.writable=false;tableWritable=true;sql.length=0;await assert.rejects(readCheckpoint(pool,{}, {policy:{registryDigest:'registry'}}),/READONLY_HEALTH_TABLE_RIGHTS/);assert.ok(!sql.some(q=>q.startsWith('SELECT payload')));assert.equal(released,3);
});
test('HTTP health refuses oversized streamed data early and cancels without parsing or full allocation',async()=>{
 let chunks=0,cancelled=false;const stream=new ReadableStream({pull(c){chunks++;c.enqueue(new Uint8Array(40000));},cancel(){cancelled=true;}});await assert.rejects(boundedJson(new Response(stream)),/BODY_BOUND/);assert.equal(cancelled,true);assert.ok(chunks<=3);
});
test('real filesystem build-context allowlist excludes secret canaries and refuses overwrite/unpinned bases',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'zeeswap-envio-context-'));try{const source=dirname(fileURLToPath(import.meta.url)),out=dir+'/context';const m=await prepareContext(source,out,'node:24.14.0-bookworm-slim@sha256:'+'a'.repeat(64));assert.equal(m.files.length,6);assert.deepEqual((await readdir(out)).sort(),[...BUILD_FILES,'public-build-manifest.json'].sort());for(const p of m.files)assert.deepEqual(await readFile(out+'/'+p.name),await readFile(source+'/'+p.name));await assert.rejects(prepareContext(source,out,'node:24.14.0-bookworm-slim@sha256:'+'a'.repeat(64)));await assert.rejects(prepareContext(source,dir+'/bad','node:latest'),/PINNED_NODE/);
  const fake=dir+'/input';await mkdir(fake);for(const name of BUILD_FILES)await writeFile(fake+'/'+name,await readFile(source+'/'+name));await writeFile(fake+'/.env','SECRET_CANARY_DONT_COPY');await writeFile(fake+'/wallet.private.json','SECRET_CANARY_DONT_COPY');await prepareContext(fake,dir+'/safe','node:24.14.0-bookworm-slim@sha256:'+'a'.repeat(64));assert.ok(!(await readdir(dir+'/safe')).includes('.env'));assert.ok(!(await readdir(dir+'/safe')).includes('wallet.private.json'));
 }finally{assert.ok(dir.startsWith(resolve(tmpdir(),'zeeswap-envio-context-')));await rm(dir,{recursive:true,force:true});}
});
test('full Docker consumer unit preserves original Service/Install bytes and changes only two dependency lines',async()=>{
 const here=dirname(fileURLToPath(import.meta.url)),original=(await readFile(here+'/../linux/envio/zeeswap-envio-observer.service','utf8')).replace(/\r\n/g,'\n'),unit=(await readFile(here+'/zeeswap-envio-observer.service','utf8')).replace(/\r\n/g,'\n');
 const expected=original.replace('After=network-online.target zeeswap-envio-export.service','After=network-online.target docker.service').replace('Requires=zeeswap-envio-export.service','Requires=docker.service');assert.equal(unit,expected);assert.equal(unit.slice(unit.indexOf('[Service]')),original.slice(original.indexOf('[Service]')));assert.ok(!unit.includes('zeeswap-envio-export.service'));
 const condition=(await readFile(here+'/host-source-retired.conf','utf8')).trim().split('\n').map(v=>v.trim());assert.deepEqual(condition,['[Unit]','ConditionPathExists=/opt/zeeswap-testnet/state/envio-docker/ROOT_ALLOW_LEGACY_HOST_SOURCE']);
});
test('actual Linux child group is drained before graceful supervisor completion',{skip:process.platform!=='linux',timeout:10000},async()=>{
 const signals=new EventEmitter();const result=await superviseChild({command:process.execPath,args:['-e','process.on("SIGTERM",()=>process.exit(0));setInterval(()=>{},1000)'],cwd:tmpdir(),env:{PATH:process.env.PATH}},{signals,onSpawn:async()=>{await new Promise(r=>setTimeout(r,150));signals.emit('SIGTERM');},onFatal:async()=>assert.fail(),drain:pid=>drainGroup(pid,{termMs:100})});assert.equal(result.stopped,true);
});
test('actual Linux closed-stdio grandchild survives leader TERM, then is killed and reaped before completion',{skip:process.platform!=='linux',timeout:10000},async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'zeeswap-envio-group-')),ready=dir+'/ready',signals=new EventEmitter(),sent=[];
 const grand=`process.on('SIGTERM',()=>{});require('node:fs').writeFileSync(${JSON.stringify(ready)},String(process.pid));setInterval(()=>{},1000);`;
 const leader=`require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grand)}],{stdio:'ignore'});process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000);`;
 try{const result=await superviseChild({command:process.execPath,args:['-e',leader],cwd:dir,env:{PATH:process.env.PATH}},{signals,onSpawn:async()=>{for(let n=0;n<120;n++){try{await readFile(ready);signals.emit('SIGTERM');return;}catch(e){if(e.code!=='ENOENT')throw e;}await new Promise(r=>setTimeout(r,25));}throw Error('FIXTURE_START_TIMEOUT');},onFatal:async()=>assert.fail('fixture stop should stay controlled'),drain:pid=>drainGroup(pid,{termMs:100,kill:(p,s)=>{sent.push(s);process.kill(-p,s);}})});assert.equal(result.stopped,true);assert.ok(sent.includes('SIGKILL'));
 }finally{assert.ok(dir.startsWith(resolve(tmpdir(),'zeeswap-envio-group-')));await rm(dir,{recursive:true,force:true});}
});
