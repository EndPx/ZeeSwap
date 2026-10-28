# Neon branch retirement — 28 October 2026

The user explicitly authorized deletion of unused ZeeSwap Neon branches.
The operator inspected all ten branches in the existing project, current VPS
runtime references, other database sessions and financial state before selecting
four closed historical experiments. No application code or financial gate was
changed.

## Deleted branches

| Branch | Orders | Obligations | Reservations remaining |
| --- | --- | --- | --- |
| `zeeswap-g4-live-forward` | One `SETTLED` | One `DISCHARGED` | 0 |
| `zeeswap-g4-live-reverse` | One `SETTLED` | One `DISCHARGED` | 0 |
| `zeeswap-g5-live-refunds` | One `REFUNDED` | One `DISCHARGED` | 0 |
| `zeeswap-g5-live-soak` | One `REFUNDED` | One `DISCHARGED` | 0 |

Each branch had one `CONFIRMED` operation, no other client session when inspected,
and no reference in the inspected current VPS secret configuration. This is
bounded operator evidence, not a claim that historical local scripts cannot
reference a retired endpoint.

Before deletion, PostgreSQL 18.6 client tools produced a custom-format dump of
each branch's user database using an exported read-only transaction snapshot.
The operator recorded every user table's row count and content digest within
that snapshot. The archives contain historical private records and therefore
remain outside Git, together with the private runtime material needed to
interpret encrypted application fields.

All four archive table-of-contents reads and complete SQL decodes succeeded.
The archive bundle was copied to the protected local operator directory and
each dump's SHA-256 was verified against its private manifest. The same bundle
also remains in protected VPS storage. This verifies archive readability and
copy integrity; restoration into a new database was **not** tested. These
logical dumps preserve current database contents, not Neon point-in-time history.

All four delete requests returned HTTP 200. A subsequent fresh Neon branch
listing at **22:40:25 WIB on 28 October 2026** contained six branches and none
of the four deleted IDs.

## Retained branches

| Branch | Reason |
| --- | --- |
| `production` | Primary/root branch and parent of the active environment |
| `zeeswap-live-testnet-20261023` | Current API, Chef and Envio database environment |
| `zeeswap-g2-tests` | Still referenced by isolated HTTP/database regression runners |
| `zeeswap-g3-settlement-tests` | Still referenced by isolated settlement/integration runners |
| `zeeswap-g2-database` | Historical intake state includes unresolved obligations and reservations |
| `zeeswap-g5-soak-retry` | Historical state includes two signed operations and held obligations |

Retaining unresolved histories does not authorize restarting old G5 actors or
reusing their signed payloads. Historical test evidence and source bindings keep
their original meaning; deleting a closed experiment does not complete any
unfinished acceptance gate.

## Capacity and service checks

The capacity inspection found approximately 4.01 billion bytes in Neon's
`data_transfer_bytes` counter. The active branch's reported logical size was
approximately 69.86 million bytes. Branch deletion does not reset monthly
network-transfer consumption. No reclaimed physical-storage quantity is claimed:
branch logical sizes are not an additive measure of copy-on-write physical
storage.

After deletion:

- Neon reported six remaining branches; all four selected branches were absent.
- The VPS API and application Chef observer services were active/running.
- The public frontend returned HTTP 200.
- The Envio engine/export containers were running and healthy; the Chef API and
  follower containers were running.
- No live application service was restarted and no application row, ledger,
  active checkpoint or wallet was modified by this retirement operation.

These checks establish the bounded branch-cleanup result. They do not establish
fresh cross-chain settlement, source freshness or financial activation.
