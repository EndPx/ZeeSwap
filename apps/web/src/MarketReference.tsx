import {useEffect,useState} from 'react';
import type {ZeeApi} from './api.ts';
import {marketEstimate,marketReferenceFresh,type MarketReference as Reference} from './market-reference.ts';
import {formatUnits,type Direction} from './protocol.ts';
import {Icon} from './ui.tsx';

export function MarketReference({api,amount,direction,visible}:{api:ZeeApi;amount:string;direction:Direction;visible:boolean}){
  const [reference,setReference]=useState<Reference>(),[checking,setChecking]=useState(true),[clock,setClock]=useState(Date.now());
  useEffect(()=>{
    if(!visible){setReference(undefined);return;}
    let disposed=false,request:AbortController|null=null,refreshTimer:ReturnType<typeof setTimeout>|undefined,expiryTimer:ReturnType<typeof setTimeout>|undefined;
    const clearTimers=()=>{clearTimeout(refreshTimer);clearTimeout(expiryTimer);};
    const refresh=async()=>{
      if(disposed||request||document.visibilityState!=='visible')return;
      request=new AbortController();const timeout=setTimeout(()=>request?.abort(),5000);
      try{const value=await api.marketReference(request.signal);if(!disposed){setReference(value);setClock(Date.now());clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>{setReference(undefined);setClock(Date.now());},Math.max(0,Date.parse(value.expiresAt)-Date.now()));}}
      catch{if(!disposed)setReference(undefined);}
      finally{clearTimeout(timeout);request=null;if(!disposed){setChecking(false);setClock(Date.now());refreshTimer=setTimeout(()=>{void refresh();},15000);}}
    };
    const visibility=()=>{clearTimers();if(document.visibilityState!=='visible'){request?.abort();setReference(undefined);}else{void refresh();}};
    document.addEventListener('visibilitychange',visibility);setChecking(true);void refresh();
    return()=>{disposed=true;clearTimers();request?.abort();document.removeEventListener('visibilitychange',visibility);};
  },[api,visible]);
  const fresh=marketReferenceFresh(reference,clock)&&marketReferenceFresh(reference)?reference:undefined;
  const estimate=fresh?marketEstimate(amount,direction,fresh):null,forward=direction==='ZCASH_TO_BASE';
  return <section className="market-reference" aria-labelledby="market-reference-title">
    <div className="market-reference-heading"><h3 id="market-reference-title">ZEC/USDC market reference</h3><span>Reference only</span></div>
    {fresh?<><p className="market-reference-rate">1 ZEC ≈ <strong>{formatUnits((BigInt(fresh.rate.mid.replace('.',''))).toString(),12)} USDC</strong></p><p className="market-reference-source">Kraken · Sampled <time dateTime={fresh.retrievedAt}>{new Date(fresh.retrievedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time></p>{estimate!==null&&<details className="market-reference-estimate"><summary>Market reference estimate — not your testnet payout</summary><output aria-label="Separate market reference estimate">{formatUnits(estimate,forward?6:8)} {forward?'USDC':'ZEC'}</output><p>For the same numeric input treated as {forward?'ZEC':'USDC'}; uses the conservative {forward?'bid':'ask'} side before fees.</p></details>}</>:<p className="market-reference-unavailable"><Icon name="info" size={15}/>{checking?'Checking reference…':'Unavailable'}</p>}
    <p className="market-reference-disclaimer">Market data is for ZEC and USDC. TAZ has no monetary value; mockUSDC is not USDC. Your testnet quote and payout keep the fixture rate above.</p>
  </section>;
}
