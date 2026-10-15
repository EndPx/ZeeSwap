# G5 bounded alternating testnet runner and opening capital

Date: 2026-10-15 (Asia/Jakarta). Starting revision:
`80a920d9377acbc884facc5654159032842dc683`.

The dedicated G5 operator runner is implemented and independently reviewed.
Actual opening capital was verified and allocated on the isolated live branch.
The twenty-order settlement manifest has not started: **0/20 orders** at this
checkpoint. Local tests and funded wallets are not a completed soak.

## Opening capital evidence

The ten fresh isolated reverse wallets each received one `110000`-zatoshi note
in setup transaction
`e1632941f638e112e62b7f69ed0aace41f912c27744bfe9881ddb59485c071da`, mined
at Zcash testnet height `4503513`. At the initial canonical check it had eleven
confirmations. Each wallet was subsequently synchronized, its actual unspent
note was checked, and the funding ciphertext was independently decrypted with
that wallet's UFVK. The ten output identities were distinct and summed to
`1100000` zatoshi. Fresh canonical captures completed in 16.36 seconds before
initialization.

The setup batch has 37,570 serialized bytes, no transparent inputs or outputs,
and an Ironwood value balance of `55000` zatoshi. This matches the separately
reviewed batch fee and input/output conservation. The original G1 parser's
fixed `10000`-zatoshi fee predicate correctly returns false for this batch; its
exported structural values were inspected without weakening that parser. These
are setup costs, separate from each swap's `10000`-zatoshi payout fee.

A first separate CLI confirmation had stopped before signing because its
proposal was not persisted between processes. Before the actual one-process
batch send, `calculate --recover` returned no calculated transaction and the
original `11060000`-zatoshi input remained unspent. The successful batch used a
new exclusive, fsynced submission intent. No uncertain transaction was replaced.

The G5 branch `br-weathered-bird-aoaodegw` received exactly four inventory
accounts and eight balanced opening ledger entries:

| Purpose | Atomic amount |
| --- | ---: |
| mockUSDC principal | 1000000 |
| TAZ principal | 1000000 |
| TAZ payout fees | 100000 |
| Base ETH fee capital | 300000000000000 |

Base allocation reads were pinned to a canonical finalized block. They checked
full contract inventory, available inventory, actual token holdings, zero escrow
liability and operator ETH. Historical G4 books were not imported. The same
bootstrap was executed again successfully: it accepted exactly the original
eight entries and four untouched accounts, without crediting capital twice.
Both invocations ended with acceptance and dispatch disabled and reconciliation
still required.

## Runner boundaries

The manifest requires exactly twenty sequential alternating orders, starting
with shielded TAZ to Base mockUSDC. Each order is `100000` atomic source and
destination units at the fixture rate. A predecessor must be verified before
the next order begins. Each reverse order has a separately approved wallet,
source note, request, signing intent and journal. The original G4 scripts,
branch checks, SDK adapter and completed journals are unchanged.

Every named operator invocation ends paused. A durable one-time policy marker
permits only the initial empty opening admission. Failures persist an incident;
retrying `start` cannot clear reconciliation. A stale process lock also requires
operator investigation. The final verification independently checks original
canonical source and destination receipts, one economic operation, discharged
obligations, released reservations and balanced ledger entries.

At every completed-order boundary, full contract inventory, token balance,
available inventory, zero escrow and operator gas must equal the pinned opening
baseline adjusted by the exact run transfers and recorded fees. An independent
SDK capture checks all ten reverse wallets and the new source viewing wallet:
spent reverse wallets must be empty, remaining wallets must retain their exact
approved note, and received forward notes must match canonical deposit identities
and unreconciled proceeds. These proceeds never silently become spendable
capital. Shared operator transactions outside this run must not change its
pinned physical baseline while the run is active.

## Verification and review

- Full API TypeScript typecheck passed.
- Eight G5 manifest, sequencing, command/config binding, capitalization and
  physical accounting tests passed, including the coordinator's own invocation.
- Three strict `110000`-zatoshi capital-capture tests passed on Linux.
- Two Linux viewing-wallet lock/exclusion tests passed.
- The seventeen existing API unit tests passed during implementation.
- Independent review corrected incident retry, incomplete physical balance
  checks, capital/adapter binding and the source wallet's lock protocol before
  live execution. Its final review found no remaining blocking issue in this
  scoped runner.

The complete command orchestration has source-review coverage, not an
invocation-level synthetic end-to-end test. Its public-testnet execution is the
next explicit evidence step. No source funding, settlement, refund, live SDK kill
rehearsal or completed twenty-order result is claimed here. Private run manifests,
wallets, viewing keys, approvals, raw receipts and transaction mappings remain
outside Git.
