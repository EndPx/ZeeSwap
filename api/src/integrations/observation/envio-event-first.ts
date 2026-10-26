/** V2 source proof: SDK-committed events/progress, bounded RPC headers and exact raw log equality.
 * No BlockVisit scan, SQL writes, signing, or compatibility relabeling of the old generation. */
import {randomUUID} from 'node:crypto';
import {decodeEventLog,encodeAbiParameters,encodeEventTopics,parseAbi,type Hex,type AbiEvent} from 'viem';
import type {CanonicalReader,CanonicalSample} from './chef.ts';
import {contentDigest,digest,fresh,height,hex,object,parseHeader,parseObservation,requireThat,stable,utc,validatePolicy,type BaseEvent,type Header,type Policy} from './types.ts';
export const eventFirstAbi=parseAbi([
 'event InventoryDeposited(address indexed from,uint256 amount)','event InventoryWithdrawn(address indexed to,uint256 amount)',
 'event PayoutReserved(bytes32 indexed id,address indexed recipient,uint256 amount)','event Paid(bytes32 indexed id,address indexed recipient,uint256 amount)',
 'event SettlementCancelled(bytes32 indexed id)','event Funded(bytes32 indexed id,address indexed payer,uint256 amount,uint256 cancellationAvailableAt)',
 'event PayoutCommitted(bytes32 indexed id)','event EscrowSettled(bytes32 indexed id,uint256 amount)','event Refunded(bytes32 indexed id,address indexed recipient,uint256 amount)',
]);
/** At24 header methods/s,256 cannot retain a captured M within40 blocks on a5bps chain. */
export const EVENT_FIRST_MAX_EXPORT_BLOCKS=64;
export type EventFirstState={generation:string;projectionDigest:string;registryDigest:string;revision:string;progress:{height:number;checkpointId:string};checkpoint:{chainId:84532;id:string;height:number;hash:string};processor:{height:number;observedAt:string};recoveryFloor:number};
export type EventFirstSnapshot={state:EventFirstState;events:BaseEvent[]};
export type EventFirstLog={address:string;blockNumber:string;blockHash:string;transactionHash:string;transactionIndex:string;logIndex:string;topics:string[];data:string;removed:false};
export interface EventFirstReader extends CanonicalReader{readonly sourceId:string;logs(from:number,through:number,signal:AbortSignal):Promise<unknown[]>}
export type EventFirstVerifiedExport={protocol:'zee-envio-event-first-export-v1';isolation:'repeatable-read-read-only';snapshotToken:string;expiresAt:string;
 producer:{generation:string;projectionDigest:string;registryDigest:string;revision:string;through:Header;checkpointId:string;recoveryFloor:number;processorObservedAt:string;rpcObservedAt:string;sourceSampledAt:string;sourceHead:Header};
 range:{fromHeight:number;through:Header;headers:Header[];observations:BaseEvent[];contentDigest:string;readStartedAt:string;readCompletedAt:string};
 verification:{kind:'sdk-mvcc-exact-canonical-logs-v1';canonicalSourceId:string;chainId:84532;startRevision:string;endRevision:string;rpcLogDigest:string;sdkEventDigest:string;eventCount:number;checkedAt:string;finalized:Header}};
const numberHex=(v:unknown)=>{requireThat(typeof v==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(v),'EVENT_FIRST_RPC_QUANTITY');const n=Number(BigInt(v));return height(n);};
const quantity=(v:number)=>'0x'+height(v).toString(16);
export function validateEventFirstState(value:unknown,p:Policy,generation:string,now=Date.now()):EventFirstState{
 validatePolicy(p);requireThat(p.adapter==='envio-hyperindex'&&(p.contractVersion??'v1')==='v1','EVENT_FIRST_V1_ONLY');
 const s=object(value,['generation','projectionDigest','registryDigest','revision','progress','checkpoint','processor','recoveryFloor']) as unknown as EventFirstState;
 object(s.progress,['height','checkpointId']);object(s.checkpoint,['chainId','id','height','hash']);object(s.processor,['height','observedAt']);
 requireThat(s.generation===generation&&s.projectionDigest===p.projectionDigest&&s.registryDigest===p.registryDigest&&/^[1-9][0-9]*$/.test(s.revision)&&/^[1-9][0-9]*$/.test(s.progress.checkpointId),'EVENT_FIRST_IDENTITY');
 height(s.progress.height);height(s.recoveryFloor);hex(s.checkpoint.hash,32,true);utc(s.processor.observedAt);fresh(s.processor.observedAt,now);
 requireThat(s.progress.height>=p.birthday&&s.checkpoint.chainId===84532&&s.checkpoint.id===s.progress.checkpointId&&s.checkpoint.height===s.progress.height&&s.processor.height===s.progress.height&&s.recoveryFloor<=s.progress.height+1,'EVENT_FIRST_SDK_CHECKPOINT');return s;
}
export function parseEventFirstLog(value:unknown,p:Policy,from:number,to:number,headers?:ReadonlyMap<number,Header>):EventFirstLog{
 const core=['address','blockNumber','blockHash','transactionHash','transactionIndex','logIndex','topics','data','removed'],optional=['blockTimestamp','blockTimestampMs'].filter(k=>value!==null&&typeof value==='object'&&Object.hasOwn(value,k));
 const raw=object(value,[...core,...optional]),r=Object.fromEntries(core.map(k=>[k,raw[k]])) as EventFirstLog;
 const h=numberHex(r.blockNumber);numberHex(r.transactionIndex);numberHex(r.logIndex);hex(r.blockHash,32,true);hex(r.transactionHash,32,true);hex(r.address,20,true);
 requireThat(h>=from&&h<=to&&r.address===p.contract&&r.removed===false&&Array.isArray(r.topics)&&r.topics.length>=1&&r.topics.length<=4&&/^0x(?:[a-f0-9]{2})*$/.test(r.data)&&r.data.length<=65538,'EVENT_FIRST_RPC_LOG');for(const t of r.topics)hex(t,32,true);
 if(optional.length){const header=headers?.get(h);requireThat(header,'EVENT_FIRST_LOG_TIMESTAMP_HEADER_REQUIRED');const ms=Date.parse(header.time);requireThat(Number.isFinite(ms),'EVENT_FIRST_LOG_TIMESTAMP_HEADER');if(optional.includes('blockTimestamp'))requireThat(numberHex(raw.blockTimestamp)===Math.floor(ms/1000),'EVENT_FIRST_LOG_TIMESTAMP_SECONDS');if(optional.includes('blockTimestampMs'))requireThat(Math.floor(numberHex(raw.blockTimestampMs)/1000)===Math.floor(ms/1000),'EVENT_FIRST_LOG_TIMESTAMP_MILLISECONDS');}
 return r;
}
/** Re-encode stored decoded fields. This binds topics/data too, not just event counts or IDs. */
export function eventFirstLogForEvent(e:BaseEvent):EventFirstLog{
 const abi=eventFirstAbi.find(v=>v.type==='event'&&v.name===e.event) as AbiEvent|undefined;requireThat(abi,'EVENT_FIRST_EVENT_ABI');
 const args=Object.fromEntries(abi.inputs.map(v=>[v.name!,v.type.startsWith('uint')?BigInt(e.decoded[v.name!]!):e.decoded[v.name!]!]));
 const topics=encodeEventTopics({abi:[abi],eventName:abi.name,args:args as any}) as string[],nonIndexed=abi.inputs.filter(v=>!v.indexed);
 const data=encodeAbiParameters(nonIndexed,nonIndexed.map(v=>args[v.name!]) as any);
 return{address:e.contract,blockNumber:quantity(e.block.height),blockHash:e.block.hash,transactionHash:e.txHash,transactionIndex:quantity(e.transactionIndex),logIndex:quantity(e.logIndex),topics,data,removed:false};
}
export function compareEventFirstLogs(rows:unknown[],events:BaseEvent[],p:Policy,headers:Header[],from:number,to:number){
 requireThat(Array.isArray(rows)&&rows.length<=(p.maxObservations??1000),'EVENT_FIRST_LOG_BOUND');const byHeight=new Map(headers.map(h=>[h.height,h]));
 const actual=rows.map(v=>parseEventFirstLog(v,p,from,to,byHeight)),expected=events.map(v=>{const e=parseObservation(v,p) as BaseEvent;requireThat(stable(e.block)===stable(byHeight.get(e.block.height)),'EVENT_FIRST_EVENT_HEADER');return eventFirstLogForEvent(e);});
 const order=(r:EventFirstLog)=>[numberHex(r.blockNumber),numberHex(r.transactionIndex),numberHex(r.logIndex)].map(v=>String(v).padStart(16,'0')).join(':');
 for(const list of [actual,expected]){let previous='';for(const r of list){const k=order(r);requireThat(k>previous&&r.blockHash===byHeight.get(numberHex(r.blockNumber))?.hash,'EVENT_FIRST_LOG_ORDER_OR_HASH');previous=k;
   // Strict ABI decoding rejects malformed topics/data, including unknown topic0.
   const decoded=decodeEventLog({abi:eventFirstAbi,topics:r.topics as [Hex,...Hex[]],data:r.data as Hex,strict:true});requireThat(eventFirstAbi.some(v=>v.type==='event'&&v.name===decoded.eventName),'EVENT_FIRST_UNKNOWN_EVENT');}}
 requireThat(stable(actual)===stable(expected),'EVENT_FIRST_EXACT_LOG_MISMATCH');return{rpcLogDigest:digest(actual),sdkEventDigest:digest(expected),eventCount:actual.length};
}
export async function produceEventFirstExport(o:{policy:Policy;generation:string;verificationSourceId:string;from:number;through:number;reader:EventFirstReader;snapshot:(signal:AbortSignal)=>Promise<EventFirstSnapshot>;fence:(signal:AbortSignal)=>Promise<EventFirstState>;signal?:AbortSignal;now?:()=>number}):Promise<EventFirstVerifiedExport>{
 const now=o.now??Date.now,started=now(),signal=o.signal?AbortSignal.any([o.signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000);height(o.from);height(o.through);requireThat(o.from>=o.policy.birthday&&o.through>=o.from&&o.through-o.from+1<=EVENT_FIRST_MAX_EXPORT_BLOCKS,'EVENT_FIRST_RANGE_BOUND');
 const snap=await o.snapshot(signal),s=validateEventFirstState(snap.state,o.policy,o.generation,now());requireThat(o.through<=s.progress.height&&Array.isArray(snap.events)&&snap.events.length<=(o.policy.maxObservations??1000),'EVENT_FIRST_SNAPSHOT_BOUND');
 const sample=await o.reader.sample(signal);fresh(sample.checkedAt,now());requireThat(sample.sourceId===o.verificationSourceId&&sample.head.height>=s.progress.height&&sample.head.height-s.progress.height<=40&&sample.finalized,'EVENT_FIRST_CANONICAL_SOURCE');
 const M=parseHeader(await o.reader.header(s.progress.height,signal),o.policy.network);requireThat(M.hash===s.checkpoint.hash,'EVENT_FIRST_CHECKPOINT_FORK');
 const headers:Header[]=[],size=o.reader.headerBatchSize??8;requireThat(Number.isSafeInteger(size)&&size>=1&&size<=50,'EVENT_FIRST_HEADER_BATCH');
 for(let h=o.from;h<=o.through;h+=size){const heights=Array.from({length:Math.min(size,o.through-h+1)},(_,i)=>h+i),part=o.reader.headers?await o.reader.headers(heights,signal):await Promise.all(heights.map(v=>o.reader.header(v,signal)));requireThat(part.length===heights.length,'EVENT_FIRST_HEADER_GAP');for(let i=0;i<part.length;i++){const v=parseHeader(part[i],o.policy.network);requireThat(v.height===heights[i]&&(!headers.length||v.parentHash===headers.at(-1)!.hash),'EVENT_FIRST_HEADER_LINK');headers.push(v);}}
 const logs=compareEventFirstLogs(await o.reader.logs(o.from,o.through,signal),snap.events,o.policy,headers,o.from,o.through);
 const end=validateEventFirstState(await o.fence(signal),o.policy,o.generation,now());requireThat(BigInt(end.revision)>=BigInt(s.revision)&&end.progress.height>=s.progress.height,'EVENT_FIRST_SNAPSHOT_ROLLBACK');
 requireThat(stable(await o.reader.header(M.height,signal))===stable(M)&&stable(await o.reader.header(headers.at(-1)!.height,signal))===stable(headers.at(-1)),'EVENT_FIRST_END_REORG');
 if(end.progress.height!==M.height)requireThat((await o.reader.header(end.progress.height,signal)).hash===end.checkpoint.hash,'EVENT_FIRST_END_CHECKPOINT_FORK');else requireThat(end.checkpoint.hash===M.hash,'EVENT_FIRST_END_CHECKPOINT_FORK');
 requireThat(stable(await o.reader.header(sample.head.height,signal))===stable(sample.head)&&stable(await o.reader.header(sample.finalized.height,signal))===stable(sample.finalized),'EVENT_FIRST_SAMPLE_REORG');
 const finished=now();signal.throwIfAborted();requireThat(finished-started<=30000,'EVENT_FIRST_READ_BUDGET');
 const sourceSampledAt=new Date(Math.min(Date.parse(s.processor.observedAt),Date.parse(sample.checkedAt))).toISOString();fresh(sourceSampledAt,finished);
 const packet:EventFirstVerifiedExport={protocol:'zee-envio-event-first-export-v1',isolation:'repeatable-read-read-only',snapshotToken:randomUUID(),expiresAt:new Date(finished+30000).toISOString(),producer:{generation:s.generation,projectionDigest:s.projectionDigest,registryDigest:s.registryDigest,revision:s.revision,through:M,checkpointId:s.progress.checkpointId,recoveryFloor:s.recoveryFloor,processorObservedAt:s.processor.observedAt,rpcObservedAt:sample.checkedAt,sourceSampledAt,sourceHead:sample.head},range:{fromHeight:o.from,through:headers.at(-1)!,headers,observations:snap.events,contentDigest:contentDigest({headers,observations:snap.events}),readStartedAt:new Date(started).toISOString(),readCompletedAt:new Date(finished).toISOString()},verification:{kind:'sdk-mvcc-exact-canonical-logs-v1',canonicalSourceId:sample.sourceId,chainId:84532,startRevision:s.revision,endRevision:end.revision,...logs,checkedAt:new Date(finished).toISOString(),finalized:sample.finalized}};
 return validateEventFirstExport(packet,o.policy,finished,o.verificationSourceId);
}
export function validateEventFirstExport(value:unknown,p:Policy,now=Date.now(),verificationSourceId=p.canonicalSourceId):EventFirstVerifiedExport{
 const v=object(value,['protocol','isolation','snapshotToken','expiresAt','producer','range','verification']) as unknown as EventFirstVerifiedExport;requireThat(v.protocol==='zee-envio-event-first-export-v1'&&v.isolation==='repeatable-read-read-only'&&typeof v.snapshotToken==='string'&&v.snapshotToken.length>0&&Date.parse(utc(v.expiresAt))>now&&Date.parse(v.expiresAt)<=now+60000,'EVENT_FIRST_PROTOCOL');
 const a=v.producer,r=v.range,q=v.verification;object(a,['generation','projectionDigest','registryDigest','revision','through','checkpointId','recoveryFloor','processorObservedAt','rpcObservedAt','sourceSampledAt','sourceHead']);object(r,['fromHeight','through','headers','observations','contentDigest','readStartedAt','readCompletedAt']);object(q,['kind','canonicalSourceId','chainId','startRevision','endRevision','rpcLogDigest','sdkEventDigest','eventCount','checkedAt','finalized']);
 validatePolicy(p);requireThat(p.adapter==='envio-hyperindex'&&a.projectionDigest===p.projectionDigest&&a.registryDigest===p.registryDigest&&typeof a.generation==='string'&&a.generation.length>0&&/^[1-9][0-9]*$/.test(a.checkpointId)&&/^[1-9][0-9]*$/.test(a.revision),'EVENT_FIRST_IDENTITY');
 parseHeader(a.through,p.network);parseHeader(a.sourceHead,p.network);parseHeader(r.through,p.network);parseHeader(q.finalized,p.network);height(a.recoveryFloor);requireThat(a.recoveryFloor<=a.through.height+1&&a.sourceHead.height>=a.through.height&&a.sourceHead.height-a.through.height<=40,'EVENT_FIRST_SOURCE_LAG');
 utc(a.processorObservedAt);utc(a.rpcObservedAt);utc(a.sourceSampledAt);fresh(a.processorObservedAt,now);fresh(a.rpcObservedAt,now);fresh(a.sourceSampledAt,now);requireThat(Date.parse(a.sourceSampledAt)===Math.min(Date.parse(a.processorObservedAt),Date.parse(a.rpcObservedAt)),'EVENT_FIRST_CLOCK_RENEWAL');
 utc(r.readStartedAt);utc(r.readCompletedAt);utc(q.checkedAt);requireThat(Date.parse(r.readCompletedAt)>=Date.parse(r.readStartedAt)&&Date.parse(r.readCompletedAt)-Date.parse(r.readStartedAt)<=30000&&now-Date.parse(r.readStartedAt)>=-5000&&now-Date.parse(r.readStartedAt)<=30000&&Date.parse(r.readCompletedAt)<=now+5000&&q.checkedAt===r.readCompletedAt,'EVENT_FIRST_READ_BUDGET');
 requireThat(q.kind==='sdk-mvcc-exact-canonical-logs-v1'&&q.canonicalSourceId===verificationSourceId&&q.chainId===84532&&q.startRevision===a.revision&&/^[1-9][0-9]*$/.test(q.endRevision)&&BigInt(q.endRevision)>=BigInt(q.startRevision)&&q.finalized.height<=a.sourceHead.height,'EVENT_FIRST_VERIFICATION');
 requireThat(Number.isSafeInteger(r.fromHeight)&&r.fromHeight>=p.birthday&&r.through.height>=r.fromHeight&&r.through.height<=a.through.height&&r.through.height-r.fromHeight+1<=EVENT_FIRST_MAX_EXPORT_BLOCKS&&Array.isArray(r.headers)&&r.headers.length===r.through.height-r.fromHeight+1&&stable(r.headers.at(-1))===stable(r.through)&&Array.isArray(r.observations),'EVENT_FIRST_RANGE_BOUND');
 for(let i=0;i<r.headers.length;i++){const h=parseHeader(r.headers[i],p.network);requireThat(h.height===r.fromHeight+i&&(!i||h.parentHash===r.headers[i-1]!.hash),'EVENT_FIRST_HEADER_LINK');}
 const logs=compareEventFirstLogs(r.observations.map(e=>eventFirstLogForEvent(e)),r.observations,p,r.headers,r.fromHeight,r.through.height);requireThat(logs.rpcLogDigest===q.rpcLogDigest&&logs.sdkEventDigest===q.sdkEventDigest&&logs.eventCount===q.eventCount&&r.contentDigest===contentDigest({headers:r.headers,observations:r.observations}),'EVENT_FIRST_DIGEST');return v;
}
/** Structural validation above is NOT an RPC attestation. Consumers/qualifiers call this IO verifier. */
export async function verifyEventFirstExport(value:unknown,p:Policy,reader:EventFirstReader,signal=AbortSignal.timeout(30000),now=Date.now()):Promise<EventFirstVerifiedExport>{
 const started=performance.now(),v=validateEventFirstExport(value,p,now,reader.sourceId),sample=await reader.sample(signal);fresh(sample.checkedAt,Date.now());requireThat(sample.sourceId===reader.sourceId&&sample.finalized&&sample.head.height>=v.producer.sourceHead.height&&sample.head.height>=v.producer.through.height&&sample.head.height-v.producer.through.height<=40&&v.verification.finalized.height<=sample.finalized.height,'EVENT_FIRST_INDEPENDENT_SOURCE');
 requireThat(stable(await reader.header(v.producer.through.height,signal))===stable(v.producer.through),'EVENT_FIRST_INDEPENDENT_M');
 requireThat(stable(await reader.header(v.producer.sourceHead.height,signal))===stable(v.producer.sourceHead)&&stable(await reader.header(v.verification.finalized.height,signal))===stable(v.verification.finalized),'EVENT_FIRST_INDEPENDENT_CLAIMED_HEAD_OR_FINALITY');
 const size=reader.headerBatchSize??8;requireThat(Number.isSafeInteger(size)&&size>=1&&size<=50,'EVENT_FIRST_HEADER_BATCH');
 for(let i=0;i<v.range.headers.length;i+=size){const expected=v.range.headers.slice(i,i+size),actual=reader.headers?await reader.headers(expected.map(h=>h.height),signal):await Promise.all(expected.map(h=>reader.header(h.height,signal)));requireThat(stable(actual)===stable(expected),'EVENT_FIRST_INDEPENDENT_HEADERS');}
 compareEventFirstLogs(await reader.logs(v.range.fromHeight,v.range.through.height,signal),v.range.observations,p,v.range.headers,v.range.fromHeight,v.range.through.height);
 requireThat(stable(await reader.header(v.producer.through.height,signal))===stable(v.producer.through)&&stable(await reader.header(v.range.through.height,signal))===stable(v.range.through),'EVENT_FIRST_INDEPENDENT_END_REORG');requireThat(stable(await reader.header(sample.head.height,signal))===stable(sample.head)&&stable(await reader.header(sample.finalized!.height,signal))===stable(sample.finalized),'EVENT_FIRST_INDEPENDENT_SAMPLE_REORG');signal.throwIfAborted();requireThat(performance.now()-started<=30000,'EVENT_FIRST_READ_BUDGET');return validateEventFirstExport(v,p,Date.now(),reader.sourceId);
}
