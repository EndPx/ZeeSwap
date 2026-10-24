/** Explicit APP-only prefunding continuation. Never changes epoch or controls. */
import {readFile,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type pg from 'pg';
import {validateLiveOpeningRows} from './live-testnet-opening.ts';
import {digest,requireThat,stable} from './integrations/observation/types.ts';
export const PREFUNDING_EPOCH_SCOPE={branchId:'br-broad-pine-ao79wemx',database:'zee_app_20261023'} as const;
export interface EpochContext{profileSha256:string;handoffSha256:string;openingProofSha256:string;openingEventId:string}
interface PrefundingEpochProofCommon extends EpochContext{
 purpose:'APP_PREFUNDING_EPOCH_CONTINUATION';branchId:string;database:string;verifiedAt:string;expiresAt:string;runtimeXmin:string;
 incident:{kind:'CHEF_SINGLE_TIP_REPLACEMENT_RESOLVED';replacedHeight:number;wrongTipHash:string;canonicalTipHash:string;appCursorHeight:number;appCursorHash:string;appSqlAnchorsCanonical:true;appCursorCanonical:true;generationUnchanged:true;chefGeneration:string;resolutionReceiptSha256:string};
 envioPrefix:{proofCount:number;proofDigest:string;identityDigest:string;originalAdmissionSha256:string;originalSqlDigest:string};
 state:{acceptingOrders:false;dispatchEnabled:false;reconciliationRequired:true;assetsDisabled:true;openingLedgerUnchanged:true;financialWorkersStopped:true;counts:{quotes:'0';orders:'0';deposits:'0';obligations:'0';operations:'0';activeLeases:'0'};latestOperatorNonce:0;pendingOperatorNonce:0};
 capital:{observedAt:string;nativeCaptureSha256:string;baseProofSha256:string;physicalZatoshi:'12500000';openingNoteCanonical:true;gasWei:'500000000000000';inventory:'10100000';available:'10000000';reserved:'100000';liability:'100000'};
}
export interface PrefundingEpochProofV1 extends PrefundingEpochProofCommon{version:1;epoch:'1';incident:PrefundingEpochProofCommon['incident']&{replacedHeight:4535991;appCursorHeight:4535990};envioPrefix:PrefundingEpochProofCommon['envioPrefix']&{proofCount:142}}
export interface PrefundingEpochProofV2 extends PrefundingEpochProofCommon{version:2;epoch:string;metadataReconciliationReceiptSha256:string}
export type PrefundingEpochProof=PrefundingEpochProofV1|PrefundingEpochProofV2;
export interface EpochAuthority{proof:PrefundingEpochProof;sha256:string}
const hash=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)&&!/^0+$/.test(v);
const fail=(ok:unknown,code:string)=>requireThat(ok,'PREFUNDING_EPOCH_'+code);
export function validatePrefundingEpochProof(p:PrefundingEpochProof,expected:EpochContext,now=Date.now()){
 const legacy=p?.version===1;
 fail((legacy||p?.version===2)&&p.purpose==='APP_PREFUNDING_EPOCH_CONTINUATION'&&p.branchId===PREFUNDING_EPOCH_SCOPE.branchId&&p.database===PREFUNDING_EPOCH_SCOPE.database&&(legacy?p.epoch==='1':typeof p.epoch==='string'&&/^[1-9][0-9]*$/.test(p.epoch)&&BigInt(p.epoch)>=2n)&&/^[1-9][0-9]*$/.test(p.runtimeXmin),'SCOPE');
 for(const k of ['profileSha256','handoffSha256','openingProofSha256'] as const)fail(hash(p[k])&&p[k]===expected[k],'IMMUTABLE_BINDING');
 fail(typeof p.openingEventId==='string'&&p.openingEventId===expected.openingEventId,'OPENING_EVENT');
 const at=Date.parse(p.verifiedAt),end=Date.parse(p.expiresAt);fail(Number.isFinite(at)&&Number.isFinite(end)&&at<=now+5000&&end>now&&end>at&&end-at<=86400000,'VALIDITY');
 if(p.version===2)fail(hash(p.metadataReconciliationReceiptSha256),'METADATA_RECONCILIATION_RECEIPT');
 const i=p.incident;fail(i?.kind==='CHEF_SINGLE_TIP_REPLACEMENT_RESOLVED'&&(legacy?i.replacedHeight===4535991&&i.appCursorHeight===4535990:Number.isSafeInteger(i.replacedHeight)&&i.replacedHeight>0&&i.appCursorHeight===i.replacedHeight-1)&&hash(i.wrongTipHash)&&hash(i.canonicalTipHash)&&i.wrongTipHash!==i.canonicalTipHash&&hash(i.appCursorHash)&&i.appSqlAnchorsCanonical===true&&i.appCursorCanonical===true&&i.generationUnchanged===true&&typeof i.chefGeneration==='string'&&i.chefGeneration.length>0&&hash(i.resolutionReceiptSha256),'RESOLVED_INCIDENT');
 const e=p.envioPrefix;fail((legacy?e?.proofCount===142:Number.isSafeInteger(e?.proofCount)&&e.proofCount>=142)&&['proofDigest','identityDigest','originalAdmissionSha256','originalSqlDigest'].every(k=>hash((e as any)[k])),'ENVIO_PREFIX');
 const s=p.state;fail(s?.acceptingOrders===false&&s.dispatchEnabled===false&&s.reconciliationRequired===true&&s.assetsDisabled===true&&s.openingLedgerUnchanged===true&&s.financialWorkersStopped===true&&s.latestOperatorNonce===0&&s.pendingOperatorNonce===0&&s.counts&&Object.keys(s.counts).sort().join(',')==='activeLeases,deposits,obligations,operations,orders,quotes'&&Object.values(s.counts).every(v=>v==='0'),'PREFUNDING_STATE');
 const c=p.capital;fail(c?.physicalZatoshi==='12500000'&&c.openingNoteCanonical===true&&hash(c.nativeCaptureSha256)&&hash(c.baseProofSha256)&&c.gasWei==='500000000000000'&&c.inventory==='10100000'&&c.available==='10000000'&&c.reserved==='100000'&&c.liability==='100000'&&at-Date.parse(c.observedAt)>=-5000&&at-Date.parse(c.observedAt)<=60000,'CAPITAL_AT_ISSUANCE');
 return p;
}
export function requireEpochAuthorityCurrent(a:EpochAuthority,now=Date.now()){
 fail(hash(a?.sha256),'AUTHORITY_HASH');validatePrefundingEpochProof(a.proof,a.proof,now);
}
export function validateRootEpochFileMetadata(s:{uid:number;gid:number;mode:number;isFile():boolean;isSymbolicLink():boolean},path:string,resolved:string){
 fail(path.startsWith('/opt/zeeswap-testnet/state/prefunding-epoch/')&&!path.slice('/opt/zeeswap-testnet/state/prefunding-epoch/'.length).includes('/')&&path.endsWith('.private.json')&&resolved===path&&s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&0o027)===0&&((s.mode&0o040)===0||s.gid===978),'ROOT_PRIVATE_FILE');
}
export function decodePrefundingEpochAuthority(bytes:Buffer,sha256:string,expected:EpochContext,now=Date.now()):EpochAuthority{
 fail(hash(sha256)&&createHash('sha256').update(bytes).digest('hex')===sha256,'ROOT_PROOF_HASH');return{proof:validatePrefundingEpochProof(JSON.parse(bytes.toString()),expected,now),sha256};
}
/** Root0600 or root:service0640, never writable by group/other. No admin credential. */
export async function loadPrefundingEpochAuthority(expected:EpochContext,env:NodeJS.ProcessEnv=process.env):Promise<EpochAuthority|undefined>{
 const path=env.ZEESWAP_PREFUNDING_EPOCH_PROOF,sha256=env.ZEESWAP_PREFUNDING_EPOCH_SHA256;if(!path&&!sha256)return undefined;
 fail(path&&hash(sha256),'EXPLICIT_PROOF_SELECTOR');const s=await lstat(path!),resolved=await realpath(path!);validateRootEpochFileMetadata(s,path!,resolved);fail(s.size<=262144,'PROOF_SIZE');
 return decodePrefundingEpochAuthority(await readFile(path!),sha256!,expected);
}
export function requirePrefundingEpochControl(row:any,a?:EpochAuthority,now=Date.now()){
 if(a)requireEpochAuthorityCurrent(a,now);
 fail(row&&String(row.epoch)===(a?.proof.epoch??'0')&&row.accepting_orders===false&&row.dispatch_enabled===false&&row.reconciliation_required===true,'EXACT_PAUSED_EPOCH');
 if(a)fail(String(row.xmin)===a.proof.runtimeXmin,'RUNTIME_INTERVENTION');
}
export const authorizedPrefundingSnapshotSql=`SELECT current_database() db,current_user role,
 (SELECT jsonb_build_object('accepting_orders',accepting_orders,'dispatch_enabled',dispatch_enabled,'reconciliation_required',reconciliation_required,'epoch',epoch::text,'xmin',xmin::text) FROM zee.runtime_control WHERE singleton) control,
 jsonb_build_object('quotes',(SELECT count(*)::text FROM zee.quotes),'orders',(SELECT count(*)::text FROM zee.orders),'deposits',(SELECT count(*)::text FROM zee.deposits),'obligations',(SELECT count(*)::text FROM zee.obligations),'operations',(SELECT count(*)::text FROM zee.operations),'activeLeases',(SELECT count(*)::text FROM zee.outbox_jobs WHERE status='LEASED' AND lease_until>clock_timestamp())) counts,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'live_enabled',live_enabled,'decimals',decimals,'network',network,'contract_address',contract_address)) FROM (SELECT id,live_enabled,decimals,network,contract_address FROM zee.assets LIMIT 4) a),'[]'::jsonb) assets,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('asset',asset,'purpose',purpose,'balance',balance::text,'reserved',reserved::text)) FROM (SELECT asset,purpose,balance,reserved FROM zee.inventory_accounts LIMIT 5) a),'[]'::jsonb) accounts,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('event_id',event_id::text,'asset',asset,'bucket',bucket,'amount',amount::text)) FROM (SELECT event_id,asset,bucket,amount FROM zee.ledger_entries LIMIT 9) l),'[]'::jsonb) ledger`;
export function validateAuthorizedPrefundingSnapshot(row:any,a:EpochAuthority){
 requireEpochAuthorityCurrent(a);fail(row?.db===PREFUNDING_EPOCH_SCOPE.database&&['zee_app_worker_20261023','zee_app_admin_20261023'].includes(row.role),'CONNECTED_SCOPE');requirePrefundingEpochControl(row.control,a);
 const counts=row.counts;fail(counts&&Object.keys(counts).sort().join(',')==='activeLeases,deposits,obligations,operations,orders,quotes'&&Object.values(counts).every(v=>v==='0'),'CURRENT_BOOKS_OR_LEASES');
 const assets=row.assets;fail(Array.isArray(assets)&&assets.length===3&&assets.every(r=>r.live_enabled===false)&&assets.some(r=>r.id==='TAZ'&&r.decimals===8&&r.network==='zcash-testnet'&&r.contract_address===null)&&assets.some(r=>r.id==='mockUSDC'&&r.decimals===6&&r.network==='base-sepolia'&&r.contract_address?.toLowerCase()==='0xd64c116352cef2adc9484098ae332fd9ba339a63')&&assets.some(r=>r.id==='baseETH'&&r.decimals===18&&r.network==='base-sepolia'&&r.contract_address===null),'CURRENT_ASSETS');
 fail(Array.isArray(row.accounts)&&Array.isArray(row.ledger),'CURRENT_OPENING_ROWS');validateLiveOpeningRows(a.proof.openingEventId,row.accounts,row.ledger);return row;
}
/** One coherent SELECT, repeated under the publication lock; no cached guard. */
export async function requireAuthorizedPrefundingDatabase(c:Pick<pg.PoolClient,'query'>,a:EpochAuthority){return validateAuthorizedPrefundingSnapshot((await c.query(authorizedPrefundingSnapshotSql)).rows[0],a);}
export function requireAuthorizedEnvioPrefix(j:any,a:EpochAuthority){
 requireEpochAuthorityCurrent(a);const e=a.proof.envioPrefix;fail(j?.proofs?.length>=e.proofCount&&j.proofs[e.proofCount-1]?.proofDigest===e.proofDigest&&digest(j.identity)===e.identityDigest&&j.originalAdmissionSha256===e.originalAdmissionSha256&&digest(j.originalSql)===e.originalSqlDigest,'ORIGINAL_ENVIO_PREFIX_CHANGED');
}
export function epochEvidenceBinding(a?:EpochAuthority){return a?{epoch:a.proof.epoch,runtimeXmin:a.proof.runtimeXmin,authorizationSha256:a.sha256}:undefined;}
export function requireEpochEvidenceBinding(value:unknown,a?:EpochAuthority){fail(a?stable(value)===stable(epochEvidenceBinding(a)):value===undefined,'EVIDENCE_BINDING');if(a)requireEpochAuthorityCurrent(a);}
