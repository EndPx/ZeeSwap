/** Sum the actual pinned SDK note response; never trust an asserted balance. */
export function recipientShieldedBalance(notes:any,tip?:number){
 let sum=0n;const identities=new Set<string>();
 for(const pool of ['ironwood','orchard','sapling']){
  const values=notes?.[pool+'_notes']?.note_summaries;
  if(!Array.isArray(values))throw Error('INVALID_RECIPIENT_SDK_NOTES');
  for(const note of values){
   if(note.spend_status!=='unspent')continue;
   const height=/^confirmed at block height ([1-9][0-9]*)$/.exec(note.status)?.[1];
   if(!height||!Number.isSafeInteger(note.value)||note.value<=0||!/^[0-9a-f]{64}$/.test(note.txid)
    ||!Number.isSafeInteger(note.output_index)||note.output_index<0||(tip!==undefined&&tip-Number(height)+1<10))throw Error('UNCONFIRMED_RECIPIENT_SDK_NOTE');
   const identity=`${pool}:${note.txid}:${note.output_index}`;
   if(identities.has(identity))throw Error('DUPLICATE_RECIPIENT_NOTE');identities.add(identity);sum+=BigInt(note.value);
  }
 }
 return sum;
}
