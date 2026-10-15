/** Error messages from RPC/SQL/SDK commands can contain secrets. Persist only
 * static uppercase codes and source locations, never arbitrary message text.
 */
export function g5Diagnostic(error:unknown,step:string,phase:string){
 const value=error as any;
 const code=typeof value?.message==='string'&&/^[A-Z][A-Z0-9_]{0,119}$/.test(value.message)?value.message:'PRIVATE_DIAGNOSTIC_ERROR';
 const exceptionClass=error instanceof TypeError?'TypeError':error instanceof SyntaxError?'SyntaxError':error instanceof RangeError?'RangeError':error instanceof Error?'Error':'Unknown';
 const frames=typeof value?.stack==='string'?value.stack.split('\n').slice(1).flatMap((line:string)=>{
  const match=line.match(/([A-Za-z0-9_-]+\.(?:ts|js)):(\d+):(\d+)/);return match?[{file:match[1],line:Number(match[2]),column:Number(match[3])}]:[];
 }).slice(0,12):[];
 return {version:1,observedAt:new Date().toISOString(),step,phase,code,exceptionClass,
  ...(typeof value?.code==='string'&&/^[A-Z0-9]{5}$/.test(value.code)?{sqlState:value.code}:{}),frames};
}
