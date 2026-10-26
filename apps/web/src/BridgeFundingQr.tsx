import {useEffect,useState} from 'react';
import {nativeFundingRequest} from './payment-uri.ts';
import type {BridgeDeposit} from './bridge.ts';
import {Copy,Notice} from './ui.tsx';
export function BridgeFundingQr({funding,amount}:{funding:BridgeDeposit;amount:string}){
  const [image,setImage]=useState(''),[clock,setClock]=useState(Date.now());
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[]);
  let request=null;try{request=nativeFundingRequest({network:'zcash-testnet',receiver:funding.address,memo:funding.memo,cutoffHeight:funding.cutoffHeight,cutoffTime:funding.cutoffTime,cancellationAvailableAt:null},amount,10000n,100000000n,clock,true);}catch{/* Invalid instructions never become a payment request. */}
  const uri=request?.uri;
  useEffect(()=>{let current=true;setImage('');if(uri)void import('qrcode').then(m=>m.toString(uri,{type:'svg',errorCorrectionLevel:'M',margin:4})).then(svg=>{if(current)setImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);}).catch(()=>{});return()=>{current=false;};},[uri]);
  if(!request)return <Notice tone="warning">Shielded funding instructions are invalid or expired. Refresh the original order; do not send.</Notice>;
  return <section className="funding-panel"><h3>Fund this bridge</h3><p>Send once from your shielded Zcash testnet wallet. Review its network fee separately.</p>{image&&<img className="bridge-qr" src={image} alt="Exact shielded bridge deposit payment request" width="240" height="240"/>}<p>Exact principal: {request.amount} TAZ</p><div className="private-value">{request.receiver}</div><Copy value={request.receiver} label="Copy shielded receiver"/><p>Required memo</p><div className="private-value">{request.memo}</div><Copy value={request.uri} label="Copy bridge payment request"/><p>Include by block {request.cutoffHeight} and {new Date(request.cutoffTime!).toLocaleString()}.</p></section>;
}
