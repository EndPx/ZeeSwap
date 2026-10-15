const phases=['MAIN_CONFIG','CONFIG_READ','LOCK_ACQUIRE','LOCK_RELEASE','WALLET_KIND','VIEW_KEY','WALLET_IDENTITY','SDK_NOTES','SCAN_STATUS','SCAN_COMPLETE','COINS','PENDING_CALCULATIONS','ZERO_CHANGE_PROOF','CAPITAL_SELECTION','CAPITAL_VALIDATION','PROVIDER_PROOF','PARTITION_RECHECK','PROOF_WRITE'];
const codes=['SDK_PROCESS_FAILED','SDK_TIMEOUT','JSON_INVALID','FILE_MISSING','FILE_PERMISSION','CAPTURE_REFUSED'];
export function physicalCapturePacket(value:unknown){
 const v=value as any;
 if(!v||typeof v!=='object'||Array.isArray(v)||!['code,phase,status,version','code,phase,status,version,wallet'].includes(Object.keys(v).sort().join(','))
  ||v.version!==1||v.status!=='G5_PHYSICAL_CAPTURE_DIAGNOSTIC'||!phases.includes(v.phase)||!codes.includes(v.code)
  ||!(v.wallet===undefined||['deposit','fee'].includes(v.wallet)||Number.isSafeInteger(v.wallet)&&v.wallet>=2&&v.wallet<=20&&v.wallet%2===0))return undefined;
 return {version:1 as const,status:'G5_PHYSICAL_CAPTURE_DIAGNOSTIC' as const,phase:v.phase as string,code:v.code as string,...(v.wallet!==undefined?{wallet:v.wallet as string|number}:{})};
}
export function physicalCaptureDiagnostic(value:unknown){
 const v=value as any,primary=physicalCapturePacket(v?.primary);
 if(!primary||!Array.isArray(v?.secondary))return undefined;
 return {primary,secondary:v.secondary.map(physicalCapturePacket).filter((p:ReturnType<typeof physicalCapturePacket>)=>p!==undefined).slice(0,3)};
}
export function parsePhysicalCaptureDiagnostics(stderr:string){
 const packets=stderr.split(/\r?\n/).flatMap(line=>{try{const p=physicalCapturePacket(JSON.parse(line));return p?[p]:[];}catch{return [];}});
 if(!packets.length)return undefined;
 const primary=packets.find(p=>p.phase!=='LOCK_RELEASE')??packets[0];
 return {primary,secondary:packets.filter(p=>p!==primary).slice(0,3)};
}
