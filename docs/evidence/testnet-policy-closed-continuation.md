# Context-pinned closed-policy continuation with unchanged expiry

This ordinary continuation reuses the installed 0030/0031 predecessor gates.
It creates one immutable policy and one predecessor link, then enables the next
control epoch under the original-XID CAS. It executes no migration DDL, creates
no renewal authorization, allocates no capital and does not extend the permit.
The completed first successor, second successor and explicit 24-hour renewal
purposes remain unchanged.

A protected finite Root context supplies the immediate parent policy/raw SHA,
committed activation XID, paused control/xmin, next epoch, original expiry,
complete baseline digest, retained policy/link/runtime/renewal counts, and the
consumed and remaining lifetime quotas. The validator walks the full ancestor
chain, checks its counters and closed unfunded admissions, requires no customer
funds, holds or active worker, and binds the entire retained baseline. The new
policy preserves the exact expiry, financial release, source identity, profile,
assets, allocation, caps and principal/fee budgets.

Publication verifies the actual installed 0031 function bodies, owners, security
settings, grants and triggers before and inside the transaction. It retains the
fresh current Source, Native/Base capital and 30-second SQL source checks. A new
immutable approval and durable WSL ext4 original-XID intent precede policy/link
insertion and the control CAS. Exact reconciliation permits only those new rows
and the expected control change; every previous runtime row, predecessor link,
renewal authorization and application row must remain unchanged. Expired Root
context authority blocks a new publication but does not prevent original-intent
reconciliation.

Private seven-argument prepare/fresh helpers and a local configuration builder
produce the reviewed packet. The postcommit selector helper pins and atomically
replaces the existing effective worker ExecStart, idle ExecCondition and API
selector drop-ins at their existing paths. It archives their previous bytes and
checks effective systemd ExecStart/ExecCondition contain the new worker-config
SHA before starting the financial worker. Only its policy pin changes. The API
selector is updated only after actual new-policy worker readiness. Policy-hash
filename ordering is not used to select a later override.

Local verification: API typecheck and two synthetic continuation tests passed.
The tests preserve three policies' history, their two predecessor links, three
runtime rows and the existing renewal authorization, carry the already consumed
admission/quote, reject altered baselines and expiry/budget changes, and confirm
that publication executes no DDL. Three private Python helpers parsed
successfully. These checks do not establish an actual continuation commit,
worker readiness, customer transaction or settlement. Root records those
outcomes separately after original-XID reconciliation.

## Actual closed continuation and public readiness, 30 October 2026

Root's read-only incident recheck succeeded for the bounded recent prefix
**4,558,585 through 4,558,588** using the reviewed Native production helper.
Two reads retained the same world and Source identity. Its proof class is
`RECENT_PREFIX_COMMITMENT`, with `allHistoricalHeadersAudited=false`. The recheck
performed no SQL operation, freshness publication or cursor advance. This is
bounded recent-prefix evidence, not a complete historical canonical audit.

Root then verified the reviewed recent-prefix Native consumer active and an
actual ordinary publication through **4,558,668**. Core Zeer and Envio were
unchanged. The separate fresh Source and capital proofs qualified the ordinary
closed-policy continuation under the protected Root context.

The continuation from paused **241 / xmin 381754** committed under original
XID **388504** and was reconciled **COMMITTED_EXACT**, enabling control epoch
**242**. Its parent remains policy SHA-256
`7013874ad978170f500684f5d78e32c6796111d79d4f730146935aafa018a38d`,
whose original activation XID is **372136**. The new immutable policy is
`d1af6cdc-93a3-4390-b2be-a1df7b3bf1c5`, SHA-256
`1684eb5a004f4cc9bfbe332bea10970796374349ce00fddfd540fe80da5d41a8`.
The protected completed receipt SHA-256 is
`d8bd0db497ff2312b0803daac8b903e826b511835753c7a020517cd3e5dc06ca`.

Expiry remains **2026-10-31T11:48:23.898Z / 31 October at 18:48:23.898 WIB**.
This operation did not renew or extend the permit and executed no DDL. Carried
usage remains one quote, one forward admission and zero reverse admissions;
remaining capacity remains **1 forward / 2 reverse / 31 quotes**. It created
**zero payments**. All prior rows, including the existing renewal authorization,
were preserved.

Root successfully switched the existing CAS-pinned worker, API and idle-gate
drop-in paths. The new worker configuration SHA-256 is
`f19f6cccf83ceabf021e88a2b14e33fbeb79b3819ebc3506cb6771a479cafe85`;
the old `9bae...` configuration bytes remain backed up. Only the policy pin
changed. Financial release `6ebb11da0fdaa70ccdd35d0c04e5abfe0b256ecc`, its execution
manifest and datastore preload remained unchanged. The switch reused the
existing effective paths, avoiding policy-hash filename ordering.

At **2026-10-30T20:22:05.906669+07:00**, Root's Windows public GET returned
**READY**, the new `1684...` policy, both directions available, **zero active
orders**, and remaining capacity **1 forward / 2 reverse / 31 quotes**. Root also
observed two actual `POLICY_IDLE_CAPITAL_VERIFIED` ticks. These are timestamped
operator observations, not a full stability-window claim or evidence of a
customer broadcast, payment or cross-chain settlement. Later customer activity
may change the counters. This documentation update performs no probe, restart
or actor action.
