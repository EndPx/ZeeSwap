import {stat,unlink,type FileHandle} from 'node:fs/promises';
import type {BigIntStats} from 'node:fs';
import {g5Diagnostic} from './g5-diagnostic.ts';

export const G5_REVERSE_INIT_PHASES=['ARGUMENTS','CONFIG_READ','TARGET','SLOT','VIEW_BINDING','RUNTIME','POOLS','BASE','SIGNERS','STATE_READ','STATE_BINDING','PAUSE','POOL_CLOSE','SLOT_CLOSE'] as const;
export type G5ReverseInitPhase=typeof G5_REVERSE_INIT_PHASES[number];
const STEPS=['quote','funding','observe-funding','prepare-commit','broadcast-commit','observe-commit','approve-wallet','prepare-zcash','recover-zcash','broadcast-zcash','observe-zcash','prepare-settle','broadcast-settle','observe-settle'];
const CODES=['G5_REVERSE_EXPLICIT_STEP_CONFIG_REQUIRED','G5_SOURCE_VIEWING_WALLET_BINDING_REQUIRED','G5_PRIVATE_OWNER_MISMATCH','G5_PRIVATE_ORDER_MISMATCH',
 'G5_EXACT_BRANCH_REQUIRED','G5_RUNTIME_BRANCH_MISMATCH','G5_MANIFEST_REQUIRED','G5_RETRY_BATCH_CAPITAL_PROFILE_REQUIRED','G5_ISOLATED_USER_SOURCE_REFUNDS_REQUIRED','G5_HISTORICAL_RUN_PROFILE_IMMUTABLE','G5_ISOLATED_REVERSE_CONFIGS_REQUIRED',
 'G5_MANIFEST_BINDING_MISMATCH','G5_BATCH_PROFILE_MISMATCH','G5_BATCH_BARRIER_SEQUENCE','G5_ORDER_SEQUENCE_MISMATCH','G5_DUPLICATE_ORDER','G5_PREDECESSOR_VERIFICATION_REQUIRED','G5_FIVE_ORDER_BATCH_LIMIT',
 'G5_INCIDENT_RUN_FROZEN','G5_RUN_CLOSED','G5_SEQUENCE_REQUIRED','G5_BATCH_BARRIER_REQUIRED','G5_NEXT_SEQUENCE_REQUIRED','G5_ONE_OUTSTANDING_ORDER','G5_REVERSE_SLOT_BINDING_MISMATCH',
 'G5_REVERSE_PAYER_OR_CAP_MISMATCH','G5_ROUNDTRIP_SAME_USER_RECEIVER_REQUIRED','G5_REVERSE_RUNTIME_CONFIG_BINDING','G5_EXPLICIT_ADAPTER_CONFIG_REQUIRED','G5_FIXED_CONFIG_PATH_REQUIRED','G5_ABSOLUTE_CONFIG_PATH_REQUIRED','G5_ADAPTER_CONFIG_BINDING_MISMATCH',
 'G5_REVERSE_CAPITAL_ALLOCATION_MISMATCH','G5_PRIVATE_QUOTE_RECOVERY_CONFLICT','G5_IMMUTABLE_ORDER_BINDING','G5_MANIFEST_DATABASE_TARGET_MISMATCH','INVALID_BASE_CONFIG','G5_PRIVATE_REFERENCE_PATH_REQUIRED','G5_PRIVATE_REFERENCE_TRAVERSAL','G5_PRIVATE_ABSOLUTE_REFERENCE_REQUIRED',
 'REVERSE_OPERATOR_PAUSE_FAILED','PRIVATE_JSON_PATH_INVALID','PRIVATE_JSON_WSL_ROUTE_INVALID','PRIVATE_JSON_WSL_DISTRIBUTION_REQUIRED',
 'PRIVATE_JSON_WSL_PROTOCOL_INVALID','PRIVATE_JSON_READ_FAILED','PRIVATE_JSON_READ_TOO_LARGE','PRIVATE_JSON_WSL_TIMEOUT',
 'PRIVATE_JSON_WSL_PROCESS_UNAVAILABLE','PRIVATE_JSON_WSL_OUTPUT_LIMIT','PRIVATE_JSON_WSL_PROCESS_FAILED','PRIVATE_JSON_PARSE_FAILED'];
const NODE_CODES=['EWSLROUTE','EWSLPROTO','EWSLPROCESS','EJSONPARSE','EFBIG','EUNKNOWN','EISDIR','ENOTDIR','ELOOP','ENAMETOOLONG','ENOENT','EACCES','EPERM','EEXIST','EIO','ETIMEDOUT','ECONNRESET','ERR_MODULE_NOT_FOUND','ERR_UNKNOWN_FILE_EXTENSION','ERR_PACKAGE_PATH_NOT_EXPORTED','ERR_INVALID_MODULE_SPECIFIER','ERR_UNSUPPORTED_DIR_IMPORT'];
const SQL_STATES=['08000','08001','08003','08006','57P01','57P02','57P03','53300','53400','57014','40001','40P01','42501','42P01','42703','23505','23514','22023','P0001'];
const FILES=['private-json-read.ts','g5-reverse-operator.ts','g5-slot.ts','g5-context.ts','g5-run.ts','runtime.ts','config.ts','base-contract.ts','reverse-base-rpc.ts','private-data.ts','reverse-wallet-adapter.ts','wallet-adapter.ts','db.ts','g5-reverse-startup.ts','g5-diagnostic.ts','wallet-scanner-protocol.ts'];
export function reverseStartupDiagnostic(error:unknown,step:unknown,phase:unknown){
 const safeStep=typeof step==='string'&&STEPS.includes(step)?step:'initialization';
 const cleanup=['PAUSE','POOL_CLOSE','SLOT_CLOSE'].includes(phase as string);
 const safePhase=G5_REVERSE_INIT_PHASES.includes(phase as G5ReverseInitPhase)?`G5_REVERSE_${cleanup?'CLEANUP':'INIT'}_${phase}`:'G5_REVERSE_INIT_ARGUMENTS';
 const base=g5Diagnostic(error,safeStep,safePhase),value=error as any;
 const code=typeof value?.message==='string'&&CODES.includes(value.message)?value.message:
  typeof value?.code==='string'&&NODE_CODES.includes(value.code)?value.code:'PRIVATE_DIAGNOSTIC_ERROR';
 const sqlState=typeof value?.code==='string'&&SQL_STATES.includes(value.code)?value.code:undefined;
 // Do not forward g5Diagnostic's permissive message-code rule or its optional
 // observer/scanner fields. This emitted boundary has a closed vocabulary.
 const diagnostic={version:1 as const,observedAt:base.observedAt,step:safeStep,phase:safePhase,code,exceptionClass:base.exceptionClass,
  ...(sqlState?{sqlState}:{}),frames:base.frames.filter((f:{file:string;line:number;column:number})=>FILES.includes(f.file)&&Number.isSafeInteger(f.line)&&f.line>0&&Number.isSafeInteger(f.column)&&f.column>0).map((f:{file:string;line:number;column:number})=>({file:f.file,line:f.line,column:f.column}))};
 return {version:1 as const,status:cleanup?'G5_REVERSE_CLEANUP_FAILED' as const:'G5_REVERSE_INITIALIZATION_FAILED' as const,diagnostic};
}
/** Emit to the parent BEFORE attempting fallible private file IO. Both sinks
 * receive only the static sanitized packet, never raw exception text/argv. */
export async function reportReverseStartupFailure(error:unknown,step:unknown,phase:unknown,io:{emit(packet:ReturnType<typeof reverseStartupDiagnostic>):void;persist?(packet:ReturnType<typeof reverseStartupDiagnostic>):Promise<void>}){
 const packet=reverseStartupDiagnostic(error,step,phase);try{io.emit(packet);}catch{}
 try{await io.persist?.(packet);}catch{}return packet;
}

export type G5OwnedLockIdentity=Pick<BigIntStats,'dev'|'ino'|'birthtimeNs'>;
/** Release only the actual file acquired by this process. A missing/replaced
 * pathname is never authority to unlink another owner's sentinel. */
export async function closeOwnedG5Lock(path:string,handle:FileHandle,identity:G5OwnedLockIdentity){
 try{
  let current:BigIntStats|undefined;
  try{current=await stat(path,{bigint:true});}catch(error){if((error as any).code!=='ENOENT')throw error;}
  if(current&&current.dev===identity.dev&&current.ino===identity.ino&&current.birthtimeNs===identity.birthtimeNs
   &&(identity.ino!==0n||identity.birthtimeNs!==0n))await unlink(path);
 }finally{await handle.close();}
}
export async function cleanupG5StartupResources(pools:{end():Promise<unknown>}[],lock?:{path:string;handle:FileHandle;identity:G5OwnedLockIdentity}){
 const ended=await Promise.allSettled(pools.map(pool=>Promise.resolve().then(()=>pool.end())));
 try{if(lock)await closeOwnedG5Lock(lock.path,lock.handle,lock.identity);}
 finally{const failure=ended.find(r=>r.status==='rejected');if(failure?.status==='rejected')throw failure.reason;}
}
