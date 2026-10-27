/** Explicit Root execution choice, independent of the immutable source selector.
 * Undefined is the original serial path. No URL/rate/lag override is accepted. */
import {posix} from 'node:path';
import {object,stable,requireThat} from './types.ts';
export const PARALLEL_CONSUMER_EXECUTION={version:1,mode:'PARALLEL_HEADERS_PREFETCH_ONE',headerGroups:2,maxHeaderBatch:10,consumerMethodsPerSecond:24,sourcePrefetchDepth:1,maxRawPacketBytes:8000000,independentReadBudgetMs:30000,byteAccounting:'OWNED_EXACT_BYTES_V1',fullAuditEveryPackets:256} as const;
export type ConsumerExecution=typeof PARALLEL_CONSUMER_EXECUTION;
export function consumerExecution(value:unknown):ConsumerExecution|undefined{
 if(value===undefined)return undefined;object(value,Object.keys(PARALLEL_CONSUMER_EXECUTION));requireThat(stable(value)===stable(PARALLEL_CONSUMER_EXECUTION),'ENVIO_CONSUMER_EXECUTION_PROFILE');return value as ConsumerExecution;
}
export function bindConsumerExecution(permit:unknown,config:unknown){const a=consumerExecution(permit),c=consumerExecution(config);requireThat(stable(a??null)===stable(c??null),'ENVIO_CONSUMER_EXECUTION_BINDING');return a;}
const required=['scripts/recover-linux-envio-event-first-closed.ts','scripts/prepare-linux-envio-closed-v2.ts','src/integrations/observation/envio-consumer-execution.ts','src/integrations/observation/envio-event-first-consumer-performance.ts','src/integrations/observation/envio-owned-byte-ledger.ts','src/integrations/observation/envio-owned-byte-ledger.ts','src/integrations/observation/envio-event-first.ts','src/integrations/observation/envio-closed-v2-rpc.ts','src/integrations/observation/envio-event-first-closed.ts','src/integrations/observation/envio-closed-v2-store.ts','src/integrations/observation/envio-closed-v2-linux.ts'];
/** Both Root entrypoints supply their ACTUAL file URL, not a configuration path.
 * New execution pins cannot be satisfied by the old selector's code witness. */
export function requireConsumerExecutionPins(pins:{path:string;sha256:string}[],entryPath:string){
 const api=posix.dirname(posix.dirname(entryPath));requireThat(/^\/opt\/zeeswap-testnet\/releases\/[a-z0-9._-]+\/app\/api$/.test(api)&&['recover-linux-envio-event-first-closed.ts','prepare-linux-envio-closed-v2.ts'].includes(posix.basename(entryPath)),'ENVIO_CONSUMER_EXECUTION_ENTRY');
 for(const relative of[...required,'../workers/zcash-wallet/snapshot.schema.json'])requireThat(pins.some(p=>p.path===posix.normalize(api+'/'+relative)&&/^[a-f0-9]{64}$/.test(p.sha256)),'ENVIO_CONSUMER_EXECUTION_CODE_PINS');return api;
}
