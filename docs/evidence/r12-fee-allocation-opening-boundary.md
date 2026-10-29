# R12 fee-allocation and ordinary-frontier boundary

Root's authorized read-only inspection found Main paused at control 235/xmin 43503,
with zero rows in the four service-policy tables (`root_testnet_service_policies`,
`testnet_policy_quotes`, `testnet_policy_admissions` and `testnet_service_runtime`),
zero old authorizations and 72 financial rows. Existing financial quotes were
preserved. Original fee allocation 62058 increased available fees from
10,000 to 40,000 zatoshis using exactly two balanced 30,000-zatoshi ledger entries.
Principal balances remained unchanged. No further allocation is intended.

The original R11 metadata transaction 59963 remains an archival committed
operation over its original 70-row financial digest and 269 retained Base headers.
Ordinary observation advanced the current checkpoint to 51715915/xmin 79836 and
retained 286 headers: the original 269 plus 17 ordinary finality anchors. The sealed
version 4 admission had no hints, matched the actual SQL checkpoint/hash and
retained the original R11 scope. These are bounded inspection facts, not a new
Source qualification or financial activation.

The new explicit `ROOT_R12_FEE_ALLOCATION_AND_ORDINARY_FRONTIER` branch checks the
actual pinned allocation receipt, current-financial audit and policy; original
allocation intent/after hashes; committed destination-cluster transaction; exact
70→72 delta through the existing allocation validator; unchanged control and
closed books. It treats R11 as archival evidence, without classifying its old
checkpoint or 70-row state as current. The current frontier must match its explicit
checkpoint, 286-row digest and sealed-admission raw hash. All 269 original headers
must remain identical; all 17 added anchors are checked on both actual RPCs.

The collector refuses any service admission or unfinished prior metadata intent.
Its existing canonical current-checkpoint/finality checks, independent fresh
Source selection, duplex contract/issuer checks, Native readiness/capital,
quiescence, new honest historical-gap approval, original publication XID/CAS and
finish/reconciliation remain in force. Publication preserves all 286 rows and 72
financial rows. It creates neither a policy nor a payment. Default prior-opening
classification remains strict and unchanged.

Local verification: 28 focused synthetic tests passed, including 13 mutation/fault
cases for original transactions/pins, exact financial delta, current admission,
retained prefix and historical-coverage claims; API TypeScript passed. The tests
do not establish live R12 collection, publication, finality or service activation.
Root executes those steps separately after reviewing the published milestone.

On 29 October 2026, Root reported actual execution of the subsequent R13 metadata
opening. The R12 collect-only attempt had refused the Source suffix before any
publication intent or XID; its artifacts were retained. The R13 sequence of
collection, conditional Root review, publication and finish committed exactly at
XID 87135, with completed-receipt SHA256
`f4030d3e2a8e9dbadc8ba6fd5e7809a26f7386c88267fa0a8ed24a2b383dc2de`
and config SHA256
`7ab766d3aced9bf251c1c7f6a0949d05cb512389af834c084282e1329499318f`.
It retained all 286 Base rows and 72 financial rows, kept control at epoch 235 and
created no service admission. The normal b688558 observer subsequently recorded
`ENVIO_TESTNET_OBSERVED`; the reported sample at `2026-10-29T09:53:21.977Z` reached
51728688 against source head 51728695, with source age 13,582 ms. Native remained
active, and the financial worker release remained 6ebb. This metadata execution
sent no paid onchain transaction. The separate R5 local service activation still
refused actual SQL freshness after the Main observer pause; the authoritative
local ext4 and Windows attempt directories remained empty. These results establish
a bounded metadata publication and subsequent ordinary observation, not service
activation, browser admission or a completed swap.
