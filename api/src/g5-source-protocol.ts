/** Closed Python source-actor protocol. Never infer safety from stderr text. */
const phases=["ARGUMENTS", "AUDIT_CANONICAL", "AUDIT_EXPORT", "AUDIT_WRITE", "BINARY_PIN", "COINS", "CONFIG_READ", "FUNDING_BINDING", "INITIAL_FUNDING_BINDING", "FINAL_FUNDING_BINDING", "FUNDING_READ", "INTENT_WRITE", "LOCK_ACQUIRE", "LOCK_RELEASE", "NETWORK_INFO", "NETWORK_TIP", "NOTES", "PROPOSE", "RECEIVER", "REFUND_RECEIVER", "RESULT_WRITE", "RUN_BINDING", "SCAN_STATUS", "SDK_SYNC", "SEND", "SYNC_INTENT_CHECK", "SYNC_WRITE", "VIEW_KEY", "VIEW_LOCK", "VIEW_NOTES"];
const codes=["G5_SOURCE_AUDIT_LITERAL_SEQUENCE_REQUIRED","G5_SOURCE_ARCHIVED_ATTEMPT_ARTIFACT_REQUIRED","G5_SOURCE_ARGUMENTS_REQUIRED","G5_SOURCE_ABSOLUTE_PRIVATE_PATH", "G5_SOURCE_APPROVED_NOTE_MISMATCH", "G5_SOURCE_AUDIT_CANONICAL_CHANGED", "G5_SOURCE_AUDIT_CUTOFF_NOT_RECONCILED", "G5_SOURCE_AUDIT_LITERAL_SEVENTH_REQUIRED", "G5_SOURCE_AUDIT_ORIGINAL_ARTIFACT_CHANGED", "G5_SOURCE_AUDIT_PENDING_CALCULATION", "G5_SOURCE_AUDIT_PROCESS_ACTIVE", "G5_SOURCE_AUDIT_PROCESS_UNRESOLVED", "G5_SOURCE_AUDIT_VIEW_BINDING", "G5_SOURCE_AUDIT_VIEW_PENDING", "G5_SOURCE_BINARY_PIN", "G5_SOURCE_COMPLETE_SCAN_REQUIRED", "G5_SOURCE_CORE_SLOT_BINDING", "G5_SOURCE_EXACT_FEE", "G5_SOURCE_EXACT_ONE_NOTE", "G5_SOURCE_FIXED_CORE_FUNDING_PATH", "G5_SOURCE_FIXED_INTENT_PATH_REQUIRED", "G5_SOURCE_FIXED_SYNC_PATH_REQUIRED", "G5_SOURCE_FUNDING_BINDING", "G5_SOURCE_MINIMUM_EIGHT_BLOCK_WINDOW", "G5_SOURCE_NETWORK", "G5_SOURCE_NOTE_BINDING", "G5_SOURCE_ORIGINAL_OPERATION_RECOVERY_REQUIRED", "G5_SOURCE_OWNED_LOCK_CHANGED", "G5_SOURCE_PREQUOTE_SYNC_BINDING", "G5_SOURCE_PREQUOTE_SYNC_STALE", "G5_SOURCE_PRIVATE_PATHS_REQUIRED", "G5_SOURCE_RECEIVER", "G5_SOURCE_REFUND_RECIPIENT_NOT_OWNED", "G5_SOURCE_RUN_BINDING", "G5_SOURCE_RUN_FROZEN_OR_CHANGED", "G5_SOURCE_RUN_REFUND_BINDING", "G5_SOURCE_SCAN_STALE", "G5_SOURCE_SEQUENCE", "G5_SOURCE_TRANSPARENT_CAPITAL_REFUSED", "G5_SOURCE_UFVK_BINDING", "G5_SOURCE_UNKNOWN_OUTCOME_RECOVER_ORIGINAL", "G5_SOURCE_WALLET_BINDING", "G5_SOURCE_WALLET_COMMAND_FAILED", "SOURCE_ACTOR_REFUSED", "SOURCE_FILE_MISSING", "SOURCE_FILE_PERMISSION", "SOURCE_JSON_INVALID", "SOURCE_RPC_DEADLINE", "SOURCE_RPC_UNAVAILABLE", "SOURCE_SDK_TIMEOUT"];
const syncPhases=['ARGUMENTS','CONFIG_READ','RUN_BINDING','BINARY_PIN','LOCK_ACQUIRE','SYNC_INTENT_CHECK','SDK_SYNC','VIEW_KEY','REFUND_RECEIVER','SCAN_STATUS','COINS','NOTES','NETWORK_INFO','NETWORK_TIP','SYNC_WRITE','LOCK_RELEASE'];
const fundPhases=['ARGUMENTS','CONFIG_READ','RUN_BINDING','BINARY_PIN','LOCK_ACQUIRE','VIEW_KEY','REFUND_RECEIVER','SCAN_STATUS','COINS','NOTES','NETWORK_INFO','NETWORK_TIP','FUNDING_READ','FUNDING_BINDING','INITIAL_FUNDING_BINDING','FINAL_FUNDING_BINDING','RECEIVER','PROPOSE','INTENT_WRITE','SEND','RESULT_WRITE','LOCK_RELEASE'];
const odd=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=1&&n<=19&&n%2===1;
export function sourceActorDiagnostic(value:unknown){
 const v=value as any;if(!v||typeof v!=='object'||Array.isArray(v)
  ||!['code,command,phase,status,version','code,command,phase,sequence,status,version'].includes(Object.keys(v).sort().join(','))
  ||v.version!==1||v.status!=='G5_SOURCE_ACTOR_DIAGNOSTIC'||!['sync','fund','audit-unfunded','initialization'].includes(v.command)
  ||!phases.includes(v.phase)||!codes.includes(v.code)||v.sequence!==undefined&&!odd(v.sequence)
  ||v.command==='sync'&&!syncPhases.includes(v.phase)||v.command==='fund'&&!fundPhases.includes(v.phase))return undefined;
 return {version:1 as const,status:'G5_SOURCE_ACTOR_DIAGNOSTIC' as const,command:v.command as string,phase:v.phase as string,code:v.code as string,...(v.sequence!==undefined?{sequence:v.sequence as number}:{})};
}
export function sourcePrefundWait(value:unknown,expectedSequence?:number){
 const v=value as any;
 const keys='code,command,intentAbsent,intentCreated,lockReleased,phase,proposalStarted,resultAbsent,sdkActive,sdkCompleted,sequence,status,uncertain,version';
 return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys
  &&v.version===1&&v.status==='SOURCE_PREFUND_WAIT'&&v.command==='sync'&&odd(v.sequence)&&(expectedSequence===undefined||v.sequence===expectedSequence)
  &&['NETWORK_INFO','NETWORK_TIP'].includes(v.phase)&&['SOURCE_RPC_UNAVAILABLE','SOURCE_RPC_DEADLINE'].includes(v.code)
  &&v.sdkCompleted===true&&v.sdkActive===false&&v.uncertain===false&&v.proposalStarted===false&&v.intentCreated===false
  &&v.intentAbsent===true&&v.resultAbsent===true&&v.lockReleased===true;
}
