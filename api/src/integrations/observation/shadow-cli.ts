import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { ChefAdapter } from "./chef.ts";
import { canonicalRpc } from "./canonical-rpc.ts";
import { fetchEnvioExport } from "./envio.ts";
import { ShadowStore } from "./shadow-store.ts";
import { digest, height, object, requireThat, stable, text, type Policy } from "./types.ts";

/** One complete read/publish attempt. No order database, wallet SDK, signer or dispatcher imports. */
export async function runShadow(configValue: unknown, env: NodeJS.ProcessEnv = process.env): Promise<Record<string, unknown>> {
  const c = object(configValue, ["mode", "policy", "storePath", "sourceUrl", "tokenEnv", "project", "canonicalRpcUrl", "canonicalAuthorizationEnv", "consensusBranchId"]);
  requireThat(c.mode === "SHADOW", "SHADOW_ONLY");
  const rawPolicy = c.policy as Record<string, unknown>;
  const policyKeys = ["adapter", "network", "registryDigest", "projectionDigest", "canonicalSourceId", "birthday"];
  const optional = ["accountFingerprint", "contract", "token", "abiDigest", "contractVersion", "maxBlocks", "maxObservations", "maxHistory"];
  object(rawPolicy, [...policyKeys, ...optional.filter(key => Object.hasOwn(rawPolicy, key))]);
  const policy = rawPolicy as Policy; height(policy.birthday);
  requireThat(["zeer-chef", "envio-hyperindex"].includes(policy.adapter) && ["zcash-testnet", "eip155:84532"].includes(policy.network), "INVALID_POLICY");
  for (const field of ["maxBlocks", "maxObservations", "maxHistory"] as const) if (policy[field] !== undefined) requireThat(Number.isSafeInteger(policy[field]) && policy[field]! > 0 && policy[field]! <= (field === "maxHistory" ? 10000 : 1000), "INVALID_LIMIT");
  const store = new ShadowStore(text(c.storePath), policy), before = await store.read();
  const canonical = canonicalRpc({ url: text(c.canonicalRpcUrl), sourceId: policy.canonicalSourceId, network: policy.network,
    ...(c.canonicalAuthorizationEnv === null ? {} : { authorization: env[text(c.canonicalAuthorizationEnv)] }),
    ...(c.consensusBranchId === null ? {} : { consensusBranchId: text(c.consensusBranchId) }),
  });
  // Revalidate every retained sealed anchor. An unsupported retention volume stops explicitly.
  const signal = AbortSignal.timeout(30_000);
  for (const anchor of before.headers.filter(h => h.height <= before.sealedThrough)) requireThat(stable(await canonical.header(anchor.height, signal)) === stable(anchor), "BLOCK_DEEP_REORG");
  const from = Math.max(policy.birthday, before.sealedThrough + 1);
  const token = env[text(c.tokenEnv)]; requireThat(token, "AUTH_TOKEN_MISSING");
  let batch;
  if (policy.adapter === "zeer-chef") {
    const result = await new ChefAdapter({ url: text(c.sourceUrl), token, project: text(c.project), policy, canonical }).traverse(from);
    if (result.status !== "READY_SHADOW") return { mode: "SHADOW", ...result };
    batch = result.batch;
  } else {
    requireThat(c.project === null && c.consensusBranchId === null, "INVALID_ENVIO_CONFIG");
    batch = await fetchEnvioExport(text(c.sourceUrl), token, from, policy, canonical);
  }
  const next = await store.publish(batch, before.checkpoint ? digest(before.checkpoint) : null);
  return { mode: "SHADOW", status: "PUBLISHED_PRIVATE_MIRROR", throughHeight: next.checkpoint!.through.height, canonicalObservations: next.occurrences.filter(row => row.canonical).length, exposureCount: next.exposures.length, financialDispatchEnabled: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const path = process.argv[2]; requireThat(path && isAbsolute(path) && path.replaceAll("\\", "/").includes("/.deploy-local/observation-shadow/"), "PRIVATE_CONFIG_PATH_REQUIRED");
    const config = JSON.parse(await readFile(path, "utf8")); console.log(JSON.stringify(await runShadow(config)));
  } catch (error) {
    // Never print remote payloads, credentials, note plaintexts, memos or private references.
    console.error(JSON.stringify({ mode: "SHADOW", status: "BLOCKED", code: (error as { code?: unknown }).code && typeof (error as { code: unknown }).code === "string" ? (error as { code: string }).code : "SHADOW_READ_FAILED" })); process.exitCode = 1;
  }
}
