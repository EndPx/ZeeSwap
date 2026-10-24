# Linux forward worker preparation

This entry is prepared, unstarted and disabled by configuration. No private
profile, service activation, signature or broadcast was produced by its coding
checks. Existing financial dispatch, validation, original receipt reconciliation
and supervisor implementations remain unchanged.

New source: `api/src/linux-forward-dispatch.ts`,
`api/scripts/dispatch-linux-testnet.ts` and
`api/test/integrations/linux-forward-dispatch.test.ts`.

Create a protected `/opt/zeeswap-testnet/secrets/forward-profile.private.json`
using `LinuxForwardConfig`, with `enabled:false`, `version:1`,
`mode:LINUX_TESTNET_FORWARD`, `pollSeconds:5`, and the exact operator profile path
`/opt/zeeswap-testnet/secrets/linux-operator-profile.private.json`.
The operator profile must pin its complete bytes in `configPins.forwardProfile`.
This is a separate Linux profile, never an altered copy used to bypass the old
WSL path validator. The verified operator profile binds original opening books,
runtime/registry, UFVK identity, native binaries and operator credentials.

Assembly order matters: the disabled profile here is a review draft. Changing
its `enabled` field changes the pinned operator profile and invalidates a prior
handoff proof. If the parent later authorizes preparing an executable profile,
select its final value before final operator-profile hashing and the empty-app
handoff check. Keep SQL paused and the worker unstarted until the separate
financial authorization. Do not edit pinned profiles after customer admission
or manufacture a new pre-funding proof once customer tables are nonempty.

Other profile fields are SHA-256 `{path,sha256}` pins for:

- `signerConfig`: `/opt/zeeswap-testnet/secrets/forward-signer.private.json`.
- `supervisor`: `<reviewed-release>/app/workers/zcash-wallet/owned_wallet_call.py`.
- `signerScript`: `<reviewed-release>/app/workers/base-signer/signer.py`.

`handoffProof` is the exact path string
`/opt/zeeswap-testnet/secrets/relocation-applied-proof.private.json`. Its actual
root ownership, private permissions, canonical path, profile digest and opening
binding are verified. It is created after the final operator profile: pinning
the proof's bytes through that same profile would create a circular digest.

`python` must be `/opt/zeeswap-testnet/tools/python/bin/python`. The exact
command is Python plus the pinned supervisor, `--kind base-forward --script`
the pinned signer and `--config` the pinned signer configuration. No WSL or
arbitrary command/argument list is accepted. Interpreter provisioning/hash
verification belongs to the parent Linux runtime manifest. Set
`HOME=/opt/zeeswap-testnet/home` so cast resolves only the transported new operator
keystore. The entry refuses another HOME.

Signer JSON uses the original chain/operator/token/settlement/runtime code hashes,
RPC `https://sepolia.base.org`, account `zeeswap-live-20261023-operator`,
`cast` equal to the verified profile's native cast artifact, password file
`/opt/zeeswap-testnet/secrets/operator-password`, and shared journal root
`/opt/zeeswap-testnet/state/base-signer-journal`. The historical `/home/albary`
journal is refused. Preserve original journal bytes during transport. Reverse and
refund workers must use this same root and the shared advisory lock
`(84532,20261023)`; a new namespace would permit unsafe nonce concurrency.

Future explicit operator commands, from the reviewed release API directory:

```sh
HOME=/opt/zeeswap-testnet/home /usr/bin/node --import tsx scripts/dispatch-linux-testnet.ts /opt/zeeswap-testnet/secrets/forward-profile.private.json --once
```

With `enabled:false`, verified configuration loading exits before connecting the
worker database or invoking any adapter. With configuration enabled but SQL
dispatch paused or source checkpoints stale, one step returns
`WAIT_OBSERVERS_OR_POLICY` before any signer, financial dispatch or reconciliation
preflight call. `--reconcile-only --once` also obeys that gate: paused recovery
continues to require the separately reviewed operator recovery path.

Once authorized later, ordinary execution delegates only to `dispatchBaseOnce`
or `reconcileBaseReceipts`. Both sources must have SQL-clock freshness within
60 seconds, no more than five seconds future skew, valid finalized/scanned
heights and a consistent dispatch epoch. The step owns the shared operator lock
through supervision, storage and broadcast. Hard failures pause inside the held
callback; scope failures cannot mutate an unverified database. The supervisor
owns its 95-second Base deadline and actual descendant reaping; Node adds no
unsafe outer kill timer. Unconfirmed cleanup retains the unresolved promise and
operator lock. Normal SIGTERM requests stop after the current step; an eventual
service template must not impose a deadline that breaks that cleanup contract.

No control-enabling command or worker unit is included. Root approval, current
canonical observers, original-submission reconciliation and an explicit later
financial authorization remain required before execution with dispatch enabled.

Local validation on 24 October: API typecheck passed; four focused tests passed
for native identity/transport rejection, paused/stale admission, hard-pause lock
ordering and the actual Linux adapter binding making zero key/Base/signer
accesses on paused SQL. These use synthetic SQL controls and no real database,
wallet, RPC, signature or financial operation. Deployment and a real settlement
remain unverified. The parent owns explicit staging and publication.
The working-candidate publication audit found zero secret findings across 61
public candidate files; tracked diff whitespace checking also passed.
