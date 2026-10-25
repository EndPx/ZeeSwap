# Explicit normal Envio canonical reader

This change prepares an explicit Root-selected normal reader for Base Sepolia.
It does not claim a successful live handoff, sustained freshness, or financial readiness.
The earlier normal consumer received a regressed finalized view and then exceeded
its read budget. Root stopped that consumer; the retained admission journal and
SQL history remain the starting point for a separately authorized recovery.

`loadLinuxEnvioProfile` remains the original immutable producer/recovery loader.
The new `loadLinuxEnvioNormalProfile` first validates that loader and returns its
original `source` and policy, plus a separate `normal` verification configuration.
No producer generation, projection, rollback floor, birthday, old profile,
admission journal or retained row is rewritten.

The coherent export still declares its original producer policy source ID.
The optional normal verification identity must match the actual canonical RPC
sample. Normal result records distinguish `producerCanonicalSourceId` from
`verificationCanonicalSourceId`. Selected exports have no producer canonical
source ID; normal selected windows use a cloned verification policy. Service
launch audit/source identities therefore identify the actual normal verifier.
Existing default callers retain their original source identity checks.

## Root operator descriptor

Both environment selectors must be present for opt-in:

```text
ZEESWAP_ENVIO_NORMAL_RPC_PROOF=/opt/zeeswap-testnet/state/envio/normal-rpc-overlay.private.json
ZEESWAP_ENVIO_NORMAL_RPC_SHA256=<exact raw SHA-256>
```

Missing or invalid selected files stop startup. There is no provider fallback.
With neither selector, the legacy Tenderly normal configuration remains active.
Root must pin the selectors in the normal unit and pass the same selectors to
normal window and launch/audit commands. Recovery commands keep their original
loader and separately recorded transport.

The descriptor is a real regular non-symlink Root-owned file, group 978, mode
0640, at the exact path above. Its real parent directory must be owned by
the existing observer UID 986, group 978, mode 0700. That directory remains
writable for the ordinary admission journal temporary-file rename; it must not
be made read-only. A replacement descriptor still must have Root ownership and
the exact externally pinned raw SHA, so observer-created replacements refuse. It has exactly these fields (values in angle brackets are operator
inputs, never a supplied approval):

```json
{
  "version": 1,
  "status": "ROOT_ENVIO_NORMAL_RPC_OVERLAY_APPROVED",
  "metadataOnly": true,
  "noFinance": true,
  "network": "eip155:84532",
  "profileSha256": "<original Linux Envio profile raw SHA>",
  "operatorProfileSha256": "<original profile pin>",
  "handoffSha256": "<original handoff pin>",
  "generation": "<original producer generation>",
  "projectionDigest": "<original projection digest>",
  "originalSourceId": "base-sepolia-tenderly-rpc",
  "normalSourceId": "base-sepolia-publicnode-normal-rpc",
  "normalRpcUrl": "https://base-sepolia-rpc.publicnode.com",
  "headerBatchSize": 10,
  "maxMethodsPerSecond": 24,
  "qualifiedAt": "<actual qualification UTC timestamp>",
  "anchors": ["<2 to 500 distinct complete height/hash/parentHash/time headers>"]
}
```

Root's independent qualification must cover the actual stored checkpoint,
finalized checkpoint and all financial anchors against the selected provider,
with actual chain ID, head and finalized view. Keep that evidence private and
retain its original observation times. The descriptor's historical timestamp
is never renewed by the loader. At each normal observer startup its pinned
headers are independently read again under one 30-second signal. Every normal
cycle still verifies current required SQL/financial anchors, producer headers,
current finalized header and the current admission hash before publication.

Only the explicit descriptor selects normal batches of 10 and a limit of 24
RPC methods per second, including the existing canonical transport's retries.
The legacy factory remains batches of 5 / 11 methods per second. Auxiliary
normal window reads retain their own 2 / 2 pacing. These are independent reader
limits, not a claim about a shared global limiter or a provider quota.

The original 30-second read budget, source freshness, finalized and head
checks, 32-block overlap, maximum contiguous range and hint admission rules are
unchanged. A gap over the ordinary bound still stops. Root must finish a new
explicit metadata recovery from the real stored frontier before restarting
ordinary observation; this descriptor grants no reset or financial authority.

## Local verification

The final combined run passed 49 tests with zero skips and API typechecking.
It covered strict overlay identity, the real canonical transport with a fake
HTTP provider, actual per-header qualification, honest sample identity versus
unchanged producer coverage, legacy adapter behavior, normal/auxiliary pacing,
selected verification, and launch window behavior. Selector-pair failure and explicit Root transport versus unchanged legacy pacing
were also exercised. No live provider,
database, wallet, source process or service was operated by the implementing
agent. Actual Root issuance, protected Linux installation, provider timing and
the resumed freshness window remain deployment checks.
