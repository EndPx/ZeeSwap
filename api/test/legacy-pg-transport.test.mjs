import test from 'node:test';import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';import {createRequire} from 'node:module';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {createLegacyPgAdapters,legacyConnectionMapper,rejectLegacyOriginXidQuery} from '../src/legacy-pg-transport-adapter.mjs';
import {validateLegacyPreloadManifest,LEGACY_APP,LEGACY_GUARDS,ORIGIN_PROFILE_SHA,requireLegacyFileEntryArguments} from '../src/legacy-pg-transport-manifest.mjs';
const require=createRequire(import.meta.url),realPg=require('pg');
const role='zee_app_worker_20261023',host='ep-red-thunder-aosp0w70.c-2.ap-southeast-1.aws.neon.tech',db='zee_app_20261023';
function context(){return{originRuntime:{workerUrl:`postgresql://${role}:origin-fixture@${host}/${db}?sslmode=require`},credentials:{workerUrl:`postgresql://${role}:destination-fixture@127.0.0.1:55435/${db}?sslmode=verify-full`},caPem:'fixture-CA',receipt:{origin:{host,database:db},destination:{database:db},tls:{serverName:'127.0.0.1'}}};}
const original=()=>({host,port:5432,database:db,user:role,password:'origin-fixture',ssl:{rejectUnauthorized:true,servername:host}});
function fixture({badIdentity=false,verifyError=false}={}){
 const calls=[];
 class FakeClient extends EventEmitter {
  constructor(c){super();this.config=c;this.user=c.user;this.host=c.host;this._Promise=Promise;this._queryable=true;this._ending=false;this.connection={stream:{encrypted:true,authorized:true}};}
  connect(cb){calls.push('physical-connect');if(cb){queueMicrotask(()=>cb());return;}return Promise.resolve(this);}
  query(text,values,cb){if(typeof values==='function')cb=values;cb??=text?.callback;const sql=typeof text==='string'?text:text.text;calls.push(sql);const result={rows:[{identity:!badIdentity,value:7}]};if(cb){queueMicrotask(()=>cb(null,result));return;}return Promise.resolve(result);}
  end(cb){this._ending=true;queueMicrotask(()=>{this.emit('end');cb?.();});return cb?undefined:Promise.resolve();}
  ref(){} unref(){}
 }
 const hooks={...legacyConnectionMapper(context(),[role]),recheck:async()=>{calls.push('recheck');},verify:async(client,actual,raw)=>{assert.equal(actual,role);const row=(await raw('SELECT identity')).rows[0];if(!row.identity||verifyError)throw Error('FIXTURE_IDENTITY_REFUSED');calls.push('verified');}};
 return{...createLegacyPgAdapters({Client:FakeClient,Pool:realPg.Pool},hooks),calls};
}

test('pg8.23.1 Pool captured-Client closure is overridden and verify callback runs after identity',async()=>{
 assert.equal(require('pg/package.json').version,'8.23.1');const f=fixture();let rogue=false,userVerified=false;
 const pool=new f.Pool({...original(),Client:class{constructor(){rogue=true;}},verify(client,done){assert(f.calls.includes('verified'));userVerified=true;done();}});
 const client=await pool.connect();assert(client instanceof f.Client);assert.equal(pool.Client,f.Client);assert.equal(pool.options.Client,f.Client);assert.equal(rogue,false);assert.equal(userVerified,true);
 assert.throws(()=>{pool.Client=class{};},TypeError);assert.equal((await client.query('SELECT business')).rows[0].value,7);assert(f.calls.indexOf('SELECT identity')<f.calls.indexOf('SELECT business'));client.release();await pool.end();
 assert.throws(()=>Object.defineProperty(pool,'Client',{value:class{}}),TypeError);
});
test('Client Promise/callback and Pool callback APIs cannot expose business SQL before identity',async()=>{
 const f=fixture(),client=new f.Client(original());const pending=client.query({text:'SELECT queued'});await client.connect();await pending;assert(f.calls.indexOf('verified')<f.calls.indexOf('SELECT queued'));
 await new Promise((resolve,reject)=>client.query('SELECT callback',[],(e,r)=>e?reject(e):(assert.equal(r.rows[0].value,7),resolve())));await client.end();
 const p=new f.Pool(original());await new Promise((resolve,reject)=>p.connect((e,c,release)=>{if(e)return reject(e);c.query('SELECT acquired-callback',(error,r)=>{release(error);if(error)reject(error);else{assert.equal(r.rows[0].value,7);resolve();}});}));
 await new Promise((resolve,reject)=>p.query({text:'SELECT pool-callback'},(e,r)=>e?reject(e):(assert.equal(r.rows[0].value,7),resolve())));await p.end();
});
test('wrong actual identity refuses direct and pooled acquisition before business query',async()=>{
 const f=fixture({badIdentity:true}),c=new f.Client(original());await assert.rejects(c.connect(),/IDENTITY_REFUSED/);await assert.rejects(c.query('SELECT forbidden-after-fence-failure'),/IDENTITY_REFUSED/);
 const p=new f.Pool(original());await assert.rejects(p.query('SELECT forbidden-pool'),/IDENTITY_REFUSED/);assert(!f.calls.some(v=>v.includes('forbidden')));await p.end();
});
test('existing Pool verify rejection and Client connect callback errors remain errors once',async()=>{
 const f=fixture(),pool=new f.Pool({...original(),verify(client,done){done(Error('CALLER_VERIFY_REFUSED'));}});let callbacks=0;
 await new Promise(resolve=>pool.connect(error=>{callbacks++;assert.match(error.message,/CALLER_VERIFY_REFUSED/);resolve();}));assert.equal(callbacks,1);assert(!f.calls.includes('SELECT business'));await pool.end();
 const bad=fixture({verifyError:true}),client=new bad.Client(original());let count=0;
 await new Promise(resolve=>client.connect(error=>{count++;assert.match(error.message,/IDENTITY_REFUSED/);resolve();}));assert.equal(count,1);
});
test('origin XID functions and role switches fail closed for Promise and callback queries',async()=>{
 const f=fixture(),c=new f.Client(original());await c.connect();
 for(const sql of['SELECT pg_xact_status($1::xid8)','SELECT pg_catalog."pg_xact_status"(1::xid8)','SELECT pg_xact_commit_timestamp(1::xid)','SET /* comment */ ROLE admin',"SELECT set_config('role','admin',false)"]){await assert.rejects(c.query(sql,['1']),/ORIGIN_XID_QUERY_REFUSED|ROLE_SWITCH_REFUSED/);}
 await new Promise(resolve=>c.query('SELECT pg_xact_status(1::xid8)',error=>{assert.match(error.message,/ORIGIN_XID_QUERY_REFUSED/);resolve();}));
 assert(!f.calls.some(v=>/pg_xact|SET .*ROLE/.test(v)));assert.throws(()=>rejectLegacyOriginXidQuery([{submit(){}}]),/STANDARD_SQL/);await c.end();
});
test('exact frozen origin credentials map truthfully to destination TLS; arbitrary host/role/Client streams refuse',()=>{
 const m=legacyConnectionMapper(context(),[role]),mapped=m.mapConfig(original());assert.equal(mapped.host,'127.0.0.1');assert.equal(mapped.port,55435);assert.equal(mapped.user,role);assert.equal(mapped.ssl.ca,'fixture-CA');assert.equal(mapped.ssl.rejectUnauthorized,true);assert.equal(mapped.password,'destination-fixture');assert.equal(m.mapConfig(context().originRuntime.workerUrl).host,'127.0.0.1');
 for(const change of[{host:'arbitrary.neon.tech'},{user:'zee_app_admin_20261023'},{password:'wrong'},{ssl:false},{stream:()=>{}},{connection:{}},{options:'-c role=admin'},{connectionString:context().originRuntime.workerUrl,host:'wrong'}])assert.throws(()=>m.mapConfig({...original(),...change}),/LEGACY_MAIN_PG_/);
 assert.throws(()=>m.validateMapped({...mapped,ssl:{...mapped.ssl,rejectUnauthorized:false}}),/MAPPED_CONNECTION_CHANGED/);
});

function manifest(){const app='/opt/zeeswap-testnet/releases/legacy-shim-fixture/app',self=app+'/api/src/legacy-pg-transport-preload.mjs',h='a'.repeat(64),pg=LEGACY_APP+'/node_modules/.pnpm/pg@8.23.1/node_modules/pg',legacyPg={packageJson:pg+'/package.json',cjs:pg+'/lib/index.js',client:pg+'/lib/client.js',pool:LEGACY_APP+'/node_modules/.pnpm/pg@8.23.1/node_modules/pg-pool/index.js'};
 const entries=[{kind:'passthrough',path:app+'/api/scripts/work-linux-testnet-policy.ts',sha256:h},...LEGACY_GUARDS.map(path=>({kind:'legacy',path,sha256:h,roles:[role]}))];
 const paths=[self,app+'/api/src/legacy-pg-transport-adapter.mjs',app+'/api/src/legacy-pg-transport-manifest.mjs',app+'/api/src/main-database-relocation.ts',...entries.map(e=>e.path),...Object.values(legacyPg)];
 return{self,m:{version:1,status:'ROOT_PINNED_LEGACY_MAIN_PG_PRELOAD',publicCommit:'b'.repeat(40),operatorProfile:{path:'/opt/zeeswap-testnet/secrets/linux-operator-profile.private.json',sha256:ORIGIN_PROFILE_SHA},originRuntime:{path:'/opt/zeeswap-testnet/secrets/runtime-fixture.private.json',sha256:h},files:paths.map(path=>({path,sha256:h})),entries,legacyPg}};}
test('manifest permits only exact pinned worker passthrough and two original worker-role guards',()=>{
 const {m,self}=manifest();assert.equal(validateLegacyPreloadManifest(m,self).entries.length,3);
 for(const mutate of[x=>x.entries[1].roles=['zee_app_admin_20261023'],x=>x.entries[1].path=LEGACY_APP+'/api/scripts/arbitrary.ts',x=>x.entries[0].path='/tmp/work-linux-testnet-policy.ts',x=>x.files.pop(),x=>x.files.push(x.files[0]),x=>x.operatorProfile.sha256='c'.repeat(64)]){const bad=structuredClone(m);mutate(bad);assert.throws(()=>validateLegacyPreloadManifest(bad,self),/MANIFEST_/);}
 requireLegacyFileEntryArguments(['--import','file:///pinned/tsx/loader.mjs']);
 for(const flag of['--eval','--eval=0','-e0','--print','--input-type=module'])assert.throws(()=>requireLegacyFileEntryArguments([flag]),/FILE_ENTRY_REQUIRED/);
});

test('Node24 NODE_OPTIONS plus actual tsx loader preserves patched CJS/ESM exports and denies loader-thread database constructors',async()=>{
 assert.equal(process.versions.node.split('.')[0],'24');
 const apiRoot=fileURLToPath(new URL('../',import.meta.url));
 const directory=fileURLToPath(new URL('../../.deploy-local/',import.meta.url));await mkdir(directory,{recursive:true});const temp=await mkdtemp(resolve(directory,'legacy-pg-wire-'));
 await writeFile(resolve(temp,'package.json'),'{'+'"type":"module"'+'}');
 const adapter=pathToFileURL(resolve(apiRoot,'src/legacy-pg-transport-adapter.mjs')).href;
 const kernel=pathToFileURL(resolve(apiRoot,'src/main-database-relocation.ts')).href;
 const apiPackage=resolve(apiRoot,'package.json'),pgEsm=pathToFileURL(resolve(dirname(require.resolve('pg')),'../esm/index.mjs')).href;
 const preload=resolve(temp,'preload.mjs'),entry=resolve(temp,'entry.ts'),worker=resolve(temp,'worker.mjs');
 await writeFile(preload,`import {createRequire} from 'node:module';import {isMainThread} from 'node:worker_threads';import * as kernel from ${JSON.stringify(kernel)};import {createLegacyPgAdapters,installLegacyPgAdapters} from ${JSON.stringify(adapter)};
 const require=createRequire(${JSON.stringify(apiPackage)}),pg=require('pg');
 if(!isMainThread){class Denied{constructor(){throw Error('LOADER_THREAD_DATABASE_REFUSED');}}installLegacyPgAdapters(pg,{Client:Denied,Pool:Denied});}
 else{const classes=createLegacyPgAdapters(pg,{mapConfig:c=>({...c}),validateMapped(){},recheck:async()=>{},verify:async()=>{}});installLegacyPgAdapters(pg,classes);globalThis.wireClasses=classes;}`);
 await writeFile(worker,`import pg,{Client} from ${JSON.stringify(pgEsm)};import {parentPort} from 'node:worker_threads';try{new Client({});parentPort.postMessage('UNSAFE');}catch(e){parentPort.postMessage(e.message);}`);
 await writeFile(entry,`import assert from 'node:assert/strict';import pg,{Client,Pool} from ${JSON.stringify(pgEsm)};import {Worker} from 'node:worker_threads';
 const typed:boolean=true;assert(typed);assert.equal(Client,globalThis.wireClasses.Client);assert.equal(Pool,globalThis.wireClasses.Pool);assert.equal(pg.Client,Client);const pool=new Pool({host:'fixture'});assert.equal(pool.Client,Client);assert.equal(pool.options.Client,Client);await pool.end();
 const message=await new Promise((resolve,reject)=>{const w=new Worker(${JSON.stringify(worker)});w.once('message',resolve);w.once('error',reject);});assert.equal(message,'LOADER_THREAD_DATABASE_REFUSED');console.log('NODE24_TSX_PRELOAD_WIRE_PASSED');`);
 const result=await promisify(execFile)(process.execPath,['--import',pathToFileURL(require.resolve('tsx')).href,entry],{env:{...process.env,NODE_OPTIONS:'--import='+pathToFileURL(preload).href},timeout:20000,maxBuffer:65536});
 assert.equal(result.stdout.trim(),'NODE24_TSX_PRELOAD_WIRE_PASSED');
});
