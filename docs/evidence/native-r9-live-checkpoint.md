# Native prefunding profile correction on the VPS

Recorded 24 October 2026. This is operator evidence for the isolated new testnet
application, separate from the intentionally stopped historical G5 run.

Root published and verified commit `27ae3e88a4f1dccfae997af97d5d81254141bb14`
before installing its strict eight-field Python binding validator. Comparing the
generated configuration with the previous handoff showed changes in only the
reverse and refund profile loader pins. The operator profile changed only those
two configuration hashes, the published source commit and the confirmed stopped
writer timestamp. Original binding, opening proof, viewing key, encrypted
credentials and four wallet/journal transport inventories were preserved.

Root stopped the new API, application observers and isolated source producers,
verified zero main/control PIDs and empty unit groups, and archived the original
metadata and private state before replacement. Read-only checks verified the
original wallet-copy bytes, four capital accounts, eight opening entries, zero
customer books/leases and operator latest/pending nonce zero. Controls remained
paused at epoch zero with reconciliation required. No new ledger opening or SQL
financial mutation was performed.

The actual native Linux handoff check passed, then wrote a new root-owned
prefunding relocation proof while customer books were still empty. The prior
proof remains archived. A fresh subsequent check confirmed identical encrypted
Envio admission bytes and identical application checkpoint digest. The separately
reviewed receipt transformation changed only two Envio profile hashes and the
bootstrap receipt's handoff hash. It did not reset admission, producer generation,
projection, history or any signing/recovery journal.

The actual Python loader then loaded the new profile successfully as the service
user, without calling a wallet. The API, source query/export and producer engine
were restarted. Loopback API health returned 200 with the original one-order-per-
direction and 100000-atomic-input bounds. The guarded source follower resumed
only after its old proof/config were archived, its previous group was absent,
and a new canonical checkpoint was captured and pinned. The old source journals
were retained.

After this final prefunding handoff, root ran the read-only native capital warmup.
The SDK child was observed with all UID identities 986, all GID identities 978
and no supplementary groups. It completed with the original physical
12500000-zatoshi note verified, scan height 4535446, positive owned-group cleanup
and zero created transactions. Its peak unit memory was approximately 78.3 MiB.
Wallet scan files were written by the service identity; the private result proof
was written by the root parent. This is an observed warmup receipt, not a claim
that its timestamp will remain fresh for later activation.

At 09:34:33.256 UTC, authenticated Chef status showed checkpoint 4535484,
observed head 4535485, ready state and available source. This establishes actual
core catch-up at that observation. The first application historical-recovery
attempt subsequently refused `INVALID_RANGE` before SQL publication: a historical
selection preceded the current producer undo floor. Its correction must retain
the real floor and use an explicit historical checkpoint witness. Normal source
range guards must remain unchanged.

The source gap left by the controlled pause also requires explicit bounded Envio
application recovery. Retained historical rows were independently confirmed in
the producer views. Neither a fresh producer nor API health closes that consumer
gap. Both complete-gap publications, a simultaneous five-minute source/SQL
window, fresh capital preflight, explicit activation and the new funded circle
remain separate gates. No new customer signature, source payment, payout or
cross-chain settlement is claimed here.
