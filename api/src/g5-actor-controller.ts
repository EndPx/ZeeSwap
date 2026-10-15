/** Bounded private orchestration policy. IO belongs to the operator harness.
 * Funding is explicitly separate from replayable observation; uncertainty never
 * advances the phase or invokes another funding attempt. */
export type G5ActorPhase = 'SOURCE_SYNC'|'QUOTE'|'SOURCE_FUND'|'OBSERVE'|'DISPATCH'|'VERIFY'|'BARRIER'|'DONE';
export interface G5ActorState {version:1;sequence:number;phase:G5ActorPhase;incident:boolean;fundingIntent:boolean;verified:number[];barriers:number[];}
export interface G5ActorResult {status:'DONE'|'WAIT'|'UNKNOWN'|'INCIDENT';fundingIntent?:boolean;}
export function nextG5ActorPhase(state:G5ActorState,result:G5ActorResult):G5ActorState{
 if(state.version!==1||!Number.isInteger(state.sequence)||state.sequence<1||state.sequence>20||state.incident)throw Error('G5_ACTOR_FROZEN_OR_INVALID');
 if(state.verified.some((s,i)=>s!==i+1)||state.barriers.some(s=>![5,10,15,20].includes(s)))throw Error('G5_ACTOR_HISTORY_INVALID');
 if(state.phase==='SOURCE_FUND'&&state.fundingIntent)throw Error('G5_ACTOR_RECOVER_ORIGINAL_FUNDING_ONLY');
 if(result.status==='UNKNOWN'||result.status==='INCIDENT')return {...state,incident:true,fundingIntent:state.fundingIntent||!!result.fundingIntent};
 if(result.status==='WAIT')return {...state,fundingIntent:state.fundingIntent||!!result.fundingIntent};
 const forward=state.sequence%2===1;
 switch(state.phase){
  case 'SOURCE_SYNC':if(!forward)throw Error('G5_ACTOR_REVERSE_HAS_NO_SOURCE_SYNC');return {...state,phase:'QUOTE'};
  case 'QUOTE':return {...state,phase:'SOURCE_FUND'};
  case 'SOURCE_FUND':return {...state,phase:'OBSERVE',fundingIntent:true};
  case 'OBSERVE':return {...state,phase:'DISPATCH'};
  case 'DISPATCH':return {...state,phase:'VERIFY'};
  case 'VERIFY':{
   if(state.verified.length!==state.sequence-1)throw Error('G5_ACTOR_SEQUENCE_NOT_VERIFIED');
   const verified=[...state.verified,state.sequence];
   if(state.sequence%5===0)return {...state,verified,phase:'BARRIER'};
   return {...state,verified,sequence:state.sequence+1,phase:(state.sequence+1)%2===1?'SOURCE_SYNC':'QUOTE',fundingIntent:false};
  }
  case 'BARRIER':{
   if(state.sequence%5!==0||state.verified.length!==state.sequence)throw Error('G5_ACTOR_PHYSICAL_BARRIER_REQUIRED');
   const barriers=[...state.barriers,state.sequence];
   if(state.sequence===20)return {...state,barriers,phase:'DONE'};
   return {...state,barriers,sequence:state.sequence+1,phase:(state.sequence+1)%2===1?'SOURCE_SYNC':'QUOTE',fundingIntent:false};
  }
  case 'DONE':return state;
 }
}
export async function runG5ActorBounded(state:G5ActorState,limits:{maxSteps:number;maxMilliseconds:number},io:{
 now():number;save(state:G5ActorState):Promise<void>;step(state:Readonly<G5ActorState>):Promise<G5ActorResult>;
}){
 if(!Number.isInteger(limits.maxSteps)||limits.maxSteps<1||limits.maxSteps>100||!Number.isInteger(limits.maxMilliseconds)||limits.maxMilliseconds<1||limits.maxMilliseconds>60000)throw Error('G5_ACTOR_BOUNDED_LIMITS_REQUIRED');
 const deadline=io.now()+limits.maxMilliseconds;let steps=0;
 while(steps<limits.maxSteps&&io.now()<deadline&&state.phase!=='DONE'&&!state.incident){
  // Persist a funding latch BEFORE delegating to any broadcast-capable actor.
  // On crash, only manual recovery of the original wallet/journal is allowed.
  if(state.phase==='SOURCE_FUND'){
   if(state.fundingIntent)throw Error('G5_ACTOR_RECOVER_ORIGINAL_FUNDING_ONLY');
   await io.save({...state,fundingIntent:true});
  }
  let result:G5ActorResult;
  try{result=await io.step(state);}catch{
   state={...state,incident:true,fundingIntent:state.fundingIntent||state.phase==='SOURCE_FUND'};
   await io.save(state);break;
  }
  if(state.phase==='SOURCE_FUND')result={...result,fundingIntent:true};
  state=nextG5ActorPhase(state,result);await io.save(state);steps++;
  if(result.status!=='DONE')break;
 }
 return {state,counts:{verified:state.verified.length,barriers:state.barriers.length,steps},status:state.incident?'INCIDENT':state.phase==='DONE'?'DONE':'BOUNDED_STOP'};
}
