/** A fresh provider waiting state is not approval authority or a contradiction.
 * Approval effects run only after the current canonical COMMIT check succeeds.
 * Actual receipt contradictions/errors still propagate to reconciliation.
 */
export async function g5ApproveAfterFreshCommit<T>(observe:()=>Promise<{status:string}>,approve:()=>Promise<T>){
 const fresh=await observe();
 if(fresh.status==='AWAITING_BASE_FINALITY')return {status:'AWAITING_BASE_FINALITY',phase:'APPROVE_WALLET'};
 if(fresh.status!=='COMMIT_FINALIZED')throw Error('UNEXPECTED_FRESH_COMMIT_APPROVAL_STATUS');
 return approve();
}
