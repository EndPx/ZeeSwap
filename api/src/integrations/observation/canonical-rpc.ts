import { safeEndpoint, readJson, type CanonicalReader, type CanonicalSample } from "./chef.ts";
import { height, hex, object, parseHeader, requireThat, type Header, type Policy } from "./types.ts";

/** Deliberately exposes only allowlisted read RPC methods, never a generic RPC passthrough. */
export function canonicalRpc(config: { url: string; authorization?: string; network: Policy["network"]; sourceId: string; consensusBranchId?: string; fetch?: typeof fetch; now?: () => number }): CanonicalReader {
  const endpoint = safeEndpoint(config.url); const now = config.now ?? Date.now;
  const call = async (method: "eth_chainId" | "eth_getBlockByNumber" | "getblockchaininfo" | "getblockhash" | "getblockheader", params: unknown[], signal: AbortSignal): Promise<unknown> => {
    const response = await (config.fetch ?? fetch)(endpoint, { method: "POST", signal, redirect: "error", headers: { "content-type": "application/json", ...(config.authorization ? { authorization: config.authorization } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    requireThat(response.ok, "CANONICAL_RPC_HTTP_ERROR");
    const raw = await readJson(response, signal) as Record<string, unknown>;
    requireThat(raw && typeof raw === "object" && raw.id === 1 && (raw.error === null || raw.error === undefined) && raw.result !== undefined && raw.result !== null, "CANONICAL_RPC_ERROR"); return raw.result;
  };
  const evmHeader = async (tag: string, signal: AbortSignal): Promise<Header> => {
    const r = await call("eth_getBlockByNumber", [tag, false], signal) as Record<string, unknown>;
    for (const field of ["number", "timestamp"]) requireThat(typeof r[field] === "string" && /^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(r[field] as string), "INVALID_RPC_QUANTITY");
    return parseHeader({ height: height(Number(BigInt(r.number as string))), hash: r.hash, parentHash: r.parentHash, time: new Date(height(Number(BigInt(r.timestamp as string))) * 1000).toISOString() }, config.network);
  };
  const zcashHeader = async (h: number, signal: AbortSignal): Promise<Header> => {
    const hash = hex(await call("getblockhash", [h], signal), 32);
    const r = await call("getblockheader", [hash, true], signal) as Record<string, unknown>;
    requireThat(r.hash === hash && r.height === h, "CANONICAL_RPC_HEADER_MISMATCH");
    return parseHeader({ height: h, hash, parentHash: h === 0 ? "0".repeat(64) : r.previousblockhash, time: new Date(height(r.time) * 1000).toISOString() }, config.network);
  };
  return {
    async sample(signal): Promise<CanonicalSample> {
      if (config.network === "eip155:84532") {
        requireThat(await call("eth_chainId", [], signal) === "0x14a34", "WRONG_RPC_NETWORK");
        const head = await evmHeader("latest", signal), finalized = await evmHeader("finalized", signal);
        requireThat(finalized.height <= head.height, "FINALIZED_HEAD_REGRESSION");
        return { sourceId: config.sourceId, head, finalized, checkedAt: new Date(now()).toISOString() };
      }
      requireThat(config.network === "zcash-testnet" && typeof config.consensusBranchId === "string" && /^[0-9a-f]{8}$/.test(config.consensusBranchId), "CONSENSUS_BRANCH_REQUIRED");
      const state = await call("getblockchaininfo", [], signal) as Record<string, unknown>;
      requireThat(state.chain === "test" && (state.consensus as Record<string, unknown>)?.chaintip === config.consensusBranchId, "WRONG_RPC_NETWORK_OR_BRANCH");
      const head = await zcashHeader(height(state.blocks), signal);
      requireThat(head.hash === state.bestblockhash, "SOURCE_HEAD_CHANGED");
      return { sourceId: config.sourceId, head, checkedAt: new Date(now()).toISOString() };
    },
    async header(h, signal) { height(h); return config.network === "eip155:84532" ? evmHeader(`0x${h.toString(16)}`, signal) : zcashHeader(h, signal); },
  };
}
