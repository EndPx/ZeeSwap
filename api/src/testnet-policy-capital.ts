/** Physical observations are separate from SQL-authorized provenance and never renew on heartbeat. */
export type PolicyCapitalNote={pool:'ironwood';txid:string;index:number;value:string};
type Pins={policySha256:string;profileSha256:string;loaderSha256:string;captureScriptSha256:string};
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)&&v!=='0'.repeat(64);
const integer=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
function need(v:unknown,code:string):asserts v {if(!v)throw Error(code);}
function record(v:unknown):Record<string,any>{need(v!==null&&typeof v==='object'&&!Array.isArray(v),'POLICY_CAPITAL_OBJECT');return v as Record<string,any>;}
function timestamp(v:unknown){need(typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(v),'POLICY_CAPITAL_TIME');const t=Date.parse(v);need(Number.isFinite(t),'POLICY_CAPITAL_TIME');return t;}
const key=(n:PolicyCapitalNote)=>`${n.pool}:${n.txid}:${n.index}`;
export function validatePolicyCapitalProof(capture:unknown,expected:Pins,now=Date.now()):{notes:PolicyCapitalNote[];observedAt:string}{
 const p=record(capture),s=record(p.snapshot);
 need(Number.isFinite(now)&&p.version===1&&p.status==='ROOT_TESTNET_POLICY_NATIVE_CAPITAL_CAPTURED','POLICY_CAPITAL_VERSION');
 for(const k of ['policySha256','profileSha256','loaderSha256','captureScriptSha256'] as const)need(hash(expected[k])&&p[k]===expected[k],'POLICY_CAPITAL_PIN');
 need(p.walletProcessUid===986&&p.walletProcessGid===978&&p.supplementaryGroupsDropped===true&&p.groupReaped===true&&p.pendingCalculatedCount===0&&p.transactionsCreated===0,'POLICY_CAPITAL_PROCESS');
 const sync=timestamp(p.syncCompletedAt),canonical=timestamp(p.canonicalCheckedAt),observed=timestamp(p.observedAt);
 need(canonical>=sync&&observed===Math.min(sync,canonical)&&[sync,canonical,observed].every(t=>now-t>=-5000&&now-t<=60000),'POLICY_CAPITAL_STALE');
 need(s.schemaVersion===1&&s.network==='zcash-testnet'&&s.consensusBranch==='77190ad9'&&timestamp(s.observedAt)===observed&&integer(s.scannedHeight)&&s.scannedHeight>=10&&hash(s.tipHash)&&integer(p.sourceHeadHeight)&&p.sourceHeadHeight>=s.scannedHeight&&p.sourceHeadHeight-s.scannedHeight<=6,'POLICY_CAPITAL_SOURCE');
 need(Array.isArray(p.capitalNotes)&&p.capitalNotes.length>0&&p.capitalNotes.length<=32&&Array.isArray(s.outputs)&&s.outputs.length===p.capitalNotes.length&&Array.isArray(s.blocks)&&s.blocks.length<=34,'POLICY_CAPITAL_BOUND');
 const headers=new Map<number,string>();
 for(const v of s.blocks){const b=record(v);need(integer(b.height)&&hash(b.hash)&&!headers.has(b.height),'POLICY_CAPITAL_HEADER');timestamp(b.time);headers.set(b.height,b.hash);}
 need(headers.get(s.scannedHeight)===s.tipHash&&headers.has(s.scannedHeight-9),'POLICY_CAPITAL_CHECKPOINT');
 const seen=new Set<string>();let total=0n;
 const notes=p.capitalNotes.map((v:unknown)=>{const n=record(v);need(n.pool==='ironwood'&&hash(n.txid)&&integer(n.index)&&typeof n.value==='string'&&/^[1-9][0-9]*$/.test(n.value)&&BigInt(n.value)<=2100000000000000n&&integer(n.height)&&n.height>0&&s.scannedHeight-n.height+1>=10&&typeof n.ownChange==='boolean'&&hash(n.blockHash)&&headers.get(n.height)===n.blockHash,'POLICY_CAPITAL_NOTE');
  const note:PolicyCapitalNote={pool:'ironwood',txid:n.txid,index:n.index,value:n.value};need(!seen.has(key(note)),'POLICY_CAPITAL_DUPLICATE');seen.add(key(note));total+=BigInt(n.value);
  const matches=s.outputs.filter((raw:unknown)=>{const o=record(raw);return o.pool===n.pool&&o.txid===n.txid&&o.index===n.index;});need(matches.length===1,'POLICY_CAPITAL_RECEIPT');const o=matches[0];
  need(o.amount===n.value&&o.height===n.height&&o.blockHash===n.blockHash&&o.ownChange===n.ownChange&&o.shieldedSource===true,'POLICY_CAPITAL_RECEIPT');timestamp(o.blockTime);return note;
 });
 need(p.capitalBalanceZatoshi===total.toString(),'POLICY_CAPITAL_BALANCE');return{notes,observedAt:p.observedAt};
}
/** Every selected physical note must have independently validated, exact SQL provenance. */
export function requirePolicyCapitalProvenance(notes:PolicyCapitalNote[],provenance:PolicyCapitalNote[]):PolicyCapitalNote[]{
 const allowed=new Map<string,string>();for(const n of provenance){const k=key(n);need(!allowed.has(k)||allowed.get(k)===n.value,'POLICY_CAPITAL_PROVENANCE_CONFLICT');allowed.set(k,n.value);}
 need(notes.length>0&&notes.length<=32,'POLICY_CAPITAL_BOUND');const seen=new Set<string>();for(const n of notes){const k=key(n);need(!seen.has(k)&&allowed.get(k)===n.value,'POLICY_CAPITAL_UNEXPLAINED_NOTE');seen.add(k);}return notes.map(n=>({...n}));
}
