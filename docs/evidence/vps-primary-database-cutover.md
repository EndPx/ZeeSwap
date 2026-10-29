# VPS PostgreSQL primary cutover checkpoint

Recorded 29 October 2026 (Asia/Jakarta). These are sanitized observations from
Root's actual restore, restricted-client and service readbacks, reported during
the cutover. They are a dated checkpoint, not a fresh health or availability
claim. No private receipts, connection credentials, wallet files or order
mappings are published here.

## Hosting decision and verified restoration

The user selected VPS Docker PostgreSQL as primary for all four application
stores, with no Neon runtime dependency after the verified cutover. The source
Neon writers were stopped for consistent capture; their stores, original
profiles and evidence remain retained archives. No laptop Docker or local
PostgreSQL is required for the web preview.

Root verified PostgreSQL **18.6** (`server_version_num=180006`), destination
system identifier **7701863382450487342**, and TLS. The host listener is restricted
to **127.0.0.1:55435**; SDK containers use the isolated Docker network. Clients
verify the destination CA and database identity rather than relabelling the
original Neon endpoint or weakening TLS validation. See the
[primary deployment workflow](../../deploy/postgres-primary/README.md) and
[SDK relocation workflow](../../deploy/sdk-datastore/README.md).

| Store | Preserved restore readback | Qualification at this checkpoint |
| --- | --- | --- |
| Main (`zee_app_20261023`) | 29 tables, 4,646 rows; semantic data, schema ownership and ACL comparison exact, including the original six role-membership edges | Production API/worker/reader connections passed actual TLS and destination identity checks; Main API listens on port 3031 |
| Envio (`zee_envio_20261023`) | 48 tables, 5,123 rows; semantic data, schema ownership and ACL comparison exact | Explicit new store incarnation and export generation; R2 engine subsequently healthy at progress 51,593,555 |
| Chef (`zee_chef_20261023`) | 15 tables, 321 rows; semantic data, schema ownership and ACL comparison exact | Existing logical generation and explicit revision preserved; later actual caught-up/read-gate-ready check and normal follower handoff passed |
| Bridge (`zee_bridge_20261029`) | Empty application book, one table; semantic data, schema ownership and ACL comparison exact | Production runtime role passed actual TLS against the destination |

These counts describe the frozen restoration baseline, not continuously current
row counts. Envio's five explicit owner-only ACL entries were materialized on the
destination to match the source representation; this added no effective owner
privilege. Restricted identity reads are an explicitly recorded destination
system-function grant, separate from the restored application schema and ACLs.

The Main roles remain `zee_app_api_20261023`, `zee_app_worker_20261023`,
`zee_app_reader_20261023` and `zee_app_admin_20261023`, with the original restricted
role model and base memberships. Actual production qualification used the three
restricted application roles; it does not imply the admin credential is shared
with them. Bridge uses `zee_bridge_runtime_20261029`.

## Transaction history and source identity

A logical restore does **not** preserve PostgreSQL transaction IDs, xmin values
or transaction commit-status history. Origin transaction classifications and
xmin captures remain bound to their original server and archived proof. The
new cluster has its own restored semantic baseline and CAS identity. A restored
row is not evidence that an origin transaction ID committed on this cluster.
The [legacy transport boundary](legacy-main-pg-preload.md) retains those checks
for pinned legacy guards.

Envio's snapshot-based revision therefore received an explicit store incarnation
and new generation. Its initial destination view readback was progress
**51,541,588**, revision **1,968**. The later R2 engine readback was healthy at
**51,593,555**. Original export profiles, source identities, projections and
historical cursors remain archived with their original meanings; old cursors
were not silently rebound to the restored database. PublicNode remains the
producer RPC identity and the independent consumer remains the Official Base
Sepolia RPC. Reissuing independent-reader approval bound the new generation;
it did not invent another provider or fresh qualification for an old sample.

Chef uses an explicit logical generation and revision rather than PostgreSQL
transaction IDs. Its restore baseline retained generation
`13d3e6eb-ecfe-4159-8cde-b5d9ed00151e`, revision **20,618**, checkpoint
**4,552,477**. After four blocks it entered source reconciliation at revision
**20,622**, checkpoint **4,552,481**. Root qualified a bounded source-only recovery
against a fresh Prep anchor; no cursor reset or read-gate waiver was applied.

The first recovered follower could not scan because the newly staged UFVK had
inherited generic group-readable metadata permissions. Root corrected only the
two new UFVK copies to owner **986**, group **978**, mode **0400**, preserving their
bytes. A same-image read-only native `inspect-key` then passed. The follower
subsequently reached checkpoint **4,552,515**, revision **20,656**, READY, with the
same generation and no restart. This successful checkpoint does not establish
that later catch-up or all source gates are complete. The one-block payload
bound remains unchanged.

Root's subsequent fresh check qualified Chef checkpoint **4,553,163**, matching
Prep **4,553,163**, lag **0**, `caught_up` and `readGateReady`, with Prep epoch
**274**. Root then actually stopped recovery and recreated the same primary
follower with the normal overlays, omitting source recovery. The private normal
handoff status is retained in the relocation evidence archive. This closes the
Chef catch-up and normal-handoff step at that observation; it does not open
Main's financial admission.

## Backup and remaining gates

Root produced encrypted logical backups with PostgreSQL 18.6 tooling; recovery
key material stays off-server. Source captures, role/ACL metadata and encrypted
backup artifacts are private. Credentials, raw logical dumps and decrypting keys
are excluded from Git. Source stores have not been deleted.

Chef's earlier recovery gap of about 289 blocks was subsequently closed by the
actual caught-up check above. Main's API listener was active, but the pilot
service policy was **not activated** and the Base observer opening had not yet
been performed. The funded two-way Bridge circle was
**not completed**; the expired unfunded order remains preserved. Database
restoration, an API listener and healthy Envio progress do not authorize quotes,
funding, payouts or settlement. Existing financial and source acceptance gates
remain in force. The old G5 campaign remains stopped.

## Documentation verification

This milestone changes only the front-page hosting explanation, this evidence
record and a qualified plan progress entry. Scoped `git diff --check` passed. A Markdown link check passed for all **86**
local references across the three files, resolving against Git-tracked paths
plus this intentional new evidence document. The new document also passed a
trailing-whitespace check. The explicit public-file allowlist is `README.md`,
`plan.md` and `docs/evidence/vps-primary-database-cutover.md`.
No application test result, new live probe, service restart or financial action
is inferred from this documentation check.
