import {readFile,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';import {resolve,dirname} from 'node:path';
import {parseHeader,stable,requireThat,type Header} from './integrations/observation/types.ts';
type Pin={path:string;sha256:string};
export type ChefPersistedRangeProof={kind:'independent-persisted-range-v1';sourceId:string;latestHeight:number;fromHeight:number;throughHeight:number;headers:Header[]};
export type ChefPersistedRangeReader=(from:number,through:number,signal:AbortSignal)=>Promise<ChefPersistedRangeProof>;
/** A validated dense segment changed at its independent fence. This is not a
 * successful prefix proof; callers must discard every header from that read. */
export class ChefPersistedRangeChanged extends Error{
 constructor(readonly expected:Header,readonly actual:Header){super('CHEF_PERSISTED_RANGE_CHANGED');this.name='ChefPersistedRangeChanged';}
}
function requireUnchangedFence(expected:Header,actual:Header){if(stable(actual)!==stable(expected))throw new ChefPersistedRangeChanged(expected,actual);}
/** Only the persisted prefix is a header claim. latestHeight is never a Header. */
export async function verifyChefPersistedRanges(heights:number[],read:ChefPersistedRangeReader,sourceId:string,signal:AbortSignal){
 requireThat(heights.length>0&&heights.length<=10004&&heights.every(h=>Number.isSafeInteger(h)&&h>=0),'CHEF_PERSISTED_STATE_BOUND');
 const min=Math.min(...heights),max=Math.max(...heights),wanted=new Set(heights),complete=new Map<number,Header>(),ends:Header[]=[];let previous:Header|undefined;
 const range=async(from:number,through:number)=>{signal.throwIfAborted();const proof=await read(from,through,signal);signal.throwIfAborted();requireThat(proof.kind==='independent-persisted-range-v1'&&proof.sourceId===sourceId&&proof.fromHeight===from&&proof.throughHeight===through&&Number.isSafeInteger(proof.latestHeight)&&proof.latestHeight>=through&&proof.latestHeight<=0xffffffff&&proof.headers.length===through-from+1,'CHEF_PERSISTED_RANGE_PROOF');return proof.headers.map((v,i)=>{const h=parseHeader(v,'zcash-testnet');requireThat(h.height===from+i,'CHEF_PERSISTED_RANGE_HEIGHT');return h;});};
 for(let from=min;from<=max;from+=1000){const through=Math.min(max,from+999),headers=await range(from,through);
  for(const h of headers){requireThat(!previous||h.parentHash===previous.hash,'CHEF_PERSISTED_RANGE_FORK');previous=h;if(wanted.has(h.height))complete.set(h.height,h);}
  const end=headers.at(-1)!;requireUnchangedFence(end,(await range(through,through))[0]!);ends.push(end);
 }
 for(const end of ends)requireUnchangedFence(end,(await range(end.height,end.height))[0]!);
 signal.throwIfAborted();requireThat(heights.every(h=>complete.has(h)),'CHEF_PERSISTED_CANONICAL_CACHE_REQUIRED');return complete;
}
export function localChefPersistedRange(command:string,args:string[]):ChefPersistedRangeReader{return(from,through,signal)=>new Promise((done,reject)=>{
 requireThat(Number.isSafeInteger(from)&&Number.isSafeInteger(through)&&from>=0&&through>=from&&through-from<1000,'CHEF_PERSISTED_RANGE_BOUND');
 const child=spawn(command,args,{stdio:['pipe','pipe','pipe'],windowsHide:true,signal});let out='',stderr='',failed=false;
 const fail=()=>{if(!failed){failed=true;child.kill();}};child.on('error',fail);child.stdin.on('error',fail);child.stderr.on('data',b=>{if(stderr.length<=2048)stderr+=b;});
 child.stdout.on('data',b=>{out+=b;if(out.length>300000){child.kill();fail();}});
 child.on('close',code=>{const failure=()=>{const error=Error('CHEF_PERSISTED_RANGE_FAILED') as Error&{persistedRange:unknown};let reason:string|null=null,grpcStatus:number|null=null;try{const d=JSON.parse(stderr);if(d.event==='CHEF_PERSISTED_RANGE_FAILED'){if(['PERSISTED_RANGE_BOUND','PERSISTED_NETWORK_OR_BRANCH','PERSISTED_SOURCE_BEHIND','PERSISTED_RANGE_HEADER','PERSISTED_RANGE_PARENT','PERSISTED_RANGE_INCOMPLETE','PERSISTED_REQUEST','PERSISTED_ENDPOINT'].includes(d.reason))reason=d.reason;if(Number.isInteger(d.grpcStatus)&&d.grpcStatus>=0&&d.grpcStatus<=16)grpcStatus=d.grpcStatus;}}catch{}error.persistedRange={fromHeight:from,throughHeight:through,exitCode:Number.isInteger(code)?code:null,aborted:signal.aborted,reason,grpcStatus};return error;};if(failed||code!==0){reject(failure());return;}try{done(JSON.parse(out));}catch{reject(failure());}});
 child.stdin.end(JSON.stringify({command:'persisted-range',fromHeight:from,throughHeight:through}));
});}
/** Explicit Root overlay; immutable original profile and decoder are retained. */
export async function loadChefPersistedRangeReader(expected:{profileSha256:string;headerScript:string;pythonPath:string;decoder:Pin}){
 const path=process.env.ZEESWAP_CHEF_PERSISTED_READER_PROOF,sha=process.env.ZEESWAP_CHEF_PERSISTED_READER_SHA256;if(!path&&!sha)return undefined;
 requireThat(path==='/opt/zeeswap-testnet/secrets/chef-persisted-range-reader.private.json'&&sha&&/^[a-f0-9]{64}$/.test(sha),'CHEF_PERSISTED_READER_SELECTOR');
 const pin=async(p:Pin)=>{requireThat(p.path.startsWith('/opt/zeeswap-testnet/')&&!p.path.split('/').includes('..')&&/^[a-f0-9]{64}$/.test(p.sha256),'CHEF_PERSISTED_READER_PIN');for(let parent=dirname(p.path);parent.startsWith('/opt/zeeswap-testnet');parent=dirname(parent)){const d=await lstat(parent);requireThat(d.isDirectory()&&!d.isSymbolicLink()&&d.uid===0&&(d.mode&0o022)===0,'CHEF_PERSISTED_READER_DIRECTORY');}const s=await lstat(p.path);requireThat(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&(p.path===path?0o027:0o022))===0&&s.size<=16000000&&await realpath(p.path)===p.path,'CHEF_PERSISTED_READER_FILE');const raw=await readFile(p.path);requireThat(createHash('sha256').update(raw).digest('hex')===p.sha256,'CHEF_PERSISTED_READER_CHANGED');return raw;};
 const proof=JSON.parse((await pin({path,sha256:sha})).toString()),app=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),readerPath=app+'/workers/zcash-wallet/chef_persisted_headers.py';
 requireThat(/^\/opt\/zeeswap-testnet\/releases\/[a-z0-9][a-z0-9._-]{1,79}\/app$/.test(app)&&proof.version===1&&proof.status==='ROOT_CHEF_PERSISTED_RANGE_READER'&&/^[a-f0-9]{40}$/.test(proof.publicCommit)&&proof.profileSha256===expected.profileSha256&&proof.pythonPath===expected.pythonPath&&proof.originalHeader.path===expected.headerScript&&stable(proof.decoder)===stable(expected.decoder)&&proof.reader.path===readerPath,'CHEF_PERSISTED_READER_SCOPE');
 await pin(proof.originalHeader);await pin(proof.decoder);await pin(proof.reader);
 const read=localChefPersistedRange(expected.pythonPath,[readerPath,'--config',expected.decoder.path]);return async(from:number,through:number,signal:AbortSignal)=>{await pin({path,sha256:sha});await pin(proof.originalHeader);await pin(proof.decoder);await pin(proof.reader);signal.throwIfAborted();return read(from,through,signal);};
}
