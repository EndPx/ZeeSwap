import { spawn } from "node:child_process";
import type { CanonicalReader, CanonicalSample } from "./chef.ts";
import { parseHeader, requireThat, utc, type Header } from "./types.ts";

/** Independent TLS lightwalletd compact headers, never read from Chef's own store. */
export function localChefCanonical(command: string, args: string[], sourceId: string, prefetch?: {fromHeight: number; throughHeight: number}): CanonicalReader {
 const cached = new Map<number, Header>();
 let sampledHead = -1;
 const invoke = (request: unknown, signal: AbortSignal): Promise<unknown> => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, signal });
  let output = "", failed = false;
  const fail = () => { failed = true; reject(Error("CHEF_CANONICAL_HEADER_FAILED")); };
  child.on("error", fail); child.stdin.on("error", fail); child.stderr.resume();
  child.stdout.on("data", data => { output += data; if (output.length > 300_000) { child.kill(); fail(); } });
  child.on("close", code => { if (failed) return; if (code !== 0) { fail(); return; } try { resolve(JSON.parse(output)); } catch { fail(); } });
  child.stdin.end(JSON.stringify(request));
 });
 return {
  headerOrigin(height){return {kind:height!==sampledHead&&cached.has(height)?'prefetch-cache':'fresh',...(prefetch??{}),...(sampledHead<0?{}:{sampledHeadHeight:sampledHead})};},
  async sample(signal): Promise<CanonicalSample> {
   const result = await invoke({command: "sample"}, signal) as CanonicalSample;
   requireThat(result.sourceId === sourceId, "WRONG_CANONICAL_SOURCE"); utc(result.checkedAt);
   sampledHead = parseHeader(result.head, "zcash-testnet").height;
   cached.clear();
   if (prefetch) {
    const range = await invoke({command: "range", ...prefetch}, signal) as {headers: unknown[]};
    requireThat(Array.isArray(range.headers) && range.headers.length === prefetch.throughHeight - prefetch.fromHeight + 1 && range.headers.length <= 1000, "CANONICAL_RANGE_GAP");
    for (const raw of range.headers) {
     const header = parseHeader(raw, "zcash-testnet"), previous = cached.get(header.height - 1);
     requireThat(header.height === prefetch.fromHeight + cached.size && (!previous || header.parentHash === previous.hash), "CANONICAL_RANGE_GAP");
     cached.set(header.height, header);
    }
   }
   return {...result, head: parseHeader(result.head, "zcash-testnet")};
  },
  async header(height, signal) {
   // The adapter explicitly rechecks its sampled head after the range. Never
   // satisfy that recheck from the cached stream.
   return height !== sampledHead && cached.has(height) ? cached.get(height)! : parseHeader(await invoke({command: "header", height}, signal), "zcash-testnet");
  },
 };
}
