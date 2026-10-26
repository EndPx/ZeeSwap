import {marketSnapshotDigest,type MarketSnapshot} from '../src/market-pricing.ts';
/** Explicit synthetic price fixture; no production provider fallback. */
export function marketFixture(at=Date.now(),usdc='1.00000000'):MarketSnapshot{
 const s:MarketSnapshot={version:1,snapshotId:'12345678-1234-4234-8234-123456789abc',snapshotSha256:'',source:'Kraken',pair:'ZEC/USDC',retrievedAt:new Date(at).toISOString(),expiresAt:new Date(at+30000).toISOString(),sourcePairs:[{pair:'ZEC/USD',providerPair:'XZECZUSD',bid:'1200.00000000',ask:'1250.00000000',mid:'1225.000000000000'},{pair:'USDC/USD',providerPair:'USDCUSD',bid:usdc,ask:usdc,mid:usdc.split('.')[0]+'.000000000000'}]};s.snapshotSha256=marketSnapshotDigest(s);return s;
}
