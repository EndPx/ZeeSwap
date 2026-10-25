# Bounded testnet worker and public availability

This is local implementation evidence. No policy was issued, capital allocated,
wallet synchronized, transaction signed, service started, or application database
changed by this implementation task. Root operator execution and a real funded
circle remain separate gates. The additional 30,000 zatoshi fee allocation must
come from actual physical backing and a balanced journal; these files never
credit inventory.

The worker holds a dedicated session advisory lease `(84532, 20261026)`. Its SQL
readiness call runs on that same backend. It only selects immutable admissions
for the configured raw policy SHA, refuses unrelated active orders, and passes
one exact order ID to forward, reverse, refund, confirmation or unfunded expiry.
Forward receipt reconciliation now accepts that optional order ID; legacy
callers keep their original global reconciliation behavior.

Admission expiry closes new quotes and acceptance. Accepted liabilities continue
through existing finality, source freshness, operator lock `(84532, 20261023)`,
outbox lease, cancellation, payout exclusion and broadcast guards. The worker
does not enable controls, mint a permit, create a quote, fund a payer, or select
an old global job. An ordinary `CONFIRMING` deposit waits for the actual canonical
ten-confirmation or Base finalized condition before the existing SQL confirmation
function runs.

Physical capital capture runs the existing native SDK under its shared wallet
lock and service identity 986:978 with supplementary groups removed. It performs
an actual sync, lists currently unspent mature Ironwood notes, refuses a pending
calculation, independently checks raw transaction inclusion and decrypted note
identity, rechecks canonical headers, and requires the current independent head
within six blocks of the scanned wallet. It creates no transaction. Both SDK
output pipes are counted while streaming with a four-million-byte ceiling.
The existing owned supervisor reaps the process group before Root writes the
exclusive proof. A new timestamp cannot renew an old SDK observation: admission
uses the oldest actual sync/canonical observation, with a 60-second bound.

The Root capital builder admits only byte-pinned seed evidence checked by the
existing terminal SQL provenance validators, exact settled primary deposits from
this policy, and confirmed own change from this policy's immutable payout
journals. Refund principal is restricted to the same accepted order and existing
refund signing checks. Every current physical note must match eligible provenance
and its exact value; spent opening notes do not reappear as selected capital.
Per-order capture, approval and prepared bytes are exclusive, immutable files.
The builder never recalculates a signed transaction or refreshes a frozen proof.

Before any financial adapter, the worker freezes a Root-only per-policy/order
process context. Missing context with existing planned or signed SQL state is a
hard stop. A restart with a different backend PID cannot rebind the old prepared
state: it requests reconciliation once under the operator lock when the exact
epoch is still unreconciled, exits 78, and requires Root to inspect the original
journal. The service prevents restart on exit 78. It waits for owned children
during a graceful stop instead of racing an outer kill. OS termination, lost
session, unknown broadcast and missing acknowledgements require operator review;
automatic journal/PID rewriting is deliberately unavailable.

The frontend keeps `/health` as connectivity plus its existing strict legacy or
continuation bounds. A separate exact `/availability` decoder accepts only the
safe service-policy fields, rejects extra/private fields and inconsistent ready
states, and expires readiness after 60 seconds. It displays actual remaining
capacity per direction and explicit paused, reconciling, busy, source, worker,
capital, expiry and exhaustion states. An unavailable or malformed readiness
response disables quote submission even when the API is connected. Existing
order recovery remains accessible. No Root capability, owner whitelist, wallet
key, order ID or transaction mapping is included in public availability.

Local verification before independent review:

- API typecheck passed.
- Thirteen focused worker, capital and exact-forward tests passed with zero skips.
- Three additional policy/refund context tests passed in the combined 16-test run.
- A separate real Node import of the policy entry passed without startup output,
  secret loading, SQL connection or wallet work.
- Six actual WSL Linux Python tests passed, including bounded child output and
  timeout, oldest actual timestamps, mature/unspent notes, and the unchanged exact
  Python guard dictionary with an additional prepared policy context.
- Frontend 34 unit tests, production build and all 18 browser tests passed.
  The six new browser cases cover directional exhaustion, dead worker,
  unavailable capital/source, busy state and malformed readiness. The 375px
  ready-state screenshot was inspected; layout and existing visual design are
  preserved without horizontal overflow. Synthetic browser funding does not
  constitute a chain receipt. Four initial existing-browser failures were stale
  health-status text assertions; they were updated to the dedicated availability
  response and the final complete browser suite passed.

The service example is disabled. Its empty `codePins` must be populated with the
exact seven installed files listed by the entry; an enabled config with a missing,
extra, mutable or changed code pin refuses before connecting. Root must pin the
actual policy, installed code,
config and seed proof bytes (copy historical 0640 originals byte-for-byte into
new Root-only 0600 seed files without changing their originals), review the
current canonical audit and balanced
capital allocation, install the reviewed SQL policy/refund opt-ins, verify fresh
sources and the new launch window, and explicitly authorize service startup.
Neither a green local test nor the unit file establishes live admission readiness.
