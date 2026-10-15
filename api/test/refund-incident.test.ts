import test from 'node:test';
import assert from 'node:assert/strict';
import {g5Binding,G5_TARGET} from '../src/g5-run.ts';
import {accessHash} from '../src/private-data.ts';
import {approvalDigest} from '../src/reverse-authority.ts';
import {requireRefundTarget,validateIncidentRefund,requireRefundHeaderSnapshot,INCIDENT_REFUND_MODE} from '../src/refund-incident.ts';
const order='12345678-1234-1234-1234-123456789abc';
function fixture(){
 const config={version:1,runId:'87654321-1234-1234-1234-123456789abc',branchId:G5_TARGET.branchId,baseFeeBudget:'100000000000000',
  forward:{recipient:'fixture:base',refundRecipient:'fixture:shielded'},reverseOrders:Array.from({length:10},(_,i)=>({sequence:(i+1)*2,configFile:`/private/order-${i}.json`}))};
 const run={version:1,runId:config.runId,binding:g5Binding(config),openingEventId:'fixture-opening',incident:true,
  orders:[{sequence:1,direction:'ZCASH_TO_BASE',orderId:order,owner:'fixture-private-owner'}]};
 const approval={version:1,kind:'SOURCE_REFUND_BASE',orderId:order,id:'0x'+'11'.repeat(32),phase:'CANCEL',amount:'100000',cancellationAvailableAt:'0'};
 const state={version:1,orderId:order,owner:run.orders[0].owner,baseApprovedDigest:approvalDigest(approval)};
 const source={id:approval.id,recipient:config.forward.refundRecipient,row:{id:order,direction:'ZCASH_TO_BASE',execution_mode:'base-settlement-v1',classification:'LATE',
  input_amount:'100000',received_amount:'100000',refund_fee:'10000',access_hash:accessHash(state.owner),deposit_id:'fixture-deposit'}};
 const record={order_id:order,deposit_id:source.row.deposit_id,base_phase:'CANCEL',epoch:'2'},control={accepting_orders:false,dispatch_enabled:false,reconciliation_required:false,epoch:'2'};
 return {config,run,state,source,record,control,approval};
}
test('incident target exception allows only existing recovery steps on original exact branch',()=>{
 const database={...G5_TARGET,adminUrl:`postgresql://fixture@${G5_TARGET.host}/neondb`},config={mode:INCIDENT_REFUND_MODE};
 for(const step of ['prepare-base','observe-base','approve-wallet','recover-zcash','broadcast-zcash','refresh-headers','status'])assert.equal(requireRefundTarget(config,database,[],step),true);
 for(const step of ['quote-forward','quote-reverse','funding','observe-reverse','dispatch'])assert.throws(()=>requireRefundTarget(config,database,[],step));
 assert.throws(()=>requireRefundTarget({},database));assert.throws(()=>requireRefundTarget(config,{...database,branchId:'another'}));
 assert.throws(()=>requireRefundTarget(config,database,['postgresql://fixture@another.invalid/neondb']));
});
test('incident refund binds original frozen run/order, owner, exact late liability, epoch and approved bytes',()=>{
 const f=fixture(),check=()=>validateIncidentRefund(f.config,f.run,f.state,f.source,f.record,f.control,f.approval);check();
 for(const mutate of [(f:any)=>{f.run.incident=false;},(f:any)=>{f.state.orderId='another';},(f:any)=>{f.state.owner='another';},(f:any)=>{f.run.binding='another';},
  (f:any)=>{f.source.row.classification='EXACT';},(f:any)=>{f.source.row.received_amount='110000';},(f:any)=>{f.source.recipient='another';},
  (f:any)=>{f.record.epoch='1';},(f:any)=>{f.control.reconciliation_required=true;},(f:any)=>{f.control.dispatch_enabled=true;},
  (f:any)=>{f.approval.id='another';},(f:any)=>{f.source.row.access_hash=Buffer.alloc(32);}]){
  const broken=fixture();mutate(broken);assert.throws(()=>validateIncidentRefund(broken.config,broken.run,broken.state,broken.source,broken.record,broken.control,broken.approval));
 }
});
test('header refresh refuses owned fee outputs and missing canonical source anchors',()=>{
 const snapshot={outputs:[],blocks:[{height:100},{height:110}]};assert.equal(requireRefundHeaderSnapshot(snapshot,[100,110]),snapshot);
 assert.throws(()=>requireRefundHeaderSnapshot({...snapshot,outputs:[{amount:'10000'}]},[100]));
 assert.throws(()=>requireRefundHeaderSnapshot(snapshot,[101]));
});
