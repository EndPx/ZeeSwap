/** Fixed read-only concurrency: preserve every input/result position, stop
 * scheduling on failure, and drain all started RPCs before the error escapes.
 * No publication, source capability, retry or observation-time renewal exists. */
export async function readBaseAnchorsBounded<T,R>(anchors:readonly T[],read:(anchor:T)=>Promise<R>):Promise<R[]>{
 const results=new Array<R>(anchors.length);let next=0,failed=false,firstError:unknown;
 async function worker(){
  while(!failed){const index=next++;if(index>=anchors.length)return;
   try{results[index]=await read(anchors[index]);}
   catch(error){if(!failed){failed=true;firstError=error;}return;}
  }
 }
 await Promise.all(Array.from({length:Math.min(4,anchors.length)},()=>worker()));
 if(failed)throw firstError;
 return results;
}
