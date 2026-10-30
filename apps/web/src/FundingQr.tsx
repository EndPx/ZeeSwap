import { useEffect, useMemo, useRef, useState } from 'react';
import type { OrderView } from './protocol.ts';
import { fundingPaymentRequest } from './payment-uri.ts';
import {externalPaymentAttemptStorage,readExternalPaymentAttempt} from './external-payment-attempt.ts';
import { Button, Copy, Notice } from './ui.tsx';

function fundingHeightWarning(order:OrderView,now=Date.now()):string {
  const cutoff=order.funding?.cutoffHeight;if(cutoff==null)return '';
  const h=order.source.scannedHeight,scanned=Date.parse(order.source.scannedAt??''),checked=Date.parse(order.source.checkedAt??'');
  if(typeof h==='number'&&Number.isSafeInteger(h)&&h>=cutoff)return 'The funding height cutoff has been reached. Do not send to this order. Refresh the original order.';
  if(order.funding?.cutoffTime===null&&(typeof h!=='number'||!Number.isSafeInteger(h)||h<=0||!Number.isFinite(scanned)||!Number.isFinite(checked)||now-scanned< -5000||now-scanned>30000||now-checked< -5000||now-checked>30000||scanned-checked>5000))return 'Refresh the original order to verify a fresh service-observed Zcash height before sending. Do not send while its funding window is unverified.';
  return '';
}

/** Only server-issued accepted funding instructions belong in this component.
 * QR generation happens offline in the browser; no signing or wallet RPC occurs. */
export function FundingQr({ order, reviewOnly=false }: { order: OrderView; reviewOnly?:boolean }) {
  const [clockTick, setClockTick] = useState(0);
  const result = useMemo(() => {
    try { return { request: fundingPaymentRequest(order), invalid: false }; }
    catch { return { request: null, invalid: true }; }
  }, [order, clockTick]);
  const heightWarning=useMemo(()=>fundingHeightWarning(order),[order,clockTick]);
  const instructionsOnly=reviewOnly||!!heightWarning;
  const uri = instructionsOnly?undefined:result.request?.uri;
  const [qr, setQr] = useState<{ uri: string; image: string } | null>(null);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const [downloading,setDownloading]=useState(false),[downloadError,setDownloadError]=useState('');
  const latest=useRef({order,reviewOnly,uri}),mounted=useRef(false),downloadPending=useRef(false);
  latest.current={order,reviewOnly,uri};
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const eligibleDownloadUri=()=>{
    const current=latest.current;
    if(!mounted.current||current.reviewOnly||fundingHeightWarning(current.order)||readExternalPaymentAttempt(externalPaymentAttemptStorage,current.order.id))return undefined;
    const request=fundingPaymentRequest(current.order);
    return request&&request.uri===current.uri?request.uri:undefined;
  };
  const downloadQr=async()=>{
    if(downloadPending.current)return;
    downloadPending.current=true;setDownloading(true);setDownloadError('');
    try{
      const originalId=latest.current.order.id,requestedUri=eligibleDownloadUri();
      if(!requestedUri)throw Error('Refresh the original order before downloading a payment QR. Its funding window or previous wallet request must be reconciled.');
      const encoder=await import('qrcode');
      const image=await encoder.default.toDataURL(requestedUri,{type:'image/png',width:768,margin:4,errorCorrectionLevel:'M'});
      if(!mounted.current)return;
      if(latest.current.order.id!==originalId||eligibleDownloadUri()!==requestedUri)throw Error('The original funding request changed or expired. No QR was downloaded. Refresh the original order.');
      const link=document.createElement('a');link.href=image;link.download='zeeswap-payment-qr.png';document.body.append(link);link.click();link.remove();
    }catch(error){if(mounted.current)setDownloadError(error instanceof Error?error.message:'QR download unavailable. Refresh the original order.');}
    finally{downloadPending.current=false;if(mounted.current)setDownloading(false);}
  };
  useEffect(()=>{
    if(order.status!=='AWAITING_FUNDS'||order.funding?.cutoffTime!==null)return;
    const expires=Math.min(Date.parse(order.source.scannedAt??'')+30001,Date.parse(order.source.checkedAt??'')+30001),remaining=expires-Date.now();
    const timer=setTimeout(()=>setClockTick(tick=>tick+1),Number.isFinite(remaining)&&remaining>0?Math.min(10000,remaining):10000);return()=>clearTimeout(timer);
  },[order,clockTick]);

  useEffect(() => {
    const cutoff = order.funding?.cutoffTime;
    if (!cutoff || order.status !== 'AWAITING_FUNDS') return;
    const remaining = Date.parse(cutoff) - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) return;
    const timer = setTimeout(() => setClockTick(tick => tick + 1), Math.min(remaining + 1, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [order, clockTick]);

  useEffect(() => {
    if (!uri) return;
    let current = true;
    // Keep the QR encoder outside the initial landing-page bundle.
    void import('qrcode').then(module => module.default.toString(uri, { type: 'svg', errorCorrectionLevel: 'M', margin: 4 }))
      .then(svg => {
        if (current) setQr({ uri, image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` });
      }).catch(() => { if (current) setFailedUri(uri); });
    return () => { current = false; };
  }, [uri]);

  if (result.invalid) return <Notice tone="warning" title="Funding request unavailable">Refresh this order before sending. Its payment instructions could not be validated.</Notice>;
  const request = result.request;
  if (!request) return null;
  return <section className="funding-panel" aria-label="Shielded testnet funding instructions">
    {heightWarning&&<Notice tone="warning">{heightWarning}</Notice>}
    <h3>{instructionsOnly?'Original funding details':'Pay with Zingo'}</h3>
    <p>{instructionsOnly?'For checking the original wallet transaction only. Do not send another payment.':'Open Zingo separately with a Zcash Testnet wallet. Let it sync and make sure you have spendable TAZ plus the wallet network fee. Scan this QR or paste the copied payment request, then verify the exact receiver, TAZ amount and required memo before sending once.'}</p>
    {!instructionsOnly&&<p className="fine-print"><a className="inline-link" href="https://github.com/zingolabs/zingo-pc/releases/tag/zingo-pc-2.0.27-201" target="_blank" rel="noreferrer">Get Zingo PC</a>. On Windows x64, choose the <a className="inline-link" href="https://github.com/zingolabs/zingo-pc/releases/download/zingo-pc-2.0.27-201/Zingo.PC-2.0.27-201-x64.msi" target="_blank" rel="noreferrer">x64 installer</a>, not ARM64. Another Zcash testnet wallet may also support these payment requests. ZeeSwap does not connect to or control your Zcash wallet.</p>}
    {!instructionsOnly&&<figure className="funding-qr" style={{ margin: '16px 0', textAlign: 'center' }}>
      {qr && qr.uri === uri
        ? <img src={qr.image} width="240" height="240" style={{ maxWidth: '100%', height: 'auto' }} alt="Zcash testnet payment QR with the exact amount, shielded receiver and required memo shown below" />
        : <div role="status" className="fine-print">{failedUri === uri ? 'QR unavailable. Use the exact details below.' : 'Preparing payment QR…'}</div>}
      <figcaption className="fine-print">TAZ only. Never send mainnet ZEC. Wallet support varies; scanning does not send funds.</figcaption>
    </figure>}
    {!instructionsOnly&&<Button variant="quiet" busy={downloading} disabled={!qr||qr.uri!==uri} onClick={()=>{void downloadQr();}}>Download QR (PNG)</Button>}
    {downloadError&&<Notice tone="warning">{downloadError}</Notice>}
    <div className="funding-label"><span>Exact source amount</span><Copy value={request.amount} label="Copy amount" /></div>
    <div className="private-value">{request.amount} TAZ</div>
    <div className="funding-label"><span>Shielded deposit receiver</span><Copy value={request.receiver} label="Copy receiver" /></div>
    <div className="private-value">{request.receiver}</div>
    <div className="funding-label"><span>Required payment memo</span><Copy value={request.memo} label="Copy memo" /></div>
    <div className="private-value">{request.memo}</div>
    {!instructionsOnly&&<Copy value={request.uri} label="Copy wallet payment request" />}
    {request.cutoffHeight !== null && <p className="funding-cutoff">Deposit must be included at or before block {request.cutoffHeight.toLocaleString()}.</p>}
    {request.cutoffTime && <p className="funding-cutoff">Funding cutoff: {new Date(request.cutoffTime).toLocaleString()}.</p>}
    <Notice>{instructionsOnly?'Keep these details to reconcile the original wallet transaction. Do not send another payment.':'Confirmation may finish after the cutoff when inclusion was timely. Send once; another deposit will not speed up this order.'}</Notice>
  </section>;
}
