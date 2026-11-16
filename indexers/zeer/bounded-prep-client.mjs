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

/** Explicit catch-up profile only: bounded 413 subdivision, never a legacy fallback. */
export function catchupPayloadClient(client,cap,PrepError){
 if(![16,64].includes(cap)||typeof PrepError!=='function')throw Error('CATCHUP_PAYLOAD_PROFILE_INVALID');
 let effectiveCap=cap,fullSuccesses=0;
 return {
  getHeight(options){return client.getHeight(options);},
  async get(query,options){
   const uint=(n,max=0xffffffff)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
   if(!query||typeof query!=='object'||Array.isArray(query)||!uint(query.from_block)||!uint(query.to_block,0x100000000)
    ||query.to_block<=query.from_block||!Number.isSafeInteger(query.limit)||query.limit<1||query.limit>1000
    ||query.scan_mode!==undefined)throw Error('CATCHUP_REQUEST_SCOPE');
   const range=query.to_block-query.from_block;
   const rawPayload=query.limit>1&&range>1&&Array.isArray(query.field_selection?.transaction)&&query.field_selection.transaction.includes('raw');
   let limit=Math.min(query.limit,rawPayload?effectiveCap:cap,range);
   for(;;){
    try{
     options?.signal?.throwIfAborted();
     const page=await client.get({...query,to_block:query.from_block+limit,limit},options);
     options?.signal?.throwIfAborted();
     if(rawPayload){
      const full=limit===effectiveCap&&page.next_block===query.from_block+limit&&page.data?.blocks?.length===limit;
      fullSuccesses=full?fullSuccesses+1:0;
      if(fullSuccesses===8){effectiveCap=Math.min(cap,effectiveCap*2);fullSuccesses=0;}
     }
     return page;
    }
    catch(error){
     if(rawPayload)fullSuccesses=0;
     options?.signal?.throwIfAborted();
     if(!(error instanceof PrepError)||error.status!==413||limit===1)throw error;
     limit=Math.max(1,Math.floor(limit/2));
     if(rawPayload)effectiveCap=limit;
    }
   }
  }
 };
}
