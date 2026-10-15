# R4 pre-COMMIT initialization read timeout

Status: root's explicit operator invocation passed at approximately 17:14 UTC
on 2026-10-15. It reported
G5_R4_PRECOMMIT_READ_TIMEOUT_CONTROLLER_RECOVERED_PAUSED at epoch 6, with three
settled orders and the same finalized R4 source held READY. Main state was
unchanged, no new payment was made, and the controller remained at PREPARE_COMMIT.
The implementation agent did not execute the alias or any wallet operation.
The subsequent normal operator invocation signed and broadcast the original
COMMIT. Root's read-only check at 17:17 UTC found canonical success, nonce 11,
block 48158125 and a fee of 749720000158 wei, including 158 wei L1 fee. Base
finality remained pending. This confirms commitment inclusion; the funded SDK
fault, shielded delivery and fourth settlement remain separate operator gates.

After the successful original-source recovery, normal observation returned
READY and the controller reached PREPARE_COMMIT. The next child stopped during
initialization with the recorded G5_REVERSE_INIT_SLOT / ETIMEDOUT packet at
`2026-10-15T16:56:30.903Z`. Its retained frames identify private configuration
reading in g5-context/g5-slot before the signing/body phase. R4's body failure
and current-lease fields remained empty. This establishes the observed
initialization read boundary; it does not establish a deeper host/transport
cause or authorize skipping any signing fence.

`recover-r4-precommit-startup` reuses the already reviewed finalized-original
funding, HELD/READY ledger, original three receipt paths, twelve-wallet physical
proof, global raw journals, migration-byte pins, nonce checks and final CAS
from [the source-finality-wait recovery](g5-r4-funding-wait-recovery.md).
It does not introduce another financial recovery model.

The additional guard requires the literal existing run and fourth controller
slot/inflight at PREPARE_COMMIT, its retained source READY acknowledgement,
the action-failure marker, and that exact initialization packet's timestamp,
step, phase, errno, class and original four source frames. A different failure,
signer phase, timestamp, acknowledgement or controller stage is refused. The
original diagnostic is included in the private file pins and rechecked at CAS.

Full proof must still find the same single finalized original payer fund,
nonces `11/11` and `8/8`, zero R4 COMMIT/shielded raw/signing/approval effects,
an unleased PLANNED operation, exact held reserves and unchanged operator
expenses. The ordinary original-source observation may be replayed idempotently
in process; no funding, signing, broadcast or quote is repeated. Main incident,
reconciliation and paused control state are retained.

Only the controller incident/inflight latch clears after proof. Its stage stays
**PREPARE_COMMIT**, with the source READY acknowledgement and first three DONE
slots retained. This does not force a return to source observation, manufacture
COMMIT finality or skip the normal preparation/nonce/lease checks. Any signed or
unknown new raw causes refusal rather than a replacement transaction.

Eight scoped R4 guard/accounting/local-save checks passed, including two alias
checks for the exact recorded startup failure, negative altered diagnostics and
phase cases, and preservation of PREPARE_COMMIT after an audited local clear.
API typecheck and diff checks passed. Root also independently reran thirteen
alias/private-transport checks before its actual invocation. These local tests
are distinct from the successful operator recovery recorded above. The
controller remains limited to one active
order through the planned funded SDK fault; four-active scheduling still needs
its original-raw preparation-priority verification.
