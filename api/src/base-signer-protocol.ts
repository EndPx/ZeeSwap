import {createHash} from 'node:crypto';
const stages=["ARGUMENTS", "AUTH_READ", "AUTH_SAVE", "AUTH_SIGN", "CALLDATA", "CHAIN_ID_READ", "CONFIG_READ", "INPUT_READ", "JOURNAL_ROOT", "LOCK_ACQUIRE", "LOCK_RELEASE", "MKTX", "NONCE_READ", "NONCE_SCAN", "OUTPUT", "PAY_CANONICAL_READ", "PAY_HEAD_READ", "PAY_RECORD_READ", "PAY_STATE_READ", "RAW_HASH", "REQUEST_VALIDATE", "SETTLEMENT_CODE_HASH", "SETTLEMENT_CODE_READ", "TOKEN_CODE_HASH", "TOKEN_CODE_READ", "TX_INTENT_SAVE", "TX_READ", "TX_SAVE", "TYPED_SAVE", "WALLET_ADDRESS","PAY_RESERVE_JOURNAL","PAY_RESERVE_TX_READ","PAY_RESERVE_RECEIPT_READ","PAY_RESERVE_ANCHOR_READ","PAY_LATEST_HEAD_READ","PAY_LATEST_STATE_READ","PAY_LATEST_RECORD_READ","PAY_RESERVE_AHEAD"];
const reads=["CHAIN_ID_READ", "PAY_CANONICAL_READ", "PAY_HEAD_READ", "PAY_RECORD_READ", "PAY_STATE_READ", "SETTLEMENT_CODE_READ", "TOKEN_CODE_READ","PAY_RESERVE_TX_READ","PAY_RESERVE_RECEIPT_READ","PAY_RESERVE_ANCHOR_READ","PAY_LATEST_HEAD_READ","PAY_LATEST_STATE_READ","PAY_LATEST_RECORD_READ"];
const codes=["AMOUNT_OUT_OF_BOUNDS", "ARGUMENTS_INVALID", "ASSET_CHANGED", "AUTHORIZATION_CONFLICT", "AUTHORIZATION_EXPIRED", "AUTHORIZATION_LIFETIME_INVALID", "CAST_NONZERO", "CAST_READ_TIMEOUT", "CAST_TIMEOUT_HARD", "DEPLOYMENT_CHANGED", "FILE_MISSING", "FILE_PERMISSION", "FINALIZED_HEADER_CHANGED", "FINALIZED_HEADER_INVALID", "INTEGER_INVALID", "JSON_INVALID", "NETWORK_CHANGED", "NONCE_UNRESOLVED", "RECIPIENT_INVALID", "REQUEST_INVALID", "REQUEST_TOO_LARGE", "RESERVATION_CHANGED", "SIGNATURE_INVALID", "SIGNER_CHANGED", "SIGNER_FAILURE", "TERMS_INVALID", "TRANSACTION_CONFLICT","RESERVE_AHEAD_OF_FINALIZED","ORIGINAL_RESERVE_INVALID"];
const transports=['SIGNER_PROCESS_EXIT','SIGNER_TIMEOUT','SIGNER_SIGNAL','SIGNER_STDIN_FAILED','SIGNER_OUTPUT_LIMIT','SIGNER_STDERR_LIMIT','SIGNER_RESPONSE_INVALID','SIGNER_SPAWN_FAILED','SIGNER_READ_WAIT','SIGNER_FINALITY_WAIT'];
const phases=['RESERVE','PAY','FUNDING','COMMIT','SETTLE','UNKNOWN'];
const signals=['SIGTERM','SIGKILL','SIGINT','SIGPIPE','SIGABRT','SIGSEGV','UNKNOWN_SIGNAL'];
function canonical(value:any):string{if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';}
export interface SignerBinding {command:string;phase:string;requestDigest:string}
export function signerBinding(request:any):SignerBinding{return {command:['authorize','prepare'].includes(request?.command)?request.command:'UNKNOWN',phase:phases.includes(request?.phase)?request.phase:'UNKNOWN',requestDigest:createHash('sha256').update(canonical(request)).digest('hex')};}
function matches(v:any,b:SignerBinding){return v.command===b.command&&v.phase===b.phase&&v.requestDigest===b.requestDigest;}
export function signerPythonDiagnostic(value:unknown,binding:SignerBinding){
 const v=value as any;if(!v||typeof v!=='object'||Array.isArray(v)||!['code,command,phase,requestDigest,stage,status,version','castExit,code,command,phase,requestDigest,stage,status,version'].includes(Object.keys(v).sort().join(','))
 ||v.version!==1||v.status!=='BASE_SIGNER_DIAGNOSTIC'||!matches(v,binding)||!stages.includes(v.stage)||!codes.includes(v.code)
 ||v.stage.startsWith('PAY_')&&(v.command!=='prepare'||v.phase!=='PAY')
 ||v.castExit!==undefined&&(!Number.isSafeInteger(v.castExit)||v.castExit< -255||v.castExit>255))return undefined;
 return {version:1,status:'BASE_SIGNER_DIAGNOSTIC',...binding,stage:v.stage as string,code:v.code as string,...(v.castExit!==undefined?{castExit:v.castExit as number}:{})};
}
export function signerReadWait(value:unknown,b:SignerBinding){
 const v=value as any;return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')==='code,command,lockHeld,noNewMutation,nonceStarted,phase,readChildCompleted,requestDigest,signingStarted,stage,status,version'
 &&v.version===1&&matches(v,b)&&((v.status==='BASE_SIGNER_READ_WAIT'&&['RESERVE','PAY'].includes(v.phase)&&(v.command!=='authorize'||v.phase==='RESERVE')&&reads.includes(v.stage)&&v.code==='CAST_READ_TIMEOUT')||(v.status==='BASE_SIGNER_FINALITY_WAIT'&&v.command==='prepare'&&v.phase==='PAY'&&v.stage==='PAY_RESERVE_AHEAD'&&v.code==='RESERVE_AHEAD_OF_FINALIZED'))
 &&v.noNewMutation===true&&v.signingStarted===false&&v.nonceStarted===false&&v.readChildCompleted===true&&v.lockHeld===false;
}
export function parseSignerPackets(stderr:string,b:SignerBinding){const packets=stderr.split(/\r?\n/).flatMap(line=>{try{const p=signerPythonDiagnostic(JSON.parse(line),b);return p?[p]:[];}catch{return [];}});const primary=packets.find(p=>p.stage!=='LOCK_RELEASE')??packets[0];return {primary,cleanup:packets.filter(p=>p!==primary&&p.stage==='LOCK_RELEASE').slice(0,3)};}
export function signerFailureDiagnostic(value:unknown){
 const v=value as any;if(!v||v.version!==1||!['authorize','prepare','UNKNOWN'].includes(v.command)||!phases.includes(v.phase)||typeof v.requestDigest!=='string'||!/^[0-9a-f]{64}$/.test(v.requestDigest)||!transports.includes(v.code))return undefined;
 const b={command:v.command as string,phase:v.phase as string,requestDigest:v.requestDigest as string};
 const python=signerPythonDiagnostic(v.python,b),cleanup=Array.isArray(v.cleanup)?v.cleanup.map((p:any)=>signerPythonDiagnostic(p,b)).filter((p:any)=>p?.stage==='LOCK_RELEASE').slice(0,3):[];
 return {version:1,...b,code:v.code as string,exitCode:Number.isSafeInteger(v.exitCode)&&v.exitCode>=-255&&v.exitCode<=255?v.exitCode:null,signal:v.signal===null?null:signals.includes(v.signal)?v.signal:'UNKNOWN_SIGNAL',...(python?{python}:{}),...(cleanup.length?{cleanup}:{})};
}
export function validSignerReply(value:any,request:any){
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 if(request?.command==='authorize')return Object.keys(value).join(',')==='signature'&&typeof value.signature==='string'&&/^0x[0-9a-fA-F]{130}$/.test(value.signature);
 return request?.command==='prepare'&&Object.keys(value).sort().join(',')==='hash,maxCost,nonce,raw'&&typeof value.raw==='string'&&/^0x(?:[0-9a-fA-F]{2})+$/.test(value.raw)&&typeof value.hash==='string'&&/^0x[0-9a-fA-F]{64}$/.test(value.hash)&&Number.isSafeInteger(value.nonce)&&value.nonce>=0&&typeof value.maxCost==='string'&&/^[1-9][0-9]{0,13}$/.test(value.maxCost)&&BigInt(value.maxCost)<=10000000000000n;
}

/** A completed WAIT needs one matching primary and no contradictory/unknown packet. */
export function signerWaitEvidence(stderr:string,result:any,b:SignerBinding){
 const lines=stderr.split(/\r?\n/).filter(line=>line.trim());
 if(lines.length!==1)return false;
 try{const p=signerPythonDiagnostic(JSON.parse(lines[0]),b);return !!p&&p.stage===result.stage&&p.code===result.code&&p.castExit===undefined;}catch{return false;}
}
export function signerInvokePacket(value:unknown){
 const v=value as any;if(!v||Object.keys(v).sort().join(',')!=='diagnostic,status,version'||v.version!==1||v.status!=='BASE_SIGNER_INVOKE_FAILED')return undefined;
 const d=signerFailureDiagnostic(v.diagnostic);
 if(!d||canonical(v.diagnostic)!==canonical(d))return undefined;
 return {version:1,status:'BASE_SIGNER_INVOKE_FAILED',diagnostic:d};
}
