# Linux artifact and single-writer handoff plan

23 October 2026. This is a preparation plan, not a VPS deployment record. The
parent reported the existing Hostinger VPS as Ubuntu 24.04.4, four cores, 16 GB
RAM with about 9 GB available, and 33 GB free disk. This work did not modify the
VPS, existing Zeer services, remote permissions, credentials or wallets. Do not
perform the handoff while a funded local operation is unresolved.

## Reuse the verified scanner release

The installed `@zeer-dev/chef@0.6.1` package includes a scanner installer pin:

| Field | Verified local published artifact |
| --- | --- |
| Release | `scanner-v0.1.0-testnet.1` |
| Tag commit | `df2737e90a7deafb054b0e76800339d1bbcdb176` |
| Asset | `zeer-scanner-linux-x64` |
| Target | `x86_64-unknown-linux-gnu` |
| Bytes | `1750872` |
| SHA-256 | `1a24bcc9f066466ec9dab902b21d8619c8a4a5fffdd1a2c2d8fc099b3fa6b00c` |
| Protocol/network | `1` / testnet only |

The local actual ELF, published `scanner-manifest.json`, `SHA256SUMS` and bundled
installer agree. The scanner crate and workspace `Cargo.lock` have no difference
between that tag and the inspected current Zeer commit
`cb46c002277ed69ef54e8036afddb31edad011c5`. This establishes exact native source and
lockfile continuity with the scanner used in local real Chef receipt tests.
The release manifest's recorded Chef qualification is still **0.2.0**, with a
public unfunded fixture. Do not relabel that fixture as a 0.6.1 mined receipt.

The parent found a matching remote candidate under the existing Zeer release
assets, including exact hash/size. A non-executable existing artifact is left
unchanged. After copying only into a new ZeeSwap-owned release directory, a
keyless probe is:

```sh
env -i PATH=/usr/bin:/bin /new/verified/path/zeer-scanner-linux-x64 capabilities </dev/null
```

Expected fields are `protocol_version: 1`, `scanner_version: "0.1.0"`,
`network: "testnet"`, pools `sapling/orchard/ironwood`, `watch_only: true`,
`stateless: true`, `key_file_required: true`, and `max_frame_bytes: 4100000`.
This command reads no viewing key and has no network or signing method. Do not
call `inspect-key` or `serve` before the later protected viewing-key handoff.
The existing Zeer service user and files remain separate.

## Exact local ELF inventory

Read-only local hashing and `ldd` succeeded for:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Patched pinned Zingo CLI, Ubuntu 24.04 release | 83751888 | `ef1cbce8186feb852388cf56bb412a28285d57a75041d25efab1f74b9ef6b5d1` |
| Existing NU7 structural verifier, Ubuntu 24.04 | 2277712 | `df9ac9a919bea5f02c2609292478a9c4b25e52dbe67c168e2405b517a71936e2` |
| Cast used by Ubuntu Base signer | 73880592 | `1412cb2374f68032ce2c73a3fcb04e0e02a8d2b1744c160456ce513bdb2416da` |
| Separate Ubuntu 24.04 Cast used for read-only hashing | 77990424 | `90a02a6b3a002f0a178f96deb4745d086fa554eca385743f78dd9e1610735dee` |

The SDK CLI depends on standard glibc/libm/libgcc and the x86-64 dynamic loader;
the structural verifier depends on glibc/libgcc and that loader. Verify remote
architecture and symbol-version compatibility before reusing an ELF. A SHA binds
the actual artifact; it does not prove source reproducibility by itself. Include
the prepared-export and wait-sync patches, pinned source/lockfiles, licenses and
toolchain metadata in the parent-reviewed artifact manifest.

The tested Linux Python environment reports Python **3.12.3**, grpcio **1.84.0**,
protobuf **7.36.2**. Package the generated gRPC modules and pin a Linux environment
with those dependencies. Node must satisfy the pinned projects' **24.14+** gate;
install package-lock dependencies without changing package versions.

The new Windows SDK reader cannot be copied as a Linux executable. Build only the
small `workers/zcash-wallet/verify` crate using its exact `Cargo.lock`, in a new
separate target directory, after the local financial operation is quiescent:

```sh
CARGO_BUILD_JOBS=1 RAYON_NUM_THREADS=2 cargo build --offline --locked \
  --manifest-path workers/zcash-wallet/verify/Cargo.toml \
  --bin zeeswap-wallet-read --bin zeeswap-g1-verify \
  --target-dir /new/isolated/build-target
```

This requires no Zingolib rebuild. Record the resulting ELF hashes and `ldd`, then
repeat native validation/outgoing recovery against protected owned evidence before
using it for a new financial request. The later parent build and actual owned-note
verification are recorded below. The
current tested **Windows** reader remains SHA-256
`1df0108d0d1b3cf4b42cfb4e8fcf2fe91965c7afffa439a433a490e1adc2dfba`.

## Required transport work before activation

The current operator runners deliberately require the approved Windows/WSL
deployment paths and two WSL distribution transports. They are **not** drop-in
Linux daemons. A subsequent bounded change must add an explicit reviewed Linux
deployment profile and native process arguments, keeping all database/registry,
account, wallet-root, proof, lease and signer-journal guards. Do not weaken a guard
or change a hash merely to make a copied executable launch.

The Linux supervisor, fresh payer/refund helpers and raw signing protocol are
already Linux-native. The same host can avoid nested WSL transports while retaining
one wallet writer, the shared PostgreSQL operator lock, shared Base nonce journal,
process-group cleanup ACK and two-thread proving limit. App source/deposit UFVK
and payout spend authority must remain the same approved operator account.

## Controlled handoff

1. Parent freezes and publishes the exact reviewed source revision and manifest.
   The first circle must be reconciled, or the parent must explicitly choose a
   controlled pre-funding handoff with no accepted/funded order in flight.
2. Keep intake/dispatch paused, establish all owned writer/process groups are
   quiescent, and inspect every original signing/broadcast journal. An unresolved
   submission is reconciled from its existing txid/raw bytes, never recreated.
3. Parent transfers only the new application's required wallet state, keystore,
   passwords, protected viewing files and durable journals over its approved
   secure channel. These are never in the public source/artifact package. Do not
   transfer or resume G5 wallets. Preserve both allocator address high-water state
   and signer state; re-importing only a seed is not a state-preserving handoff.
4. Install under a new restricted application user/release directory, verify
   every file hash and permission, and retain previous release/journal material.
   The existing `zeer-chef` service remains untouched.
5. Start only read-only services first. Check database/registry identity, TLS,
   UFVK fingerprint, birthday, canonical retained headers, exact opening-capital
   exclusion, wallet identity and actual balances. Treat any Chef fingerprint or
   generation change as an explicit compatibility/reconciliation gate.
6. Confirm local financial writers remain stopped. Only then may the parent
   enable the single approved remote writer and run a new bounded test. No local
   and VPS signer/allocator pair may write the same wallet state concurrently.

## Parent verification added before publication

The parent ran the bounded **one-job, offline, locked WSL build** in the new
isolated target directory. It passed in **1 minute 57 seconds**. Read-only artifact
inspection then verified:

| New Linux artifact | Bytes | SHA-256 | Dynamic dependencies |
| --- | ---: | --- | --- |
| `zeeswap-wallet-read` | 5105192 | `8742f606635b992abbc91d94892308135848bea8c2ae50b28e7e34fee526cd73` | glibc, libgcc, x86-64 loader |
| `zeeswap-g1-verify` | 2277712 | `df9ac9a919bea5f02c2609292478a9c4b25e52dbe67c168e2405b517a71936e2` | glibc, libgcc, x86-64 loader |

Both `ldd` checks passed. The new structural verifier matches the earlier verified
ELF exactly. Original build targets and wallet/config/proof files were not
overwritten by this build.

Using a separate copied private capture config and a new proof output, the parent
verified the Linux reader against the same real native capital: scanned height
**4532320**, **264 confirmations**, exact **12500000 zatoshi**. All serialized
positive `snapshot.outputs` fields matched the immutable Windows capture exactly,
including the privately compared receiver, memo, note identity and amount. No
private fields were printed; the original opening proof/config remained unchanged.

The parent also verified the remote public scanner candidate's exact
**1750872-byte** size/hash and successful **keyless capabilities** matching protocol
1/testnet/all three pools/watch-only/stateless. This is an executable protocol
check, not a remote wallet receipt or settlement.

VPS operator wallet/key transfer, application deployment-profile activation and a
new remote settlement remain pending. No remote operator wallet/key copy or new
settlement occurred in these artifact checks.
