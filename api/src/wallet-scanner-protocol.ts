import {ObserverWaitError} from './observer-frontiers.ts';

const PHASES=['CONFIG_READ','REQUEST_READ','SDK_COMMAND','VALIDATE_ADDRESS','LOCK_ACQUIRE','WALLET_KIND','ALLOCATE_ADDRESS','ALLOCATE_VALIDATE',
 'SDK_NOTES','SDK_SCAN_STATUS','SDK_VIEWING_KEY','GRPC_IMPORT','LIGHTD_INFO','SCAN_TIP','RECONCILIATION_BLOCK','RECEIPT_BLOCK','RECEIPT_TRANSACTION','DECRYPT_OUTPUT','SNAPSHOT_EMIT','LOCK_RELEASE',
 'ADAPTER_SPAWN','ADAPTER_TIMEOUT','ADAPTER_OUTPUT','ADAPTER_STDIN','ADAPTER_EXIT','ADAPTER_PROTOCOL'];
const RPC_PHASES=['LIGHTD_INFO','SCAN_TIP','RECONCILIATION_BLOCK','RECEIPT_BLOCK','RECEIPT_TRANSACTION'];
const CODES=['GRPC_UNAVAILABLE','GRPC_DEADLINE_EXCEEDED','READ_ONLY_SCANNER_FAILED_RECONCILE','GRPC_OTHER_RECONCILE',
 'SDK_TIMEOUT_RECONCILE','SDK_START_FAILED_RECONCILE','SDK_PROCESS_FAILED_RECONCILE','SDK_OUTPUT_INVALID_RECONCILE',
 'SCANNER_LOCK_EXISTS_RECONCILE','SCANNER_LOCK_RELEASE_FAILED_RECONCILE',
 'WALLET_ADAPTER_SPAWN_RECONCILE','WALLET_ADAPTER_TIMEOUT_RECONCILE','WALLET_ADAPTER_OUTPUT_RECONCILE','WALLET_ADAPTER_STDIN_RECONCILE','WALLET_CHILD_EXIT_RECONCILE','WALLET_PROTOCOL_MISMATCH_RECONCILE'];
export interface WalletScannerDiagnostic {
 version:1;status:'WALLET_READ_ONLY_WAIT'|'WALLET_READ_ONLY_ERROR';command:'snapshot'|'allocate'|'validate'|'UNKNOWN';
 phase:string;code:string;uncertain:boolean;lockReleased:boolean;processCompleted:boolean;
}
/** Exact static envelope only. No stderr text, path, memo, address, raw bytes,
 * provider URL or arbitrary error field is accepted as diagnostic authority.
 */
export function walletScannerDiagnostic(value:unknown):WalletScannerDiagnostic|undefined{
 const v=value as any,keys=['version','status','command','phase','code','uncertain','lockReleased','processCompleted'];
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||Object.keys(v).some(k=>!keys.includes(k))
  ||v.version!==1||!['WALLET_READ_ONLY_WAIT','WALLET_READ_ONLY_ERROR'].includes(v.status)||!['snapshot','allocate','validate','UNKNOWN'].includes(v.command)
  ||!PHASES.includes(v.phase)||!CODES.includes(v.code)||['uncertain','lockReleased','processCompleted'].some(k=>typeof v[k]!=='boolean'))return undefined;
 if(v.status==='WALLET_READ_ONLY_WAIT'&&(v.command!=='snapshot'||!RPC_PHASES.includes(v.phase)||!['GRPC_UNAVAILABLE','GRPC_DEADLINE_EXCEEDED'].includes(v.code)
  ||v.uncertain||!v.lockReleased||!v.processCompleted))return undefined;
 return {version:1,status:v.status,command:v.command,phase:v.phase,code:v.code,uncertain:v.uncertain,lockReleased:v.lockReleased,processCompleted:v.processCompleted};
}
export function walletAdapterFailure(command:unknown,phase:string,code:string,completed=false){
 const error=new Error('WALLET_UNAVAILABLE');
 const diagnostic:WalletScannerDiagnostic={version:1,status:'WALLET_READ_ONLY_ERROR',command:['snapshot','allocate','validate'].includes(command as string)?command as WalletScannerDiagnostic['command']:'UNKNOWN',
  phase,code,uncertain:!completed,lockReleased:false,processCompleted:completed};
 Object.assign(error,{scannerDiagnostic:walletScannerDiagnostic(diagnostic)});return error;
}
export function walletChildFailure(stdout:string,command:unknown,code:number|null,signal:NodeJS.Signals|null){
 let packet:WalletScannerDiagnostic|undefined;
 try{packet=walletScannerDiagnostic(JSON.parse(stdout));}catch{}
 if(!signal&&code===75&&command==='snapshot'&&packet?.status==='WALLET_READ_ONLY_WAIT'){
  const error=new ObserverWaitError({event:'wallet-read-only',source:'source-viewing-wallet',status:'WAIT',phase:packet.phase,code:packet.code});
  Object.assign(error,{scannerDiagnostic:packet});return error;
 }
 if(!signal&&code===1&&packet?.status==='WALLET_READ_ONLY_ERROR'&&packet.command===command&&packet.processCompleted){
  const error=new Error('WALLET_UNAVAILABLE');Object.assign(error,{scannerDiagnostic:packet});return error;
 }
 return walletAdapterFailure(command,'ADAPTER_EXIT','WALLET_CHILD_EXIT_RECONCILE',!signal&&code!==null);
}
