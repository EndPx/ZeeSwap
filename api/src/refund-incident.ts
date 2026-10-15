import {g5Binding,validateG5State,G5_TARGET} from './g5-run.ts';
import {accessHash} from './private-data.ts';
import {approvalDigest} from './reverse-authority.ts';

export const INCIDENT_REFUND_MODE='G5_LATE_SOURCE_RECOVERY';
const REFUND_TARGET={projectId:'raspy-truth-63998651',branchId:'br-weathered-cell-aogn8u34',branchName:'zeeswap-g5-live-refunds',host:'ep-twilight-rain-aosy9prl.c-2.ap-southeast-1.aws.neon.tech'};
const incidentSteps=new Set(['begin','approve-base','prepare-base','broadcast-base','observe-base','approve-wallet','prepare-zcash','recover-zcash','broadcast-zcash','observe-zcash','refresh-headers','status']);

/** The recovery exception selects the original frozen branch only. It never
 * grants quote, funding, normal dispatch, or another run's order authority.
 */
export function requireRefundTarget(config:any,database:any,urls:string[]=[],step?:string){
 if(config.mode!==undefined&&config.mode!==INCIDENT_REFUND_MODE)throw Error('UNKNOWN_REFUND_OPERATOR_MODE');
 const incident=config.mode===INCIDENT_REFUND_MODE,target=incident?G5_TARGET:REFUND_TARGET;
 if(database.projectId!==target.projectId||database.branchId!==target.branchId||database.branchName!==target.branchName
  ||new URL(database.adminUrl).hostname!==target.host)throw Error('EXACT_REFUND_BRANCH_REQUIRED');
 for(const url of urls)if(new URL(url).hostname.replace('-pooler.','.')!==target.host)throw Error('REFUND_RUNTIME_BRANCH_MISMATCH');
 if(incident&&step!==undefined&&!incidentSteps.has(step))throw Error('INCIDENT_REFUND_EXISTING_ORDER_ONLY');
 return incident;
}

export function validateIncidentRefund(runConfig:any,runState:any,state:any,source:any,record:any,control:any,baseApproval:any){
 validateG5State(runState,runConfig);
 const slot=runState.orders[0];
 if(runState.incident!==true||runState.closed||runState.binding!==g5Binding(runConfig)||runState.orders.length!==1
  ||slot?.sequence!==1||slot.direction!=='ZCASH_TO_BASE'||slot.verified||!slot.orderId
  ||state.version!==1||state.orderId!==slot.orderId||state.owner!==slot.owner
  ||source.row.id!==slot.orderId||source.row.direction!=='ZCASH_TO_BASE'||source.row.execution_mode!=='base-settlement-v1'
  ||source.row.classification!=='LATE'||source.row.input_amount!=='100000'||source.row.received_amount!=='100000'
  ||source.row.refund_fee!=='10000'||source.recipient!==runConfig.forward.refundRecipient
  ||!Buffer.isBuffer(source.row.access_hash)||!accessHash(slot.owner).equals(source.row.access_hash)
  ||!record||record.order_id!==slot.orderId||record.deposit_id!==source.row.deposit_id||record.base_phase!=='CANCEL'
  ||control.accepting_orders!==false||control.dispatch_enabled!==false||control.reconciliation_required!==false
  ||String(record.epoch)!==String(control.epoch))throw Error('FROZEN_INCIDENT_REFUND_BINDING_REQUIRED');
 if(!/^[0-9a-f]{64}$/.test(state.baseApprovedDigest??'')||approvalDigest(baseApproval)!==state.baseApprovedDigest
  ||baseApproval.version!==1||baseApproval.kind!=='SOURCE_REFUND_BASE'||baseApproval.orderId!==slot.orderId
  ||baseApproval.id!==source.id||baseApproval.phase!=='CANCEL'||baseApproval.amount!=='100000'
  ||baseApproval.cancellationAvailableAt!=='0')throw Error('INCIDENT_BASE_REFUND_APPROVAL_MISMATCH');
}

/** Header capture may never feed operator-owned notes into deposit allocation. */
export function requireRefundHeaderSnapshot(snapshot:any,requiredHeights:number[]){
 if(!snapshot||!Array.isArray(snapshot.outputs)||snapshot.outputs.length!==0||!Array.isArray(snapshot.blocks)
  ||requiredHeights.some(h=>!snapshot.blocks.some((b:any)=>b.height===h)))throw Error('INCIDENT_HEADER_ONLY_RECONCILIATION_REQUIRED');
 return snapshot;
}
