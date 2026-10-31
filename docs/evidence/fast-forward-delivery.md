# Fast Zcash to Base delivery

The user approved continuing from a successful canonical Base L2 reservation
directly to PAY, then observing finality after delivery, on 31 October 2026.
The user subsequently explicitly extended the fast Base inclusion policy to
both swap directions and bridge transactions, accepting operator reorg risk.
Zcash confirmation thresholds and final accounting remain separate gates.

## Acceptance boundary

- Keep observed inclusion separate from finalized confirmation. Never advance
  `finalized_height`, mark an included receipt finalized, or discharge customer
  liability on inclusion alone.
- Authenticate the original signed transaction, exact contract event, recipient,
  amount, immutable terms and canonical block. Recheck the live reservation
  immediately before preparing and dispatching PAY.
- Reuse the original signed bytes and durable journal on retries. Reject a
  missing or changed observed receipt and reconcile before another financial
  action.
- Retain both finalized original receipts for final settlement and exact fee
  accounting. Keep held reservations until that final accounting succeeds.
- Show successful PAY inclusion as delivered while finalizing. A signed or
  pending transaction does not prove delivery.
- Preserve the current funded worker, lease and process binding during the
  change. Any successor starts only at a separately checked idle boundary.

## Implementation and verification

Forward dispatch stores RESERVE and PAY inclusion in a separate encrypted
observation table. Exact original transaction, calldata, event and canonical
block checks precede dispatch; final receipt confirmation and the existing
accounting remain separate. Reverse dispatch likewise records FUND, COMMIT and
SETTLE inclusion without setting the original confirmation flags. It refreshes
the original FUND and COMMIT before native dispatch. A protected Root execution
approval and native script overlay retain the original policy, wallets,
capital provenance, journals and budgets.

The public API exposes included delivery separately from finalized delivery.
The frontend labels completed Zcash source depth as `Confirmed`, successful
USDC inclusion as `Delivered · Finalizing`, and Base source inclusion without
claiming source finality. Bridge implementation and its independent activation
boundary are documented in [Base L2 bridge execution](base-l2-bridge-execution.md).

Checks completed before deployment:

- Focused API regression: 25 tests passed, including actual transaction/event
  validation, included FUND/COMMIT, forward PAY selection and same-byte retry,
  execution approval, native scope and API projection. API typecheck passed.
- Two schema-only PostgreSQL fixtures on the existing VPS passed. Each exercised
  eleven boundary groups: permissions, canonical identity, stale observations,
  fee caps, inclusion versus finality, duplicate attempts, final accounting and
  changed-receipt reconciliation. These fixtures copied no live rows and made
  no global role changes. An initial fixture harness needed its ESM package
  metadata and schema-owner import corrected before the successful runs.
- Web unit tests: 88 passed; web typecheck and production build passed. Four
  browser cases covered 375, 835 and 1440 px forward progress plus nonfinal Base
  source inclusion on the reverse route. Browser observations were synthetic
  fixtures, not funded swap evidence.
- Ubuntu 24.04 native profile/preflight tests: 19 passed; reverse signer tests:
  six passed. Forward signer tests: 16 passed.
- Final combined API regression after native overlays, one-time launch checks,
  epoch separation and transient read handling: 39 passed, zero skipped. API
  typecheck passed. A dedicated PostgreSQL execution-resume fixture additionally
  passed thirteen checks against a private copy of the closed data; all test
  mutations rolled back. Unlike the two inclusion fixtures, this last fixture
  contained copied encrypted closed records and remains private.

## Existing user payment

During implementation the original worker continued the existing user order
under its original finalized-only rules. An independent RPC verified successful
canonical PAY inclusion with exactly 100,000 token atomic units delivered to
the original quoted recipient. This is real testnet delivery evidence for the
original worker; it does not establish a funded execution of the new fast path.
Private order mappings, receiver data, memos and raw receipts remain outside Git.

The original worker stopped at 08:17:17 WIB and the existing restart guard
correctly refused a funded-process handoff. Its public log did not expose the
underlying exception; no SQL error was found near that exit, so the exact cause
is not established. At the subsequent check both independent RPCs covered the
original PAY with actual finality. Root reconciled that one persisted receipt
through the original receipt observer, without constructing a signer or
broadcasting. The order became `SETTLED`.

The independent closing postcheck verified both finalized original receipts,
their canonical blocks, original raw transaction journals, exact quoted token
transfer and fees. All three reservations were released, the liability was
discharged, and each asset's order ledger balanced. Actual combined Base fees
were 4,675,180,003,930 wei. Protected closing proof SHA256:
`c549cced9f871158e6c2eb86035f16f711f8632d4f44df388dffc7df008ffd8a`.

## Live activation

Publication, migration and activation evidence is recorded here after the
reviewed deployment. No fast-path activation or completed fast-path end-to-end
execution is claimed by the checks above.

The original worker's pause advanced runtime control monotonically from 242 to
243. The reviewed resumption retains the immutable policy and accepted epoch
242 while authorizing effective execution epoch 244 through a separate immutable
Root record. Existing budgets, admissions, quotes, grants and financial rows
remain unchanged. This is a finite publication and one-time idle start, not a
new service expiry or permission to hand over a funded process.

The one-time launch checks exact closing table digests, source freshness,
physical quiescence, receipt review, code and private configuration pins. API
admission must be held during capture and start. The original unsigned restart
guard remains separate. Temporary proven idempotent Base RPC read failures can
return a bounded wait; ambiguous broadcasts, identity failures, SQL errors and
reorganizations retain their reconciliation fences.
