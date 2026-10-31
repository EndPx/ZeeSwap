# Closed-service dynamic journal qualification

31 October 2026. Read-only Root qualification of journals created by subsequent
completed swaps. This does not authorize signing, payout replacement, order
reset, reserve release, budget changes or Source mutation.

The finite authority retains every reviewed legacy file hash. A later completed
order may add files only when its complete closure can be reconstructed from
the current SQL books and original protected journals. Existing baseline files
must remain byte-for-byte unchanged. All four approved roots are required:
Base signer, reverse orders, refund orders and the exact policy's process orders.
Wallet directories and other roots are refused before traversal.

New orders require terminal `SETTLED` or `REFUNDED` state, original policy
admission/process binding, authenticated encrypted quote and terms, and the
complete signed-phase and receipt evidence. Base filenames are derived from
SHA-256 of the public settlement identifier. Original raw bytes, transaction
hash lookup, nonce and maximum cost must match authenticated SQL payloads.
Typed authorizations and transaction signatures are checked against the exact
operator, contract, chain and calldata. Canonical SQL receipt anchors must be
at or below the scanner's actual finalized checkpoint.

Reverse payouts and forward refunds additionally require the original
`DELIVERY_CONFIRMED` native intent. Its prepared bytes equal the authenticated
SQL prepared payload; request, digest, amount, recipient, fee, shielded output
conservation, confirmation block and receipt must match. Approved/prepared/state
files and referenced preflight, guard, capital approval and proof files are
bounded and hashed. Unreferenced files, incomplete intents, pending receipts,
missing phases and unknown entries refuse qualification. Even when every file
for a new terminal order is missing, SQL-derived closure still requires that
order's evidence; an empty inventory cannot hide missing journals.

A reverse refund signed by the external original payer does not require an
operator private signing journal. It instead requires the authenticated
original signed transaction in SQL, its recovered payer matching the immutable
funding terms and quote, exact refund calldata and canonical final SQL receipt.
An available operator-owned journal remains checked exactly. Missing original
SQL bytes or insufficient receipt identity fail closed; no payer journal or
signed transaction is fabricated.

The helper returns a digest of the actual bounded inventory. The caller retains
the closed-books, no-worker/no-lease, current-generation, source freshness and
independent canonical recheck gates. It repeats journal qualification and binds
the resulting digest into the recovery proof. This helper never clears
reconciliation itself.

Local verification passed four grouped synthetic tests covering a legitimate
second forward settlement, a reverse settlement, a forward refund and an
external-payer reverse refund, plus missing-all-journals, pending SQL,
noncanonical receipt, missing phase, raw mutation, wrong hash lookup, unknown
file, incomplete native intent, changed receipt, omitted root and immutable
baseline mutation rejection. API typecheck and `git diff --check` passed.
These are local fixtures, not new testnet receipts or live settlement claims.
