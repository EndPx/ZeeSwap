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
- Subsequent original-metadata permission compatibility checks: twelve focused
  tests passed. API metadata visibility checks: two passed. Final idle-only
  keepalive and financial-boundary regression: 27 passed; API typecheck passed.

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

The following records the actual deployment and readiness observation. It does
not claim a newly funded fast-path end-to-end settlement.

The inclusion DDL was committed on the actual primary as transaction `539976`.
The original financial snapshot and control row were unchanged. Root's first
resumption attempt `540535` was independently confirmed aborted after its
capital observation expired; it was not replayed. A new finite attempt placed
the expensive deployment reads before the native capture and committed as
transaction `542721`, advancing only reviewed runtime control to 244 and adding
the immutable resumption grant. Original financial rows and budgets were
verified unchanged. Native observation age at the successful commit was 8.539
seconds. No signer, broadcast or financial worker start occurred in that
publication.

Resumption authorization SHA256:
`efc9f224b5d53f51f1a378fc36e854fd5667cab7e4009f2095b96646aeef485a`.
The initial reviewed candidate used 155 actual code pins. The final financial
release uses 156, preserving the original approved supervisor bytes as a
separately pinned native artifact. The first preparation candidate was never
activated. Compatibility corrections preserve the existing isolated directory
ownership and hash-pinned original signer metadata permissions; neither Source
service was restarted or modified for these corrections.

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

## Actual public readiness

The final financial release is commit `34373fd82fc3b42ff13ff52a6c11d32b24635a11`;
the separately isolated API release is
`5d08b3d9a0ca2f420c4991ce7fad73754aed8f96`. The API retains UID 986 and reads only
the Root-owned, group-readable execution metadata prepared for it. Worker
approvals and new signer configuration remain Root-only. Original configuration
bytes, host permissions, wallet locations and private financial journals remain
unchanged.

The final worker started at 09:38:08 WIB through its exact once-only closed-book
check, then recorded genuine `POLICY_IDLE_CAPITAL_VERIFIED` samples. Its new
idle-only wait path retains old proof timestamps and performs no readiness
heartbeat when a recognized observation expires or a proven temporary read
fails. Financial member handling and ambiguous-broadcast fences remain intact.
The earlier worker's exact exit cause was not established; the new fatal log
contains only finite diagnostic codes rather than private exception text.

At 09:39 WIB, actual public `/health` and `/availability` returned HTTP 200 and
`ready`. Both swap directions were available, no order was active, and the
unchanged policy reported one forward slot, two reverse slots and 25 quote
issuances remaining with `lifetime: nonexpiring`.

A fresh headless browser opened the actual public interface. It verified the
deployed `index-CDE-V-CE.js` bundle, both enabled quote buttons, fast-mode help
copy and removal of the old wallet integration, with zero page errors. It used
GET/HEAD only: no quote, acceptance, wallet approval, signature or payment was
created. Assets were published to the permanent store before the HTML switch;
old assets were retained and `nginx -t` passed. The frontend HTML SHA256 is
`995d4a943a182198c61c416fc0badfe4d6ce7742c153337a974cdea31ce4b073`.

The original future unsigned restart guard was restored after the one-time
start, and the existing supervision timer was restored with the new worker pin.
A public bridge funded circle remains unavailable; its fast implementation
does not manufacture public bridge readiness.

The 09:42:36 WIB follow-up still reported the same financial MainPID, active
API and public `ready` response with unchanged remaining capacity. Eight genuine
idle-capital samples were recorded from 09:38:36 through 09:42:15. The restored
supervisor reported `WATCHDOG_WAIT_EXISTING_WORKER`, with no actor action. This
is a bounded live observation, not an uptime SLA or proof that a particular
temporary network failure occurred during the observation.

The three disposable PostgreSQL test databases were dropped after their tests
and rollback checks. The primary application database and global roles were
not changed by that cleanup. Protected operator evidence and backups remain
outside the public repository.
