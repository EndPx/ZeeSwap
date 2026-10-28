import { useCallback, useEffect, useRef, useState } from 'react';
import { noirAccount, noirConnectError, noirProvider, noirRequest, type NoirProvider } from './noir.ts';

export function useNoir(){
  const [provider,setProvider]=useState<NoirProvider|null>(null),[address,setAddress]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const generation=useRef(0),operation=useRef(0),pending=useRef(false);
  // Discover only. Permission prompts always require the Connect Noir gesture.
  useEffect(()=>{setProvider(noirProvider());},[]);
  useEffect(()=>{if(!provider)return;
    const changed=()=>{generation.current++;setAddress(null);setError('Noir account changed or locked. Connect Noir again to verify its testnet address.');};
    const events=['accountsChanged','disconnect','lock','chainChanged'];
    for(const event of events)provider.on?.(event,changed);
    return()=>{for(const event of events)provider.removeListener?.(event,changed);};
  },[provider]);
  const connect=useCallback(async()=>{if(pending.current)return;const next=noirProvider();setProvider(next);setError('');setAddress(null);if(!next){setError('No Noir provider found. Install and unlock the Testnet Noir extension, then reload ZeeSwap.');return;}pending.current=true;setBusy(true);const epoch=++generation.current,attempt=++operation.current;
    try {let result=await noirRequest(next,{method:'zcash_requestAccounts'});if(attempt!==operation.current)return;if(epoch!==generation.current){const current=generation.current;result=await noirRequest(next,{method:'zcash_getAccounts'},4500);if(current!==generation.current||attempt!==operation.current)return;}const account=noirAccount(result);if(!account)throw Error('No connected account');setAddress(account);setError('');}
    catch(error){if(epoch===generation.current)setError(noirConnectError(error));}finally{pending.current=false;setBusy(false);}
  },[]);
  const disconnect=useCallback(async()=>{generation.current++;operation.current++;setAddress(null);setError('');try{if(provider)await noirRequest(provider,{method:'zcash_disconnect'},4500);}catch{setError('Disconnected from ZeeSwap. Check Noir to revoke its site permission.');}},[provider]);
  return {provider,address,busy,error,connect,disconnect};
}
