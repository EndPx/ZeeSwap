# Fresh native testnet capital

Recorded 23 October 2026. New operator TAZ capital is isolated from the stopped
G5 wallets and from the closed G4 experiment's insufficient remaining capital.
No old wallet funds were transferred to create this capital.

A new signing wallet was created offline in a dedicated owner-only WSL directory
with explicit birthday **4532047**, close to the then-current testnet head. A new
shielded-only Unified Address was derived for the faucet. Its separate UFVK was
exported into protected local storage; seed material was not exported or printed.
The existing live Chef deposit UFVK/project identity was not changed.

The [Valar faucet's maintained repository](https://github.com/valargroup/valar-testnet-faucet)
documents its testnet-only payout, request/status API and NU7 support. Its live
status API reported ready and current testnet height. One authorized, journaled
request for the standard **12500000-zatoshi** faucet payout returned `queued`;
polling that same claim subsequently returned `sent` with a transaction ID.
No duplicate claim was submitted. Claim and wallet identifiers remain private.

The new wallet's actual bounded sync then observed **one external Ironwood note**
for exactly **12500000 zatoshi**, included at height **4532057**. This is an actual
new wallet observation, beyond the faucet's `sent` response. Its independent
canonical/native capital proof and ten-confirmation acceptance were still pending
at the initial checkpoint below.

At observed head **4532060**, the note had four chain confirmations. The new
read-only `live_capital_snapshot.py` capture refused with
`CAPITAL_CONFIRMATIONS_PENDING` and wrote no accepted capital proof. This gate
requires a complete fresh scan, exact approved incoming Ironwood note inventory,
no unknown transparent funds, canonical compact inclusion, full raw transaction
txid verification, independent UFVK decryption, shielded source privacy and ten
confirmations. It never signs, proposes, shields or broadcasts a transaction.

`api/src/live-capital.ts` adds a separate acceptance function for this fresh
capital. Historical fixed 200000-zatoshi capital gates remain unchanged. The new
function conserves explicitly approved allocations: **200000 principal + 20000
fee + 12280000 unallocated = 12500000 physical zatoshi**. The physical remainder
does not automatically become application ledger credit. The operator must review
the exact capital opening before application inventory is enabled.

Local validation: API TypeScript passed; two new TypeScript capital tests and
three Python note-inventory tests passed. Tests reject old/wrong notes, wrong
pools, internal change, duplicates, insufficient confirmations, missing source
privacy and over-allocation. This file records readiness progress, not a funded
customer settlement or an authorization to spend the new wallet's balance.

## Actual matured native capital proof

The later capture passed with **12500000 physical zatoshi**, funding height
**4532057**, fresh scanned height **4532068** and **12 confirmations**. Canonical
compact inclusion and mined raw height matched; the maintained SDK recomputed the
txid and independently decrypted the exact incoming Ironwood output, with
shielded source privacy. The wallet's complete unspent note inventory contained
only this approved note. The accepted private proof stays outside Git.

Before accepting any new application order, intake and payout authority were
consolidated onto this fresh operator account. A separate **viewing-only** wallet
was imported from its UFVK for API receiver allocation; its allocator advanced
past the faucet receiver before API use. The signing wallet remains separate
storage. The prior G1-backed current Chef follower/HTTP reader were stopped, and
the historical Chef evidence namespace was retained.

The new account's Chef namespace uses explicit birthday **4532047**, before its
faucet receipt. Only the audited opening capital occurrence is excluded from
customer deposit ingestion. Exclusion requires the exact txid, pool, output index,
amount, canonical receiver, height and block hash, plus immutable private proof
digest. Every live occurrence still undergoes full independent canonical/native
classification first. All covered block headers remain in the observer snapshot;
other outputs remain customer candidates, including another output in the same
transaction. A changed exclusion field refuses processing.

Actual new-account Chef ingestion and application SQL observation passed through
**4532086**: **one exact opening-capital occurrence excluded**, zero customer
outputs, zero eligible operations and zero quarantined outputs. Existing SQL
checkpoints and canonical history were preserved. No inventory activation,
signing, shielding, customer funding or settlement was performed by this step.
