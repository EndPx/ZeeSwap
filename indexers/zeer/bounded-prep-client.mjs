/** Customized client for Chef's official CLI dependency-injection seam.
 * Only outgoing request bounds change. Responses and validation remain with
 * the supplied PrepClient; the CLI still processes every contiguous block. */
export function fixedPayloadClient(client,maxPayloadBlocks=1,inspect=()=>{}){
 if(maxPayloadBlocks!==1&&maxPayloadBlocks!==2)throw Error('FIXED_PAYLOAD_CAP_INVALID');
 const uint=(n,max=0xffffffff)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
 return {
  getHeight(options){return client.getHeight(options);},
  get(query,options){
   if(!query||typeof query!=='object'||Array.isArray(query)||!uint(query.from_block)||!uint(query.to_block,0x100000000)||query.to_block<=query.from_block
    ||!Number.isSafeInteger(query.limit)||query.limit<1||query.limit>1000||query.scan_mode!==undefined)throw Error('FIXED_SINGLE_REQUEST_SCOPE');
   const limit=Math.min(query.limit,maxPayloadBlocks,query.to_block-query.from_block);
   const clipped={...query,to_block:query.from_block+limit,limit};
   inspect({from:query.from_block,requestedTo:query.to_block,actualTo:clipped.to_block,originalLimit:query.limit});
   return client.get(clipped,options);
  }
 };
}
export function singleBlockClient(client,inspect=()=>{}){
 return fixedPayloadClient(client,1,inspect);
}
