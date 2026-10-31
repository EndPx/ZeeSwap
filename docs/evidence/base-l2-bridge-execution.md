# Bridge Base L2 execution opt-in

The 31 October user decision accepts operator reorganization risk for Base legs
in both bridge directions. The default bridge adapters still require finalized
Base anchors. An optional Root approval enables independently agreed canonical L2
inclusion for execution; it does not change Zcash's ten-confirmation requirement,
wallet isolation, physical backing, fee limits, salted commitments, immutable raw
transactions, broadcast uncertainty or the funded-circle public-pilot gate.

`CanonicalBridgeBase.finalized()` retains its original meaning. The separate
`settlementAnchor()` selects the lower actual latest height from two independent
readers only in the opted-in mode, requires their hash agreement and fresh heads,
and rechecks the Root code/configuration pins. `readAt()` still verifies network,
canonical anchors, deployed runtime code, roles, gas and independently equal
counters. Deployment receipts must remain actually finalized in both modes.

Bridge books are the current canonical economic projection. Mints may increase
projected supply and burns may create repayment liabilities at L2 inclusion.
Every new opted-in Base receipt explicitly records `INCLUDED` or `FINALIZED`.
The external Base-operation journal stores inclusion separately from finality;
the worker later rechecks original receipt identity before promoting finality
metadata. No second finalized ledger is invented. Reorganization or conflicting
anchors pause execution; the same durable transaction remains the only original.

## Root artifacts

Use a new immutable release under
`/opt/zeeswap-bridge-testnet/releases/<release>/app`. Keep the original profiles,
wallets, credentials, note allocations, old orders and journals intact. Root
approval files use the existing `readRootPermit` boundary: root owner, group 977,
mode 0640, protected real parent paths, and a pinned SHA256.

The public service configuration may add `fastBaseL2: {path, sha256}`. The proof
path must be `/opt/zeeswap-bridge-testnet/private/<name>.private.json`. Its JSON is:

```json
{
  "version": 1,
  "purpose": "ROOT_BRIDGE_BASE_L2_EXECUTION",
  "baseProfileSha256": "<original base profile SHA256>",
  "castProfileSha256": "<original cast profile SHA256>",
  "publicPermitSha256": "<actual valid public pilot permit SHA256>",
  "publicCommit": "<reviewed published git commit>",
  "executionRoot": "/opt/zeeswap-bridge-testnet/releases/<release>/app",
  "files": [{"path": "<absolute reviewed code path>", "sha256": "<SHA256>"}],
  "nativeSpend": {
    "templateSha256": "<reviewed new native template SHA256>",
    "workerSha256": "<new bridge_native_wallet.py SHA256>",
    "supervisorSha256": "<unchanged qualified supervisor SHA256>"
  }
}
```

The required code paths are enforced in `base-l2-execution.ts`. Also include
every changed native module and preflight dependency in `files`. The existing
Root-permit reader bounds proof files to 16 KiB; prepare a bounded reviewed
manifest rather than including private runtime data or dependency trees.

For native redemption, copy the original qualified template and preserve the
physical wallet/key/account/node/loader fields. Change only the reviewed worker
module and preflight paths/pins. Keep the supervisor bytes unchanged and place it
beside its allowed native script. The service validates the new template, worker
and supervisor against the Root approval. Do not put `fastBaseL2` inside that
template: the generated per-order profile receives it from the service config,
avoiding a circular proof/template hash. Python validates its exact optional
Root-scoped pin and passes it to `bridge-base-preflight.ts` for both authority
and immediate pre-broadcast checks. Legacy generated profiles remain unchanged.

The normal service invocation remains:

```sh
node --import <pinned-tsx-loader> <release>/app/api/scripts/serve-bridge-public-pilot.ts \
  --config <reviewed-private-config> --config-sha256 <config-sha256> \
  --permit <actual-public-pilot-permit> --permit-sha256 <permit-sha256>
```

This command is conditional on the original funded-circle qualification and
valid public authority. It is not a command to bypass an existing paused bridge.

## Actual primary audit and remaining activation gate

Read-only inspection of the existing VPS primary found the bridge paused, with
no incident, zero controlled principal, zero in-transit principal, zero supply,
and 20,000 zatoshis of fee capital. It contains one accepted forward order still
awaiting its original deposit, without a source receipt, payout attempt or native
profile. Its qualification permit expired on 30 October, no public-pilot grant is
recorded, and no funded qualification circle exists. The named configuration is
`BRIDGE_READ_PAUSED_API`; there was no active bridge listener or systemd service.

The new execution mode therefore remains unactivated. Retain the original
invoice and acceptance counters. The next bounded operator step is the existing
authenticated unfunded-retirement qualification, followed by a separately
approved replacement/circle using the actual dedicated inventory. A fast-mode
approval alone cannot manufacture a funded circle or renew the old permit.

## Verification

- Full bridge TypeScript regression run: 92 checks, 91 passed, zero failed,
  one isolated PostgreSQL fixture skipped because its dedicated test URL was
  absent. The run includes the real local Anvil adapter and Root opt-in tests.
- Actual local Anvil adapter run: 13 checks passed, including canonical mint
  inclusion before finality while the default finality path still refused it.
  This is local execution evidence, not a public bridge settlement.
- Ubuntu 24.04 native bridge protocol/wallet tests: 29 passed, including the
  optional Root pin validation. No real wallet was signed or broadcast.
- API TypeScript typecheck passed after the bridge changes.

Publication, final combined checks and any later live activation are recorded by
the coordinating operator. No financial runtime mutation occurred in this work.
