# Bounded public bridge pilot preparation

This records code and local verification prepared on 29 October 2026. It does
not establish a funded bridge circle, public activation, installed-wallet
acceptance or completed G6. Actual capital, signatures, submissions, receipts and
operator activation belong in separately recorded execution evidence.

## Authority and finite admission

The separate `ROOT_PUBLIC_BRIDGE_PILOT` permit is Root-owned, group-readable and
raw-SHA pinned. It binds the dedicated database/role, contract/runtime, native
reader profile, original qualification permit and exact qualification orders.
The policy permits arbitrary supported user payer/recipient addresses, exactly
100,000 atomic units per transfer, one accepted order per direction and one active
order. Pending native delivery and pending Base acknowledgment remain active.
Public counters do not reuse or reset operator qualification counters.

`FundedBridgeCircle` independently rereads the actual qualification mint, burn
and ACK through both Base providers. It obtains the original canonical native
receipt and decrypts the delivered output with a separately protected recipient
UFVK that must differ from the bridge signer. The literal deployment, empty
book, prepared status flag or operator outgoing recovery alone cannot open the
public writer. Its short historical-proof cache preserves the exact circle and
Root bindings; each current order's source and physical capital remain fresh
independent reads at financial seams.

Admission uses normal `BridgeService.quote` and `accept`, exact capability and
idempotency semantics, fee reservation, coverage and source gates. New quotes and
acceptance stop at permit expiry. Original accepted liabilities retain their
scope and fresh proof requirements after expiry. Another permit cannot silently
reset the persisted budget.

## Runtime and public surface

`public-pilot.ts`, `public-worker.ts` and `public-http.ts` reuse the bridge
repository, model, service, durable worker, Base signer and native adapter. The
dedicated launcher is `api/scripts/serve-bridge-public-pilot.ts`; it listens only
on loopback port 3032. Nginx routing remains a separate operator action.

The public surface contains aggregate status and capability-scoped quote,
acceptance and original-order reads. It exposes no evidence, signing, control or
capital-mutation route. Writes require the configured frontend Origin, JSON body
bounds and rate limits. Financial requests execute fresh authority checks.

The status cache serves already verified aggregates promptly enough for the
browser's status timeout. It retains original chain observation times, expires
within 45 seconds and never outlives the 60-second paired-observation limit.
Financial/policy changes invalidate it immediately; expiry disables admission.
There is no cached authority to sign or pay.

The finite worker scans at most 1,000 Base blocks per tick in intervals of at
most 200 blocks, with independent canonical log equality, persisted seam hashes
and full receipt verification. A published cursor is not readiness. Native
observations, mint, authenticated burn, original native delivery and opaque ACK
remain distinct transitions. Broadcast uncertainty is journaled before network
I/O; subsequent ticks reconcile the original rather than submit it again.

Native confirmation discharges customer principal and enters
`NATIVE_DELIVERED_AWAITING_ACK`. Actual Base unpaid principal equals economic
unpaid principal plus separately reported pending acknowledgments. Only a
verified Base ACK yields reverse `COMPLETED`; its public evidence commitment is
salted and opaque. CANCEL/refund production signing remains refused.

## Database and process boundaries

Bridge actors use the separate bridge-only TLS helper. It accepts only the
explicit VPS PostgreSQL primary on `127.0.0.1:55435`, the dedicated bridge database
and role, a pinned Root-owned CA and the approved cluster system identifier.
Every physical pooled client verifies actual database, role, TLS and cluster
identity before business queries. It does not fall back to Neon or alter Main's
relocation authority.

Native financial calls require a pinned `owned_wallet_call.py` supervisor. Its
bridge mode reuses the existing Linux subreaper, finite deadline and positive
process-group cleanup. The Node parent does not abandon a proving descendant by
killing only its Python parent. Independent signed-byte and UNKNOWN journals
retain their original recovery boundaries.

## Verification recorded

All tests below use synthetic financial boundaries unless explicitly named local
Anvil or filesystem/process checks. They are not funded testnet settlement.

| Check | Result |
| --- | --- |
| Combined API bridge core/runtime/reverse/authority/journal/public suites | 65 passed, zero skips |
| Invocation-owned actual local Anvil adapter suite | 9 passed, zero skips |
| Linux bridge protocol/native/read plus owned-process suites | 43 passed |
| Web bridge protocol and pilot metadata tests | 16 passed |
| API and web TypeScript checks | Passed |
| Web production build | Passed |
| Strict UTF-8 check of owned bridge files | Passed |
| Scoped diff whitespace check | Passed |

The Anvil burn case ends with an actual contract burn and an unpaid synthetic
native obligation. It does not fabricate a native delivery. Public-policy tests
explicitly substitute synthetic circle dependencies to exercise exposure and
HTTP faults; production construction uses the concrete live verifier.

Actual Root execution must still provision and qualify the fee notes, finish the
operator-funded circle with independent recipient confirmation, install the
pinned primary configuration and permit, and verify public frontend admission
against the live backend. Code or green local checks do not complete those gates.
