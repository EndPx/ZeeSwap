# Physical wallet capture diagnostics

Date: 2026-10-15 UTC. Status: bounded diagnostics and the separate pending SDK
capital proof passed local checks and root's configured read-only probe. The
initial diagnostics increment passed four TypeScript and ten Python checks; the
final pending-route suite passed fifteen Python checks. Root subsequently passed
its combined 29 TypeScript checks and API typecheck. The diagnostics increment
changed no financial validation, journal state, wallet balance, signing or
broadcast policy; the separately described pending route reports locked capital
without inventing spendable cash.

The actual R4 SDK interruption reached the expected durable marker and original
PREPARED export. Its first strict recovery attempt stopped during the fresh held
physical partition capture at 17:48:58 UTC. The old parent discarded child stderr
and retained only `G5_PHYSICAL_CAPTURE_FAILED`. Root's separate read-only probe
then identified the existing confirmed-zero-change authority guard as the refusal
point. A PREPARED transaction does not satisfy DELIVERY_CONFIRMED. This increment
does not change that guard or claim recovery has passed.

The Python capture now emits an exact static packet containing phase, a closed
error code and, for wallet-specific work, only an even sequence 2 through 20,
`deposit` or `fee`. Global configuration/partition failures omit wallet identity.
Thread-local context keeps parallel wallets distinct. It never emits exception
messages, private file paths, provider URLs, UFVKs, note JSON, memos or raw bytes.
SDK exit failure, timeout, JSON parsing, missing file, permission and other capture
refusals have separate static classifications. These classifications do not
convert a failure into a wait or authorize a retry.

The original failure packet is emitted before lock cleanup can fail. Cleanup has
a separate LOCK_RELEASE phase. Diagnostic emission is best effort and cannot
replace the original error. The parent bounds stderr in memory, accepts only the
exact packet shape and closed vocabulary, retains the first substantive primary
and at most three secondary packets, and attaches only that sanitized structure
to its existing failed-capture error. The private G5 diagnostic applies the same
strict sanitizer again. Raw stderr is never attached or persisted.

The existing SDK timeout behavior still retains the viewing-wallet sentinel.
Other capture failures retain their existing lock-release behavior. Successful
capture proof, freshness, exact capital selection and all accounting assertions
are unchanged.

## Verification

Four TypeScript tests passed, including a real synthetic failed child process:
primary/cleanup retention, a three-secondary bound, exact wallet/phase/code
validation, hostile raw-output exclusion and private diagnostic persistence.
Ten Ubuntu Python tests passed, including the prior seven physical-capture
checks and three new checks for static packet privacy, a real missing-config
failure with sequence identity, and primary-before-cleanup failure ordering.
The first expanded TypeScript invocation ran from the repository root and failed
to resolve the API-local tsx package; rerunning from the API directory passed.
API typecheck passed. No SDK, live database, signing or broadcast was invoked by
the coding agent. A separate review and proof are required for any PREPARED-only
locked-capital reconciliation route.


## Separate pending SDK fault capital proof

After root confirmed the actual SDK note shapes, a distinct fourth-wallet route
was added for the known durable interruption with journal state PREPARED. The
existing DELIVERY_CONFIRMED zero-change gate is unchanged. This route recognizes
an input locally locked by the original calculated transaction; it does not
claim that the input remains spendable or that the destination was delivered.

The route requires the exact approved request, one 110000-zatoshi Ironwood input,
PREPARED original bytes, one-shot durable fault marker and raw SHA-256, exactly
one matching current SDK recovery export, the three pinned SDK/reader/verifier
binaries, independent Rust raw validation and incoming capital UFVK decryption
of the exact internal zero output. It accepts exactly two actual wallet notes:
the approved positive input confirmed at its source height with the original
transaction named as its calculated spender, and the original internal zero
with the observed calculated-height status. Unknown, duplicate, positive
unspent, other-spender or confirmed-output shapes refuse this route.

Actual read-only provider checks require the correct network/branch, a fresh tip
within six blocks of the actual scan, twenty blocks of expiry margin relative
to that provider tip, canonical parent compact-block membership, a canonical
parent reread and two strict gRPC NOT_FOUND observations of the original payout.
A known original transaction, transport error or ambiguous absence is refused.
The marker and journal must remain unchanged. The helper reuses the capture's
already-held wallet lock and makes no adapter execute call or journal transition.
It invokes only the existing SDK recovery export; it never calculates a new
transaction or broadcasts.

The output retains actual `notes: []` and `spendableZatoshi: '0'`. It reports the
separate `pendingLockedCapitalZatoshi: '110000'`, exactly one pending calculation,
authenticated zero metadata and a versioned `pendingSdkFault` proof. Only the
literal SDK-fault recovery validator may interpret that locked amount. Ordinary
wallet cash validation must not treat it as available capital.

Fifteen wallet-capture Python tests passed: the prior ten checks and five new
pending-route checks, including many negative marker/raw/export/independent
verification, note/status/spender, ciphertext and provider-proof cases. The
explicit provider-tip expiry regression uses scanned height 100, provider tip
106 and expiry 125, which must fail despite satisfying a scan-based margin.
Independent static review passed. Root's configured read-only physical probe
passed at 18:02:30 UTC, reporting actual spendable zero, 110000 zatoshi locked in
the original pending calculation, one pending calculation and strict original
NOT_FOUND evidence. This proof did not broadcast or mark delivery.

The full bounded SDK recovery subsequently passed at 18:05:06 UTC at epoch 8,
without broadcast or SQL payout import. The separate ordinary recover-zcash
import then passed, followed by root's exact original SQL hash comparison at
18:06:40 UTC. These are scoped recovery/import results. R4 delivery, a fourth
settlement and five-order barriers are not claimed here. See the
[funded SDK fault evidence](g5-funded-sdk-fault.md) for the full acceptance
boundary and actual execution distinction.
