# Bounded native source refund operator

Recorded 23 October 2026. The new application's refund configuration remains
disabled. Its actual `--once` launch returned `LIVE_SOURCE_REFUND_DISABLED` and
`financialAction: false`. No cancellation, native proposal, signing, broadcast,
refund, intake activation or capital-book update was executed by this work.

The explicit operator is `api/scripts/refund-live-testnet.ts`. Its portable
financial orchestration is `api/src/live-source-refund.ts`; the private native
broadcast fence is `api/scripts/refund-live-broadcast-guard.ts`. They reuse the
existing source-refund SQL/functions and canonical receipt verifiers rather
than the historical G5 refund runner or runtime loader.

## Fixed scope and sequence

Only the new `zee_app_20261023` application, its dedicated worker role, pinned
Base Sepolia deployment and new operator `0x24FA…3087` are admitted. One explicit
forward order is required. The sequence is:

1. With intake and dispatch already paused and reconciliation already clear,
   call the existing `begin_source_refund`. It preserves the confirmed primary
   liability and fences the ordinary payout jobs.
2. Prepare one immutable operator `CANCEL` using the shared new Base journal.
   Persist the original signed transaction in SQL before any broadcast.
3. Observe that original hash and verify canonical finality plus permanent
   contract `CANCELLED` state. Inclusion, an RPC timeout or SQL confirmation
   alone cannot reach native approval.
4. Approve the entire actual source principal and a separate operator-paid
   native fee. The old refund preflight still requires the canonical exact
   cancellation transaction, event, deployment code and terminal state.
5. Prepare/recover one immutable native refund in the fresh capital wallet,
   store it durably, broadcast those same bytes, then confirm the actual
   shielded receipt through the existing ten-confirmation verifier.

Any PAY attempt, confirmed operation, reverse commitment/payout, settled order
or wrong direction refuses the new refund path. The deployed V1 reverse
committed-abort capability remains absent. This operator does not collect a
payer key or automate a reverse EVM refund.

## Ownership and uncertain responses

Each step holds the same operator advisory key as the forward and reverse
workers. Base cancellation uses the shared new Base signer journal and the
owned `base-refund` process supervisor. Native preparation uses the fresh
wallet's global lock and owned `native` supervisor. No old G5 wallet or journal
is used.

The native before-broadcast guard independently verifies the parent PostgreSQL
lock PID, paused refund epoch, source-refund SQL fence, exact approved request,
principal/recipient, stored txid/raw-byte digest, expiry margin and fresh
canonical permanent cancellation. Source checkpoints remain real Chef/Envio
observations; this operator does not run an SDK deposit scan or renew them.

An unknown cancellation response is reconciled using the stored original hash.
It does not invoke a new prepare or automatically rebroadcast; explicit
`--retry-same-bytes` only permits the stored original transaction. Native
broadcast-unknown journals likewise retain their original transaction. An
error stops the operator with the books already paused. It deliberately does
not increment the immutable refund epoch on a transport error; that would make
the original refund record unrecoverable. No step enables application policy.

The runner supports `--once`, graceful stop between complete owned steps, and
a bounded cycle count. No wrapper timeout releases ownership before owned
cleanup acknowledgement.

## Required private source proof

The signing wallet shares the new source viewing account. After a customer
deposit, its note must not be silently admitted as general operator capital.
Before native refund approval, the operator must capture the actual checked
Chef source proof, review its hash and add a `refund-source` entry bound to
this same order to the private capital-source list. The existing capital
admission helper verifies the SQL confirmed-primary identity, matching private
deposit bytes and refund signing fence. It cannot admit another order's held
source funds. Missing approval refuses before immutable native config creation.

The private read-only export helper supplied with the Chef work writes an
exclusive actual source snapshot after finding exactly one customer output;
it does not fabricate a txid, receipt or observation timestamp. This proof is
created only after real funding and remains outside Git. A successful forward
settlement instead requires a separately reviewed `settled-source` approval
before that note can support reverse inventory.

## Checks and limits

Five new tests passed. They cover the CANCEL-finality-to-native-approval gate,
full principal with a separate fee, refusal for paid/committed/wrong-direction
orders, original-hash-only reconciliation after an unknown response, and
refusal to trust a stale SQL cancellation flag. The positive test executes
the existing event/calldata/state/finality verifier against a synthetic
canonical receipt; it is not an onchain refund experiment. API typecheck passed.

The actual disabled private launch passed. Live cancellation, process-owned
native signing, principal-refund receipt and ledger reconciliation remain for
explicit operator execution if recovery is required. No source-refund customer
outcome is claimed complete by these preparation tests.
