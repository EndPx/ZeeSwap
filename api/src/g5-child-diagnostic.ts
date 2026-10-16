import {signerInvokePacket} from './base-signer-protocol.ts';
import {sourceActorDiagnostic} from './g5-source-protocol.ts';
/** Parse untrusted child stderr into a closed static vocabulary. Never retain
 * provider text, command arguments, URLs, paths, raw bytes or stdout. */
const codes=['ENOENT','EACCES','EPERM','ECONNRESET','ETIMEDOUT','EISDIR','ENOTDIR','ELOOP','ENAMETOOLONG','EWSLROUTE','EWSLPROTO','EWSLPROCESS','EJSONPARSE','EFBIG','EUNKNOWN','PRIVATE_JSON_PATH_INVALID','PRIVATE_JSON_WSL_ROUTE_INVALID','PRIVATE_JSON_WSL_DISTRIBUTION_REQUIRED','PRIVATE_JSON_WSL_PROTOCOL_INVALID','PRIVATE_JSON_READ_FAILED','PRIVATE_JSON_READ_TOO_LARGE','PRIVATE_JSON_WSL_TIMEOUT','PRIVATE_JSON_WSL_PROCESS_UNAVAILABLE','PRIVATE_JSON_WSL_OUTPUT_LIMIT','PRIVATE_JSON_WSL_PROCESS_FAILED','PRIVATE_JSON_PARSE_FAILED','ERR_MODULE_NOT_FOUND','ERR_UNKNOWN_FILE_EXTENSION','ERR_PACKAGE_PATH_NOT_EXPORTED','ERR_INVALID_MODULE_SPECIFIER','ERR_UNSUPPORTED_DIR_IMPORT',
 'G5_MANIFEST_BINDING_MISMATCH','G5_REVERSE_SLOT_BINDING_MISMATCH','G5_REVERSE_RUNTIME_CONFIG_BINDING','G5_PRIVATE_OWNER_MISMATCH','G5_PRIVATE_ORDER_MISMATCH','G5_MANIFEST_DATABASE_TARGET_MISMATCH','G5_INCIDENT_RUN_FROZEN','G5_ADAPTER_CONFIG_BINDING_MISMATCH','G5_EXPLICIT_ADAPTER_CONFIG_REQUIRED','G5_UNMATCHED_FUNDS_RECONCILE','G5_EXPLICIT_RECONCILIATION_REQUIRED','WALLET_UNAVAILABLE','REVERSE_OPERATOR_PAUSE_FAILED'];
const sqlStates=['08000','08001','08003','08006','57P01','57P02','57P03','53300','53400','57014','40001','40P01','42501','42P01','42703','23505','23514','22023','P0001'];
const files=['g5-reverse-operator.ts','g5-operator.ts','g5-slot.ts','g5-context.ts','g5-run.ts','runtime.ts','config.ts','base-contract.ts','reverse-base-rpc.ts','private-data.ts','reverse-wallet-adapter.ts','wallet-adapter.ts','db.ts','g5-live-controller.ts','private-json-read.ts'];
const initPhases=['G5_REVERSE_INIT_CONFIG_READ','G5_REVERSE_INIT_TARGET','G5_REVERSE_INIT_SLOT','G5_REVERSE_INIT_VIEW_BINDING','G5_REVERSE_INIT_RUNTIME','G5_REVERSE_INIT_POOLS','G5_REVERSE_INIT_BASE','G5_REVERSE_INIT_SIGNERS','G5_REVERSE_INIT_STATE_READ','G5_REVERSE_INIT_STATE_BINDING','G5_REVERSE_CLEANUP_PAUSE','G5_REVERSE_CLEANUP_POOL_CLOSE','G5_REVERSE_CLEANUP_SLOT_CLOSE'];
export function g5ChildDiagnostic(stderr:string,action:{sequence:number;stage:string},exitCode:number|null,signal:string|null):{version:number;status:string;sequence:number;stage:string;phase:string;exceptionClass:string;code:string;sqlState?:string;frames:{file:string;line:number;column:number}[];sourceActor?:ReturnType<typeof sourceActorDiagnostic>;signer?:NonNullable<ReturnType<typeof signerInvokePacket>>['diagnostic'];cleanup?:{phase:string;exceptionClass:string;code:string;sqlState?:string;frames:{file:string;line:number;column:number}[]}[];exitCode:number|null;signal:string|null}{
 const code=codes.find(code=>new RegExp('(?:^|[^A-Z0-9_])'+code+'(?:$|[^A-Z0-9_])').test(stderr));
 const state=stderr.match(/\bcode\s*:\s*['"]([A-Z0-9]{5})['"]/i)?.[1];
 const exceptionClass=stderr.match(/(?:^|\n)(TypeError|SyntaxError|RangeError|ReferenceError|Error)(?:\s*\[[A-Z_]+\])?:/)?.[1]??'Unknown';
 const frames=stderr.split(/\r?\n/).flatMap(line=>{const m=line.match(/([A-Za-z0-9_-]+\.(?:ts|js)):(\d+):(\d+)/);return m&&files.includes(m[1])?[{file:m[1],line:Number(m[2]),column:Number(m[3])}]:[];}).slice(0,12);
 const lines=stderr.split(/\r?\n/),bodyIndex=lines.findIndex(l=>l.startsWith('REVERSE_OPERATOR_STEP_FAILED:')||l==='G5_OPERATOR_STOPPED_RECONCILE_ORIGINAL_ATTEMPTS');
 const packets:{position:number;status:string;phase:string;exceptionClass:string;code:string;sqlState?:string;frames:{file:string;line:number;column:number}[]}[]=[];
 for(const [position,line] of lines.entries()){try{const p=JSON.parse(line);if(p?.version===1&&['G5_REVERSE_INITIALIZATION_FAILED','G5_REVERSE_CLEANUP_FAILED'].includes(p.status)&&initPhases.includes(p.diagnostic?.phase)){
  packets.push({position,status:p.status,phase:p.diagnostic.phase,exceptionClass:['Error','TypeError','SyntaxError','RangeError','ReferenceError','Unknown'].includes(p.diagnostic.exceptionClass)?p.diagnostic.exceptionClass:'Unknown',code:codes.includes(p.diagnostic.code)?p.diagnostic.code:'CHILD_COMMAND_FAILED',...(sqlStates.includes(p.diagnostic.sqlState)?{sqlState:p.diagnostic.sqlState}:{}),
   frames:(Array.isArray(p.diagnostic.frames)?p.diagnostic.frames:[]).filter((f:any)=>files.includes(f.file)&&Number.isSafeInteger(f.line)&&f.line>0&&Number.isSafeInteger(f.column)&&f.column>0).slice(0,12).map((f:any)=>({file:f.file,line:f.line,column:f.column}))});
 }}catch{}}
 const sourcePackets=lines.flatMap(line=>{try{const p=sourceActorDiagnostic(JSON.parse(line));return p&&p.sequence===action.sequence&&action.sequence%2===1
  &&(action.stage==='SYNC'&&p.command==='sync'||action.stage==='SOURCE_FUND'&&['sync','fund'].includes(p.command))?[p]:[];}catch{return [];}});
 const sourcePrimary=sourcePackets.find(p=>p.phase!=='LOCK_RELEASE')??sourcePackets[0];
 if(sourcePrimary)return {version:1,status:'UNKNOWN',sequence:action.sequence,stage:action.stage,
  phase:'G5_SOURCE_'+sourcePrimary.phase,exceptionClass:'Unknown',code:sourcePrimary.code,frames:[],sourceActor:sourcePrimary,
  ...(sourcePackets.some(p=>p!==sourcePrimary&&p.phase==='LOCK_RELEASE')?{cleanup:sourcePackets.filter(p=>p!==sourcePrimary&&p.phase==='LOCK_RELEASE').slice(0,3).map(p=>({phase:'G5_SOURCE_LOCK_RELEASE',exceptionClass:'Unknown',code:p.code,frames:[]}))}:{}),exitCode,signal};
 const signerPacket=action.sequence%2===1&&action.stage==='DISPATCH'&&!sourcePackets.length
  ?lines.flatMap((line,position)=>{try{const p=signerInvokePacket(JSON.parse(line));return p&&['authorize','prepare'].includes(p.diagnostic.command)&&['RESERVE','PAY'].includes(p.diagnostic.phase)
   &&(bodyIndex<0||position<bodyIndex)&&!packets.some(q=>q.position<position)?[{...p,position}]:[];}catch{return [];}})[0]:undefined;
 if(signerPacket){const signer=signerPacket.diagnostic;return {version:1,status:'UNKNOWN',sequence:action.sequence,stage:action.stage,phase:'BASE_SIGNER_'+(signer.python?.stage??'TRANSPORT'),exceptionClass:'Unknown',code:signer.python?.code??signer.code,frames:[],signer,exitCode,signal};}
 const initialization=packets.find(p=>p.status==='G5_REVERSE_INITIALIZATION_FAILED');
 const bodyPrimary=!initialization&&bodyIndex>=0&&(!packets.length||bodyIndex<packets[0].position);
 const primary=initialization??(bodyPrimary?undefined:packets[0]);
 const cleanup=packets.filter(p=>p!==primary&&p.status==='G5_REVERSE_CLEANUP_FAILED').slice(0,3).map(({status,position,...d})=>d);
 return {version:1,status:'UNKNOWN',sequence:action.sequence,stage:action.stage,
  ...(primary?{phase:primary.phase,exceptionClass:primary.exceptionClass,code:primary.code,...(primary.sqlState?{sqlState:primary.sqlState}:{}),frames:primary.frames}:bodyPrimary?{phase:'OPERATOR_STEP',exceptionClass:'Unknown',code:'REVERSE_OPERATOR_BODY_FAILED',frames:[]}:{phase:code==='REVERSE_OPERATOR_PAUSE_FAILED'?'CLEANUP':'INITIALIZATION_OR_UNHANDLED',exceptionClass,code:code??'CHILD_COMMAND_FAILED',...(state&&sqlStates.includes(state)?{sqlState:state}:{}),frames}),
  ...(cleanup.length?{cleanup}:{}),exitCode,signal};
}
