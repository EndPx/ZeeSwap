import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {privateJsonRoute,decodePrivateJsonGuest,parsePrivateJson,readPrivateJson,PRIVATE_JSON_GUEST_PROGRAM} from '../src/private-json-read.ts';
const prefix=join(tmpdir(),'zeeswap-private-json-'),root=await mkdtemp(prefix);
after(async()=>{if(!resolve(root).startsWith(resolve(prefix)))throw Error('Unexpected test cleanup path');await rm(root,{recursive:true});});
test('Windows WSL UNC routing preserves explicit Ubuntu distribution and treats path as one argv value',()=>{
 assert.deepEqual(privateJsonRoute('\\\\wsl.localhost\\Ubuntu\\home\\owner\\config with spaces.json','win32'),{kind:'wsl',distro:'Ubuntu',path:'/home/owner/config with spaces.json'});
 assert.deepEqual(privateJsonRoute('//wsl$/Ubuntu-24.04/home/owner/$literal;file.json','win32'),{kind:'wsl',distro:'Ubuntu-24.04',path:'/home/owner/$literal;file.json'});
 for(const path of ['//wsl.localhost/Ubuntu-22.04/home/config.json','//wsl$/unknown/a.json','//wsl.localhost/Ubuntu/home/../config.json'])assert.throws(()=>privateJsonRoute(path,'win32'));
 assert.deepEqual(privateJsonRoute('/home/owner/config.json','linux'),{kind:'native',path:'/home/owner/config.json'});
 assert.deepEqual(privateJsonRoute('C:/private/config.json','win32'),{kind:'native',path:'C:/private/config.json'});
});
test('strict guest errno envelopes preserve missing versus permission/timeout; untrusted process output is never ENOENT',()=>{
 for(const code of ['ENOENT','EACCES','EPERM','ETIMEDOUT','EISDIR'])assert.throws(()=>decodePrivateJsonGuest(JSON.stringify({version:1,status:'ERROR',code}),1,null),e=>(e as any).code===code&&(e as Error).message==='PRIVATE_JSON_READ_FAILED');
 for(const [text,exit,signal] of [['private provider bytes',1,null],[JSON.stringify({version:1,status:'ERROR',code:'ENOENT'}),0,null],[JSON.stringify({version:1,status:'ERROR',code:'ENOENT',path:'private'}),1,null],[JSON.stringify({version:1,status:'ERROR',code:'UNKNOWN_SECRET'}),1,null],[JSON.stringify({version:1,status:'ERROR',code:'ENOENT'}),null,'SIGTERM']] as const)
  assert.throws(()=>decodePrivateJsonGuest(text,exit,signal),e=>(e as any).code==='EWSLPROTO');
});
test('bounded binary decoding and JSON errors never expose private contents',()=>{
 const bytes=Buffer.from('{"synthetic":"private bytes"}'),packet=JSON.stringify({version:1,status:'OK',data:bytes.toString('base64')});
 assert.deepEqual(parsePrivateJson(decodePrivateJsonGuest(packet,0,null)),{synthetic:'private bytes'});
 assert.throws(()=>parsePrivateJson(Buffer.from('PRIVATE_SECRET_NOT_JSON')),e=>(e as Error).message==='PRIVATE_JSON_PARSE_FAILED'&&!JSON.stringify(e).includes('PRIVATE_SECRET'));
 assert.throws(()=>parsePrivateJson(Buffer.from([0xff])),e=>(e as any).code==='EJSONPARSE');
 assert.throws(()=>parsePrivateJson(Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),bytes])),e=>(e as any).code==='EJSONPARSE');
 assert.throws(()=>parsePrivateJson(Buffer.alloc(4_000_001)),e=>(e as any).code==='EFBIG');
 assert.throws(()=>decodePrivateJsonGuest(JSON.stringify({version:1,status:'OK',data:'!!!!'}),0,null),e=>(e as any).code==='EWSLPROTO');
});
test('native local files retain filesystem reads and exact ENOENT behavior',async()=>{
 const path=join(root,'native.json');await writeFile(path,'{"value":"synthetic"}');
 assert.deepEqual(await readPrivateJson(path),{value:'synthetic'});assert.equal(await readFile(path,'utf8'),'{"value":"synthetic"}');
 await assert.rejects(()=>readPrivateJson(join(root,'missing.json')),e=>(e as any).code==='ENOENT');
});
test('actual fixed WSL guest reader handles literal path bytes and reports missing files without secret output',async()=>{
 if(process.platform!=='win32')return;
 const path=join(root,'literal $ name; json.json');await writeFile(path,'{"transport":"guest-read-only"}');
 const posix='/mnt/'+path[0].toLowerCase()+path.slice(2).replaceAll('\\','/');
 const unc='//wsl.localhost/Ubuntu-24.04'+posix;
 assert.deepEqual(await readPrivateJson(unc),{transport:'guest-read-only'});
 await assert.rejects(()=>readPrivateJson(unc+'.missing'),e=>(e as any).code==='ENOENT');
 const processResult=spawnSync('wsl.exe',['--distribution','Ubuntu-24.04','--exec','python3','-c',PRIVATE_JSON_GUEST_PROGRAM,posix],{encoding:'utf8',windowsHide:true,timeout:20000});
 assert.equal(processResult.status,0);assert.deepEqual(parsePrivateJson(decodePrivateJsonGuest(processResult.stdout,0,null)),{transport:'guest-read-only'});
});
