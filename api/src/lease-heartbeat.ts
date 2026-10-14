/** Serial renewal with fail-closed checkpoints. Network work never holds a DB lock. */
export async function withLeaseHeartbeat<T>(renew:()=>Promise<unknown>,run:(check:()=>Promise<void>)=>Promise<T>,interval=10000):Promise<T>{
 let failure:unknown,pending=Promise.resolve(),stopped=false;
 const check=async()=>{await pending;if(failure)throw Error('BASE_LEASE_RENEWAL_FAILED');};
 const timer=setInterval(()=>{
  pending=pending.then(async()=>{if(stopped||failure)return;try{await renew();}catch(error){failure=error;}});
 },interval);
 try{return await run(check);}
 finally{stopped=true;clearInterval(timer);await pending;}
}
