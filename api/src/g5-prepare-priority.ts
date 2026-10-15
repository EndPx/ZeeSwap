/** A known observer wait can follow durable signing but precede SQL import.
 * Keep that exact order ahead of new admission/preparation until its original
 * raw is durably imported and broadcast. This never recovers an unknown step.
 */
export type G5PreparePriorityStage='DISPATCH'|'PREPARE_COMMIT'|'BROADCAST_COMMIT'|'PREPARE_SETTLE'|'BROADCAST_SETTLE';
export interface G5PreparePriority {sequence:number;stage:G5PreparePriorityStage;}
const preparing=new Set(['DISPATCH','PREPARE_COMMIT','PREPARE_SETTLE']);
export function requireG5PreparePriorityShape(priority:G5PreparePriority|undefined){
 if(priority!==undefined&&(!priority||!Number.isSafeInteger(priority.sequence)||priority.sequence<1||priority.sequence>20||!['DISPATCH','PREPARE_COMMIT','BROADCAST_COMMIT','PREPARE_SETTLE','BROADCAST_SETTLE'].includes(priority.stage)))throw Error('G5_PREPARE_PRIORITY_INVALID');
}
export function nextG5PreparePriority(previous:G5PreparePriority|undefined,before:{sequence:number;stage:string},status:string,after:{sequence:number;stage:string}):G5PreparePriority|undefined{
 if(previous&&previous.sequence!==before.sequence)throw Error('G5_PREPARE_PRIORITY_DIFFERENT_ORDER');
 if(status==='OBSERVER_WAIT'&&preparing.has(before.stage))return {sequence:before.sequence,stage:before.stage as G5PreparePriorityStage};
 if(!previous)return undefined;
 if(before.stage==='PREPARE_COMMIT'&&status==='COMMIT_SIGNED_DURABLY'&&after.stage==='BROADCAST_COMMIT')return {sequence:before.sequence,stage:'BROADCAST_COMMIT'};
 if(before.stage==='PREPARE_SETTLE'&&status==='SETTLE_SIGNED_DURABLY'&&after.stage==='BROADCAST_SETTLE')return {sequence:before.sequence,stage:'BROADCAST_SETTLE'};
 if(before.stage==='DISPATCH'&&['AWAITING_BASE_FINALITY','RESERVATION_FINALIZED','SETTLED'].includes(status))return;
 if(before.stage==='BROADCAST_COMMIT'&&['AWAITING_BASE_FINALITY','COMMIT_FINALIZED','ALREADY_FINALIZED'].includes(status))return;
 if(before.stage==='BROADCAST_SETTLE'&&['AWAITING_BASE_FINALITY','SETTLED','ALREADY_FINALIZED'].includes(status))return;
 return previous;
}
export function selectG5PreparePriority<T extends {sequence:number;stage:string}>(slots:T[],priority:G5PreparePriority|undefined):T|undefined{
 requireG5PreparePriorityShape(priority);if(!priority)return;const selected=slots.find(o=>o.sequence===priority.sequence&&o.stage===priority.stage);if(!selected)throw Error('G5_PREPARE_PRIORITY_PHASE_CHANGED');return selected;
}
