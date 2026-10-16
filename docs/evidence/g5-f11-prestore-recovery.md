# F11 original PAY28: interruption before SQL storage

Driver76975 stopped at F11 `DISPATCH` on 2026-10-16 at 05:45:18 UTC. The
retained body error is `STALE_SNAPSHOT`, with the call path through
`base-observer-read-retry.ts`, the archive source observer, and the
post-prepare refresh in `base-settlement.ts`. This is a separate incident from
the earlier generic signer failure and its completed epoch10 EMPTY recovery.

The production dispatch order is preparation, prepared-transaction validation,
observer refresh, lease check, SQL storage, and only then transaction lookup or
broadcast. A failure in that refresh can leave a durable original raw outside
SQL. It is not an empty signer operation, and neither a replacement transaction
nor a generic incident clear is permitted.

## Retained actual boundary

Root captured the new incident at 05:48:59.939 UTC. SQL reconciliation was
required at epoch11, service controls were false, and main/controller were
frozen. The first ten executions remained settled and ordinarily verified,
with barriers `[5,10]`. Fourteen current funded orders plus the two archived
unfunded predecessors retained sixteen accepted orders, fourteen deposits and
operations, and forty-eight reservations.

F11 retained confirmed RESERVE25 and no SQL PAY. F13's original RESERVE27 had
now been confirmed by normal reconciliation, with its exact fee, receipt
anchor and authorization flag. R12's original COMMIT26 remained
SQL-unconfirmed. R14 still had no operator attempt. All four active orders were
READY. These are the new captured books; the prior EMPTY recovery's
SQL-unconfirmed F13 profile is not reused.

Root's 05:49:03.661 UTC directory capture contains65 operator non-lock files
and complete raw/hash transaction records at nonces0 through28, with no
temporary files. The payer capture contains eight original records at
nonces5 through12. Complete live directories additionally include the exact
empty regular OS locks, giving66 operator and9 payer entries. Every baseline
file, including the original PAY28 journal and authorization/typed files,
remains immutable.

The captured stack establishes the stale-snapshot refusal site. The detailed
timing explanation for why that captured source became stale is separate from
this recorded error and must be supported by root's timing evidence. A later
successful read cannot renew the earlier captured timestamp.

Root's read-only PAY28 proof passed at 05:54:56 UTC using the production
prepared-transaction validator against the exact SQL terms, original
authorization and nonce28 raw/caps. The actual viem transaction and receipt
lookups both returned NOT_FOUND, operator latest/pending nonces were28/28,
F11 state was RESERVED at a pinned canonical head, and SQL PAY remained absent.
No signing or broadcast occurred. This is a separate preflight observation;
the recovery must capture fresh proofs again before its clear.

## Recovery scope

`api/scripts/g5-recover-f11-prestore-pay.ts` is a separate literal epoch11
operator. It requires the explicit manifest, controller configuration and fixed
new incident artifact. The earlier epoch10 EMPTY guard is unchanged.

The operator validates PAY28 using the production `validatePrepared` boundary
with the original protected F11 terms and authorization signature. Raw hash,
nonce28, chain84532, destination, exact PAY calldata, zero value, signer, gas
and fee caps must match. The fixed viem client must independently return actual
`TransactionNotFoundError` and `TransactionReceiptNotFoundError` for that
original hash. Returned transactions/receipts, timeouts, other provider errors,
or errors with merely forged names refuse recovery. Latest and pending nonces
must both remain28 for the operator and13 for the payer.

All earlier original EVM transactions through nonce27 must be canonical and
finalized. Final/latest F11 and F13 reservation records must match their fixed
recipient, amount and deadline. R12/R14 funding, exact SQL deposit bindings,
retired leases, source/admission files, seven source notes, twelve-wallet
partition, both archives, fourteen migration hashes, and complete directory
bytes are revalidated. R12/R14 remain unapproved for a Zcash payout without SDK
intent/result/crash artifacts. No old lease is made live.

This operator performs no receipt import, SQL raw storage, signing, source
funding, SDK calculation, broadcast or deadline change. Financial books must
remain byte-identical to the new retained snapshot. It preserves the original
PAY28 raw for the normal prepare path to return on replay; it does not prepare
another raw or allocate another nonce.

The charged SQL fee subtotal stays32405480003215 wei. Known included physical
fees stay39942160003747 wei: the active originals25/26/27 account for
7536680000532 wei, while the unbroadcast PAY28 has no actual gas expense or
destination principal debit. Physical inventory and held/reserved capital are
the same as before this interruption. No fictional PAY charge, liability
discharge or settlement is added.

Durable `PROVED`, `DB_CLEAR` and `COMPLETE` phases retain the exact original
states and derived clear. Mixed owned local-file states resume by re-freezing
before restoration; foreign state is refused. Near-CAS transaction absence and
nonce checks capture their actual observation time before the later signer
quiescence IO. That packet and the final quiescence packet are persisted in the
intent. Freshness is checked again immediately before the control update.

A successful clear retains F11's `DISPATCH` priority and all fourteen stages,
first-ten flags, both archives and barriers. It does not claim a payment,
settlement, additional verification, barrier15/20 or completed G5 run.

## Verification

- Nine new TypeScript tests passed: literal epoch11 scope, exact new books,
  money/source conservation, physical-fee distinction, preserved same-order
  priority, refreeze-first local saves, mixed-state durable continuation,
  genuine viem NOT_FOUND versus unknown/known outcomes, and the production PAY
  validator against an ephemeral fixture's original raw/signature/call/caps.
- Five shared quiescence tests passed, including the new65-plus-lock66
  directory shape and a regression proving the older64-plus-lock65 EMPTY
  wrapper remains strict.
- All seven earlier EMPTY recovery tests still passed. The combined affected
  TypeScript run passed21 tests, and typecheck and diff checks passed.
- Synthetic cryptographic fixture signing was local test data only. No live
  transaction, signer, wallet, SDK or financial database action was performed
  by the coding agent.

## Actual recovery and independent postcheck

Root's bounded recovery60395 completed at **2026-10-16 06:07:10.546 UTC**. It preserved the original PAY28 unbroadcast and outside SQL, with no receipt import, signing or new SDK calculation. The recovery intent reached COMPLETE.

The independent postcheck at **06:07:29.294 UTC** proved all economic books byte-identical to the new05:48 incident capture: sixteen accepted orders, forty-eight reservations/twelve held, four HELD source obligations, fourteen operations and zero LEASED jobs. Ten ordinary receipt verifications and barriers[5,10] remained unchanged, as did both archived predecessors[7,13]. SQL PAY11 remained absent, R12 COMMIT remained unconfirmed, and F13 RESERVE remained confirmed. F11 retained priority DISPATCH. Reconciliation, intake, dispatch and main/controller incidents were false at epoch11. A separate post-recovery filesystem comparison proved all66 operator and9 payer entries unchanged, including their retained bytes; normal status passed at06:08 UTC.

The grouped milestone passed **40 distinct TypeScript tests**: sixteen pure anchor/retry/diagnostic checks, three disposable schema14 database regressions, and twenty-one recovery/compatibility checks. Typecheck and diff checks passed. The initial database run passed18/19 because a fixture lease prevented the new test from reaching PAY preparation; the fixture-only correction was followed by a successful3/3 focused rerun. This was not a production runtime change.

This recovery is permission for normal same-original continuation, not evidence that PAY28 was broadcast or paid. Ordinary progress remains10/20. Ten further settlements, barriers15/20, close and broader G5 acceptance remain open. The prior generic signer failure's historical cause remains UNKNOWN; the later STALE_SNAPSHOT refusal is separately recorded.
