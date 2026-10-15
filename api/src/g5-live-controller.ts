/** Durable orchestration of the existing, independently fenced G5 operators.
 * The controller is deliberately a single writer. It never retries an unknown
 * effect; original wallet/raw journal reconciliation is an operator action. */
export const G5_LIVE_STAGES = ['SYNC','START','SOURCE_FUND','REVERSE_QUOTE','FUNDING_CALL','PAYER_APPROVAL','PAYER_PREPARE','PAYER_BROADCAST','OBSERVE_SOURCE','DISPATCH','PREPARE_COMMIT','BROADCAST_COMMIT','OBSERVE_COMMIT','APPROVE_WALLET','PREPARE_ZCASH','BROADCAST_ZCASH','OBSERVE_ZCASH','PREPARE_SETTLE','BROADCAST_SETTLE','OBSERVE_SETTLE','VERIFY','DONE'] as const;
export type G5LiveStage=typeof G5_LIVE_STAGES[number];
export interface G5LiveSlot {sequence:number;stage:G5LiveStage;}
export interface G5LiveSnapshot {status:'G5_CONTROLLER_SNAPSHOT';runId:string;incident:boolean;reconciliationRequired:boolean;closed:boolean;availableBaseFeeWei:string;operatorRawPending:boolean;operatorRawSequence?:number;barriers:number[];orders:{sequence:number;state:string;receiptVerified:boolean}[];}
export interface G5LiveState {version:2;runId:string;binding:string;slots:G5LiveSlot[];barriers:number[];cursor:number;releasedHolds:string[];incident:boolean;inflight?:{sequence:number;stage:G5LiveStage|'BARRIER'|'CLOSE'};closed:boolean;}
export interface G5LiveResult {status:string;}
const next:Partial<Record<G5LiveStage,G5LiveStage>>={SYNC:'START',START:'SOURCE_FUND',SOURCE_FUND:'OBSERVE_SOURCE',REVERSE_QUOTE:'FUNDING_CALL',FUNDING_CALL:'PAYER_APPROVAL',PAYER_APPROVAL:'PAYER_PREPARE',PAYER_PREPARE:'PAYER_BROADCAST',PAYER_BROADCAST:'OBSERVE_SOURCE',PREPARE_COMMIT:'BROADCAST_COMMIT',BROADCAST_COMMIT:'OBSERVE_COMMIT',OBSERVE_COMMIT:'APPROVE_WALLET',APPROVE_WALLET:'PREPARE_ZCASH',PREPARE_ZCASH:'BROADCAST_ZCASH',BROADCAST_ZCASH:'OBSERVE_ZCASH',OBSERVE_ZCASH:'PREPARE_SETTLE',PREPARE_SETTLE:'BROADCAST_SETTLE',BROADCAST_SETTLE:'OBSERVE_SETTLE',OBSERVE_SETTLE:'VERIFY',VERIFY:'DONE'};
const done:Partial<Record<G5LiveStage,string[]>>={SYNC:['SYNCED'],START:['AWAITING_SEPARATE_ONCE_ONLY_SOURCE_FUNDING','G5_REVERSE_SLOT_READY'],SOURCE_FUND:['BROADCAST'],REVERSE_QUOTE:['AWAITING_FUNDS'],FUNDING_CALL:['FUNDING_CALL_SAVED_FOR_SEPARATE_PAYER'],PAYER_APPROVAL:['PAYER_APPROVAL_SAVED'],PAYER_PREPARE:['PREPARED'],PAYER_BROADCAST:['ORIGINAL_PAYER_BROADCAST_KNOWN'],PREPARE_COMMIT:['COMMIT_SIGNED_DURABLY'],BROADCAST_COMMIT:['AWAITING_BASE_FINALITY','COMMIT_FINALIZED'],OBSERVE_COMMIT:['COMMIT_FINALIZED'],APPROVE_WALLET:['IMMUTABLE_PRIVATE_WALLET_APPROVAL_SAVED'],PREPARE_ZCASH:['ZCASH_SIGNED_DURABLY'],BROADCAST_ZCASH:['AWAITING_ZCASH_FINALITY','ZCASH_ALREADY_FINALIZED'],OBSERVE_ZCASH:['ZCASH_DELIVERY_FINALIZED'],PREPARE_SETTLE:['SETTLE_SIGNED_DURABLY'],BROADCAST_SETTLE:['AWAITING_BASE_FINALITY','SETTLED'],OBSERVE_SETTLE:['SETTLED'],VERIFY:['G5_ORDER_RECEIPTS_VERIFIED']};
const waits=new Set(['OBSERVER_WAIT','AWAITING_BASE_FINALITY','AWAITING_ZCASH_FINALITY','AWAITING_FUNDS','AWAITING_CONFIRMATIONS','CONFIRMING','NO_ELIGIBLE_JOB','READY','RESERVATION_FINALIZED']);
export function initialG5LiveState(runId:string,binding:string,snapshot:G5LiveSnapshot):G5LiveState{
 if(snapshot.runId!==runId||snapshot.incident||snapshot.reconciliationRequired||snapshot.closed||snapshot.orders.length!==2||snapshot.orders.some((o,i)=>o.sequence!==i+1||o.state!=='SETTLED'||!o.receiptVerified)||snapshot.barriers.length)throw Error('G5_LIVE_EXACT_FIRST_CIRCLE_REQUIRED');
 return {version:2,runId,binding,slots:[{sequence:1,stage:'DONE'},{sequence:2,stage:'DONE'}],barriers:[],cursor:0,releasedHolds:[],incident:false,closed:false};
}
export function validateG5LiveState(s:G5LiveState,runId:string,binding:string){
 if(s.version!==2||s.runId!==runId||s.binding!==binding||typeof s.incident!=='boolean'||typeof s.closed!=='boolean'||!Number.isSafeInteger(s.cursor)||s.cursor<0||!Array.isArray(s.releasedHolds)||s.slots.length<2||s.slots.length>20||s.slots.some((o,i)=>o.sequence!==i+1||!G5_LIVE_STAGES.includes(o.stage))||s.slots.slice(0,2).some(o=>o.stage!=='DONE')||s.barriers.some((n,i)=>n!==(i+1)*5)||s.barriers.length>4||s.slots.length>s.barriers.length*5+5)throw Error('G5_LIVE_STATE_INVALID');
 if(s.inflight||s.incident)throw Error('G5_LIVE_ORIGINAL_EFFECT_RECONCILIATION_REQUIRED');
}
export function advanceG5LiveSlot(slot:G5LiveSlot,result:G5LiveResult):G5LiveSlot{
 if(result.status==='OBSERVER_WAIT'&&slot.stage==='START'&&slot.sequence%2)return {...slot,stage:'SYNC'};
 if(result.status==='OBSERVER_WAIT'&&slot.stage!=='SOURCE_FUND'&&!slot.stage.startsWith('PAYER_'))return slot;
 if(slot.stage==='OBSERVE_SOURCE'){
  if(result.status==='READY')return {...slot,stage:slot.sequence%2?'DISPATCH':'PREPARE_COMMIT'};
  if(result.status==='SETTLED'&&slot.sequence%2)return {...slot,stage:'VERIFY'};
 }else if(slot.stage==='DISPATCH'){
  if(result.status==='SETTLED')return {...slot,stage:'VERIFY'};
 }else if(done[slot.stage]?.includes(result.status))return {...slot,stage:slot.stage==='START'&&slot.sequence%2===0?'REVERSE_QUOTE':next[slot.stage]!};
 // Only the phase's explicit finality states are soft waiting outcomes.
 const pending=slot.stage==='OBSERVE_SOURCE'?['AWAITING_FUNDS','AWAITING_CONFIRMATIONS','CONFIRMING']:slot.stage==='DISPATCH'?['AWAITING_BASE_FINALITY','NO_ELIGIBLE_JOB','RESERVATION_FINALIZED']:slot.stage==='OBSERVE_COMMIT'||slot.stage==='APPROVE_WALLET'||slot.stage==='OBSERVE_SETTLE'?['AWAITING_BASE_FINALITY']:slot.stage==='OBSERVE_ZCASH'?['AWAITING_ZCASH_FINALITY']:[];
 if(waits.has(result.status)&&pending.includes(result.status))return slot;
 throw Error('G5_LIVE_UNEXPECTED_STAGE_STATUS');
}
/** The accepted quote remains immutable. Refresh only the source actor's
 * read-only snapshot immediately before its once-only fund command; that actor
 * still enforces the original cutoff and eight-block margin before sending.
 */
export async function syncAndFundG5Source(io:{sync():Promise<G5LiveResult>;fund():Promise<G5LiveResult>}){
 const synced=await io.sync();if(synced.status!=='SYNCED')throw Error('G5_LIVE_FRESH_SOURCE_SYNC_REQUIRED');
 return io.fund();
}
export async function runG5LiveBounded(state:G5LiveState,options:{maxSteps:number;maxMilliseconds:number;holds?:string[];maxActive?:number;admissionThrough?:number},io:{now():number;snapshot():Promise<G5LiveSnapshot>;save(s:G5LiveState):Promise<void>;execute(sequence:number,stage:G5LiveStage|'BARRIER'|'CLOSE'):Promise<G5LiveResult>;progress?(p:{sequence:number;stage:string;status:string}):void;}){
 if(!Number.isSafeInteger(options.maxSteps)||options.maxSteps<1||options.maxSteps>200||!Number.isSafeInteger(options.maxMilliseconds)||options.maxMilliseconds<1||options.maxMilliseconds>60000)throw Error('G5_LIVE_BOUNDED_LIMIT_REQUIRED');
 if(state.incident||state.inflight)throw Error('G5_LIVE_ORIGINAL_EFFECT_RECONCILIATION_REQUIRED');
 const deadline=io.now()+options.maxMilliseconds;let steps=0,waiting=0;
 while(steps<options.maxSteps&&io.now()<deadline&&!state.closed){
  const snap=await io.snapshot();
  if(snap.status!=='G5_CONTROLLER_SNAPSHOT'||snap.runId!==state.runId||snap.incident||snap.reconciliationRequired||JSON.stringify(snap.barriers)!==JSON.stringify(state.barriers)||snap.closed!==state.closed)throw Error('G5_LIVE_CORE_CONTRADICTION');
  for(const slot of state.slots)if(slot.stage==='DONE'&&!snap.orders.some(o=>o.sequence===slot.sequence&&o.state==='SETTLED'&&o.receiptVerified))throw Error('G5_LIVE_COMPLETED_RECEIPT_CONTRADICTION');
  let sequence:number,stage:G5LiveStage|'BARRIER'|'CLOSE';
  const boundary=(state.barriers.length+1)*5;
  if(state.slots.length===20&&state.barriers.length===4){sequence=20;stage='CLOSE';}
  else if(state.slots.length===boundary&&state.slots.every(o=>o.stage==='DONE')){sequence=boundary;stage='BARRIER';}
  else{
   const active=state.slots.filter(o=>o.stage!=='DONE');
   // The full 50e12 cap is preserved. Avoid a known insufficient quote that
   // would trip the core's incident guard, including in the last batch.
   const admissionCap=state.releasedHolds.includes('ADMISSION_THROUGH_RELEASED')?20:(options.admissionThrough??20);
   const maxActive=state.releasedHolds.includes('MAX_ACTIVE_FOUR_RELEASED')?4:(options.maxActive??1);if(!Number.isInteger(maxActive)||maxActive<1||maxActive>4)throw Error('G5_LIVE_MAX_ACTIVE');
   const admit=state.slots.length<Math.min(boundary,admissionCap)&&active.length<maxActive&&/^\d+$/.test(snap.availableBaseFeeWei)&&BigInt(snap.availableBaseFeeWei)>=50000000000000n;
   // Complete a fresh source sync -> quote -> fund chain without interleaving
   // another admission; the source helper independently rechecks its window.
   const admission=active.find(o=>['SYNC','START','SOURCE_FUND','REVERSE_QUOTE','FUNDING_CALL','PAYER_APPROVAL','PAYER_PREPARE','PAYER_BROADCAST'].includes(o.stage));
   let selected=admission;
   if(!selected&&admit){selected={sequence:state.slots.length+1,stage:(state.slots.length+1)%2?'SYNC':'START'};state.slots.push(selected);await io.save(state);}
   if(!selected){
    const ready=active.filter(o=>!options.holds?.includes(`${o.sequence}:${o.stage}`)||state.releasedHolds.includes(`${o.sequence}:${o.stage}`));
    // New operator raw preparation is serialized against every original raw.
    const unblocked=ready.filter(o=>!snap.operatorRawPending||!['DISPATCH','PREPARE_COMMIT','PREPARE_SETTLE'].includes(o.stage)||(o.stage==='DISPATCH'&&snap.operatorRawSequence===o.sequence));
    if(!unblocked.length)break;
    selected=unblocked[state.cursor%unblocked.length];state.cursor++;
   }
   sequence=selected.sequence;stage=selected.stage;
   if(options.holds?.includes(`${sequence}:${stage}`)&&!state.releasedHolds.includes(`${sequence}:${stage}`))break;
   if(stage==='VERIFY'&&!snap.orders.some(o=>o.sequence===sequence&&o.state==='SETTLED'))throw Error('G5_LIVE_VERIFY_TERMINAL_ONLY');
  }
  state.inflight={sequence,stage};await io.save(state);
  try{
   const result=await io.execute(sequence,stage);
   if(stage==='BARRIER'){if(result.status!=='G5_BATCH_VERIFIED')throw Error('G5_LIVE_BARRIER_NOT_VERIFIED');state.barriers.push(sequence);}
   else if(stage==='CLOSE'){if(result.status!=='G5_CLOSED')throw Error('G5_LIVE_CLOSE_NOT_VERIFIED');state.closed=true;}
   else {const slot=state.slots[sequence-1],advanced=advanceG5LiveSlot(slot,result);waiting=advanced===slot?waiting+1:0;state.slots[sequence-1]=advanced;}
   delete state.inflight;await io.save(state);steps++;io.progress?.({sequence,stage,status:result.status});
   if(waiting>=Math.max(1,state.slots.filter(o=>o.stage!=='DONE').length))break;
  }catch{state.incident=true;await io.save(state);return {status:'UNKNOWN_OR_INCIDENT',steps,settledReceipts:state.slots.filter(o=>o.stage==='DONE').length};}
 }
 return {status:state.closed?'G5_CONTROLLER_COMPLETE':'G5_CONTROLLER_BOUNDED_STOP',steps,settledReceipts:state.slots.filter(o=>o.stage==='DONE').length};
}
