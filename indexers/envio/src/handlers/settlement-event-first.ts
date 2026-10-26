import { indexer } from 'envio';
import {canonicalHeaders} from '../headers.js';
import {writeEventFirstTip} from '../event-first-tip.js';
void canonicalHeaders; // Keep the existing SDK descriptor import; no effect call is made.

// Public metadata, pinned to contracts/deployments/base-sepolia.json.
const TOKEN = '0xd64c116352cef2adc9484098ae332fd9ba339a63';
const V1 = '0xe99ac648f85450b8ddeaea088aa99749c5e16da3';
const v1Events = [
  'InventoryDeposited', 'InventoryWithdrawn', 'PayoutReserved', 'Paid',
  'SettlementCancelled', 'Funded', 'PayoutCommitted', 'EscrowSettled', 'Refunded',
] as const;
const canonicalValue = (value: unknown): string => {
  const result = String(value);
  return result.startsWith('0x') ? result.toLowerCase() : result;
};

function guard(chainId: number, address: string, version: 'v1' | 'v2') {
  if (chainId !== 84532) throw new Error('WRONG_NETWORK');
  if (version === 'v1' && address.toLowerCase() !== V1) throw new Error('WRONG_V1_DEPLOYMENT');
  if (version === 'v2' && (process.env.ZEESWAP_ENABLE_V2 !== 'true'
    || !/^0x[0-9a-fA-F]{40}$/.test(process.env.ZEESWAP_V2_ADDRESS ?? '')
    || address.toLowerCase() !== process.env.ZEESWAP_V2_ADDRESS?.toLowerCase())) throw new Error('V2_PROFILE_DISABLED');
}

for (const contract of ['ZeeSwapSettlement', 'ZeeSwapSettlementV2'] as const) for (const name of v1Events) {
  indexer.onEvent({ contract, event: name }, async ({ event, context }) => {
    const version = contract === 'ZeeSwapSettlement' ? 'v1' : 'v2';
    guard(event.chainId, event.srcAddress, version);
    const decoded = Object.fromEntries(Object.entries(event.params).map(([key, value]) => [key, canonicalValue(value)]));
    context.SettlementEvent.set({
      id: `${event.chainId}:${event.srcAddress.toLowerCase()}:${event.transaction.hash}:${event.logIndex}:${event.block.hash}`,
      contract: event.srcAddress.toLowerCase(), contractVersion: version, token: TOKEN,
      txHash: event.transaction.hash, transactionIndex: event.transaction.transactionIndex, logIndex: event.logIndex,
      blockNumber: event.block.number, blockHash: event.block.hash, blockParentHash: event.block.parentHash,
      blockTimestamp: event.block.timestamp, eventName: name,
      settlementId: decoded.id, amountAtomic: decoded.amount === undefined ? undefined : BigInt(decoded.amount),
      decodedJson: JSON.stringify(decoded),
    });
  });
}

// Registering an event type does not configure an indexed address. Both a reviewed
// config edit AND this explicit opt-in are required; no V2 has been deployed here.
indexer.onEvent({ contract: 'ZeeSwapSettlementV2', event: 'EscrowAborted' }, async ({ event, context }) => {
  guard(event.chainId, event.srcAddress, 'v2');
  const decoded = Object.fromEntries(Object.entries(event.params).map(([key, value]) => [key, canonicalValue(value)]));
  context.SettlementEvent.set({
    id: `${event.chainId}:${event.srcAddress.toLowerCase()}:${event.transaction.hash}:${event.logIndex}:${event.block.hash}`,
    contract: event.srcAddress.toLowerCase(), contractVersion: 'v2', token: TOKEN,
    txHash: event.transaction.hash, transactionIndex: event.transaction.transactionIndex, logIndex: event.logIndex,
    blockNumber: event.block.number, blockHash: event.block.hash, blockParentHash: event.block.parentHash,
    blockTimestamp: event.block.timestamp, eventName: 'EscrowAborted',
    settlementId: event.params.id, amountAtomic: event.params.amount, decodedJson: JSON.stringify(decoded),
  });
});

// Explicit opt-in: the old v1 producer remains a different code/generation contract.
if(process.env.ZEESWAP_EVENT_FIRST!=='true')throw Error('EVENT_FIRST_EXPLICIT_MODE_REQUIRED');
const rehearsal=process.env.ZEESWAP_EVENT_FIRST_REHEARSAL==='true',limit=process.env.ZEESWAP_EVENT_FIRST_MAX_BLOCK;
if(limit!==undefined&&!rehearsal)throw Error('EVENT_FIRST_REHEARSAL_ONLY_LIMIT');
const maximum=limit===undefined?undefined:Number(limit);
indexer.onBlock({name:'ZeeSwapEmptyBlockVisits',where:({chain})=>chain.id===84532},async({block,context})=>{
 writeEventFirstTip(block,context,undefined,maximum);
});
