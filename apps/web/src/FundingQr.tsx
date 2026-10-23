import { useEffect, useMemo, useState } from 'react';
import type { OrderView } from './protocol.ts';
import { fundingPaymentRequest } from './payment-uri.ts';
import { Copy, Notice } from './ui.tsx';

/** Only server-issued accepted funding instructions belong in this component.
 * QR generation happens offline in the browser; no signing or wallet RPC occurs. */
export function FundingQr({ order }: { order: OrderView }) {
  const [clockTick, setClockTick] = useState(0);
  const result = useMemo(() => {
    try { return { request: fundingPaymentRequest(order), invalid: false }; }
    catch { return { request: null, invalid: true }; }
  }, [order, clockTick]);
  const uri = result.request?.uri;
  const [qr, setQr] = useState<{ uri: string; image: string } | null>(null);
  const [failedUri, setFailedUri] = useState<string | null>(null);

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
    void import('qrcode').then(module => module.toString(uri, { type: 'svg', errorCorrectionLevel: 'M', margin: 4 }))
      .then(svg => {
        if (current) setQr({ uri, image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` });
      }).catch(() => { if (current) setFailedUri(uri); });
    return () => { current = false; };
  }, [uri]);

  if (result.invalid) return <Notice tone="warning" title="Funding request unavailable">Refresh this order before sending. Its payment instructions could not be validated.</Notice>;
  const request = result.request;
  if (!request) return null;
  return <section className="funding-panel" aria-label="Shielded testnet funding instructions">
    <h3>Fund this swap</h3>
    <p>Scan with a Zcash testnet wallet that supports payment requests. Review the amount, receiver and memo before confirming in your wallet.</p>
    <figure className="funding-qr" style={{ margin: '16px 0', textAlign: 'center' }}>
      {qr && qr.uri === uri
        ? <img src={qr.image} width="240" height="240" style={{ maxWidth: '100%', height: 'auto' }} alt="Zcash testnet payment QR with the exact amount, shielded receiver and required memo shown below" />
        : <div role="status" className="fine-print">{failedUri === uri ? 'QR unavailable. Use the exact details below.' : 'Preparing payment QR…'}</div>}
      <figcaption className="fine-print">TAZ only. Never send mainnet ZEC. Wallet support varies; scanning does not send funds.</figcaption>
    </figure>
    <div className="funding-label"><span>Exact source amount</span><Copy value={request.amount} label="Copy amount" /></div>
    <div className="private-value">{request.amount} TAZ</div>
    <div className="funding-label"><span>Shielded deposit receiver</span><Copy value={request.receiver} label="Copy receiver" /></div>
    <div className="private-value">{request.receiver}</div>
    <div className="funding-label"><span>Required payment memo</span><Copy value={request.memo} label="Copy memo" /></div>
    <div className="private-value">{request.memo}</div>
    <Copy value={request.uri} label="Copy wallet payment request" />
    {request.cutoffHeight !== null && <p className="funding-cutoff">Deposit must be included at or before block {request.cutoffHeight.toLocaleString()}.</p>}
    {request.cutoffTime && <p className="funding-cutoff">Funding cutoff: {new Date(request.cutoffTime).toLocaleString()}.</p>}
    <Notice>Confirmation may finish after the cutoff when inclusion was timely. Send once; another deposit will not speed up this order.</Notice>
  </section>;
}
