import type {BaseRegistry} from './base-contract.ts';

/** Private operator transport selection only. Deployment identity, chain and
 * finalized-receipt policy remain those of the canonical checked registry.
 */
export function reverseBaseRegistry(registry:BaseRegistry,override?:unknown):BaseRegistry {
 if(override===undefined)return registry;
 if(typeof override!=='string'||!['https://sepolia.base.org','https://base-sepolia-rpc.publicnode.com'].includes(override))
  throw Error('REVERSE_BASE_RPC_NOT_ALLOWLISTED');
 return {...registry,rpcUrl:override};
}
