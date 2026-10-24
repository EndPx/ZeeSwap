/** Exact opening allocations for the isolated native testnet app. */
export const liveOpeningAccounts=[
 {asset:'mockUSDC',purpose:'principal',balance:'200000',reserved:'0'},
 {asset:'TAZ',purpose:'principal',balance:'200000',reserved:'0'},
 {asset:'TAZ',purpose:'fee',balance:'20000',reserved:'0'},
 {asset:'baseETH',purpose:'fee',balance:'500000000000000',reserved:'0'},
] as const;
export function validateLiveOpeningRows(eventId:string,accounts:{asset:string;purpose:string;balance:string;reserved:string}[],ledger:{event_id:string;asset:string;bucket:string;amount:string}[]){
 if(accounts.length!==4||ledger.length!==8)throw Error('LIVE_OPENING_ROW_COUNT');
 for(const a of liveOpeningAccounts){
  if(accounts.filter(r=>r.asset===a.asset&&r.purpose===a.purpose&&r.balance===a.balance&&r.reserved==='0').length!==1)throw Error('LIVE_OPENING_ACCOUNT_MISMATCH');
  for(const [bucket,amount] of [[a.purpose+':available',a.balance],[a.purpose+':operator-capital','-'+a.balance]])
   if(ledger.filter(r=>r.event_id===eventId&&r.asset===a.asset&&r.bucket===bucket&&r.amount===amount).length!==1)throw Error('LIVE_OPENING_LEDGER_MISMATCH');
 }
}
