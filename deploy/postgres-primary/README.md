# Isolated VPS PostgreSQL primary migration

This is preparation for the user-selected VPS Docker primary. Root performs
pull/start, backup, restore and cutover. Nothing here runs Docker on the laptop,
deletes Neon, changes an existing container, switches an application URL or
activates financial admission. Root's latest source read found Main accessible
on PostgreSQL 18.6; this workflow does not assert that Neon is suspended.

## Fixed target

| Item | Value |
| --- | --- |
| Compose project / container | `zeeswap-app-postgres-v1` |
| New volume | `zeeswap_app_postgres_v1_pgdata` |
| New Docker network | `zeeswap_app_db_v1` |
| Host listener | `127.0.0.1:55435` only |
| SDK-container endpoint after reviewed network attachment | `postgres:5432` or `zeeswap-app-postgres-v1:5432` |
| PostgreSQL image | Official `postgres:18.6-bookworm`; freeze its inspected digest before use |
| Limits | One CPU, one GiB RAM, 128 MiB shared memory, 128 PIDs |
| Bootstrap user / database | `zeeswap_migration_bootstrap` / `zeeswap_migration_admin` |
| Main database | Preserve `zee_app_20261023` |
| Bridge database | Preserve `zee_bridge_20261029`; reported empty, independently verify its catalog/ACLs |
| SDK database | Discover its actual source identity; do not invent a name |

The PostgreSQL 18 volume is mounted at `/var/lib/postgresql`, with PGDATA
`/var/lib/postgresql/18/docker`, matching the [official image's version-specific layout](https://hub.docker.com/_/postgres).
Existing `zeer-testnet-chef-db` and other Zeer/Envio containers, volumes and
networks remain separate. Never reuse or remove them as a shortcut.

## Root's VPS preparation

1. Inspect the exact proposed new container, volume, network and listener for
   collisions. If any already exists, inspect its identity and state; do not
   overwrite it or run `down -v`. Recheck free disk/RAM before the pull/restore.
   Root's earlier 46 GiB free disk / 8.7 GiB available RAM is a dated observation.
2. Pull only the selected official 18.6 image on the VPS. Record its RepoDigest
   and local image ID. Set `ZEE_PG_IMAGE=postgres@sha256:...` to that verified
   digest in the private Compose environment. Backup tools also refuse a
   `pg_dump` client version other than 18.6.
3. Create a new root-owned 0700 directory
   `/opt/zeeswap-testnet/secrets/postgres-primary-v1`. Generate a new bootstrap
   password in its 0600 `bootstrap-password` file. Do not put the value in an
   environment variable, command line, public file or log.
4. Prepare the private TLS certificate/key at `server.crt` and `server.key` in
   that directory. Use SANs `IP:127.0.0.1`, `DNS:localhost`, `DNS:postgres` and
   `DNS:zeeswap-app-postgres-v1`. A prototype private self-signed trust anchor is
   acceptable only when its public certificate is explicitly pinned/trusted by
   clients; do not disable certificate validation. The private key stays root
   0600. Install the public trust certificate separately at
   `/opt/zeeswap-testnet/secrets/app-postgres-ca.pem`, root:G978 mode 0640.
5. Copy only these public deployment files to a new reviewed directory. Put
   absolute secret file paths and the image digest in a private `.env` derived
   from `.env.example`. Root can then run `docker compose config` and, after
   reviewing the exact result, `docker compose up -d` **on the VPS only**.

`entrypoint.sh` copies the TLS key into the persistent volume with mode 0600 and
the image's actual `postgres` UID/GID. It does not assume a host UID. The HBA file
rejects non-TLS TCP and requires SCRAM on TLS. Local bootstrap authentication is
limited to the migration user through the container socket. Password-file support
follows the [official image's `_FILE` mechanism](https://hub.docker.com/_/postgres).

Health reports PostgreSQL socket readiness only. Qualify TLS separately using a
CA-verified connection and `pg_stat_ssl` for that connection. Node services must
load the pinned CA at process start, for example through `NODE_EXTRA_CA_CERTS`;
Python/libpq must use `sslmode=verify-full` and the pinned root certificate.
No application role, password, database or restored state is created by Compose.

Read the new cluster identity without credentials in argv:

```sh
docker exec zeeswap-app-postgres-v1 psql -XAt \
  -U zeeswap_migration_bootstrap -d zeeswap_migration_admin \
  -c 'SELECT system_identifier::text FROM pg_control_system()'
```

The returned identifier is destination-specific. `identity-grants.sql` is an
explicit **destination-only** grant of this read function to the four effective
Main roles. It does not grant `pg_monitor`, superuser, create-role, create-db,
replication or bypass-RLS privileges. Record this intentional system-function
ACL delta separately from source application ACL preservation. PostgreSQL's
[control-data implementation](https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/utils/misc/pg_controldata.c)
does not impose an additional internal role check on `pg_control_system()`.

## Source credentials and SDK identity

Use the **existing remote** Main worker/reader URL from the protected VPS runtime.
Never copy the laptop's source administrator credential or local admin profile
to the VPS. Do not print a connection string, container environment or password.

`discover_sdk_identity.py` performs one read-only `docker inspect` of an explicitly
named SDK source container. It prints only `HOST`, `DB` and `ROLE`; missing HOST
is reported as null rather than inferred. URL/password/token fields never appear
in its output. It refuses conflicting identity fields. Root supplies the actual
container name and hostname:

```sh
python3 discover_sdk_identity.py --container EXACT_SDK_SOURCE_CONTAINER \
  --expected-hostname EXACT_VPS_HOSTNAME
```

This does not establish read permission, a safe migration or a destination role.
The original SDK container remains untouched until the separate cutover plan.

## Complete read permission, then encrypted backup

`preflight.sql` is a read-only transaction over PostgreSQL catalogs. It checks
schema/table/sequence/large-object read privileges, RLS bypass/ownership, role
catalog readability and unexpected foreign tables. `backup.py` refuses a missing
privilege or unsupported version. It does not grant anything or quietly omit
protected tables. If the existing restricted role cannot produce a complete
archive, stop and review a narrowly scoped source-side backup-role proposal;
do not copy the local administrator password or run ad hoc grants.

Main/Bridge scopes require direct Neon TLS endpoints and their worker/reader
identities. Pooled hosts and owner/admin URLs are refused. SDK scope requires an
explicit discovered non-Neon host, database and existing remote role. An existing
SDK Docker source without TLS must be explicitly declared; that source exception
does not weaken TLS on the new destination. The [Neon backup guide](https://neon.com/docs/import/migrate-from-postgres)
uses direct connections for dump/restore operations.

Root needs `/usr/bin/age` on the VPS and a public `age1...` recipient. Keep the
decryption identity off the VPS unless separately authorized. A reviewed source
runtime JSON may be selected by an explicit dotted field; values are not logged:

```sh
python3 backup.py \
  --source-json /opt/zeeswap-testnet/secrets/EXISTING_APPROVED_RUNTIME.private.json \
  --url-field workerUrl \
  --scope main --expected-database zee_app_20261023 \
  --expected-user zee_app_worker_20261023 \
  --expected-hostname EXACT_VPS_HOSTNAME \
  --recipient PUBLIC_AGE1_RECIPIENT \
  --image postgres@sha256:VERIFIED_18_6_IMAGE_DIGEST \
  --output-dir /opt/zeeswap-testnet/backups/postgres-primary-v1
```

The helper generates ephemeral 0600 libpq service/password files in a private
directory. Containers see only their mounted paths; URLs/passwords are absent
from argv, Docker environment and output. One-CPU/one-GiB read-only client
containers use the already-pulled image. Plain archive data streams directly
into `age`; it is not written as a plaintext backup file. Unique temporary client
containers are cleaned up by their invocation-specific names only.

Outputs are an encrypted custom-format database archive, an encrypted role
inventory without role passwords, and a private hash manifest. Default dump
owner, ACL, default-privilege, function, schema and data metadata are retained;
there is no `--no-owner`, `--no-acl` or selective table filter. Existing encrypted
receipt/payload bytes stay encrypted; no payload key is imported or used.
`pg_dump` provides a consistent database snapshot; the role inventory is a
separate read and is **not** the same snapshot. Freeze role/schema changes during
the final capture. See [PostgreSQL's dump behavior](https://www.postgresql.org/docs/18/app-pgdump.html)
and [role-password exclusion](https://www.postgresql.org/docs/18/app-pg-dumpall.html).

For final cutover, Root must first fence/drain the original application writers,
worker and relevant observers, preserve all outstanding operations/journals and
capture final semantic row/ledger/source digests. A consistent SQL dump does not
make separate SDK wallet files or external signing journals consistent with it.
Preserve those original artifacts and their independent pins separately.

## Roles, restore and new passwords

Before restore, decrypt and inspect the trusted archive and role inventory in a
private authorized workspace, verifying encrypted-file hashes and successful
decryption first. Produce a concrete **reviewed role plan** from the source
catalog. Preserve exact object-owner and grantee names, role memberships, flags,
default privileges, security-definer owners/search paths and revoked privileges.
Do not replay all managed Neon global roles blindly. Do not manufacture a new
superuser relationship to make a failed restore pass.

Main effective role names remain `zee_app_api_20261023`,
`zee_app_worker_20261023`, `zee_app_reader_20261023` and
`zee_app_admin_20261023`, with original base role memberships such as
`zeeswap_api`, `zeeswap_worker`, `zeeswap_reader`. Include any actual source
object-owner roles as required by the reviewed archive. Preserve names without
copying source login passwords. Create a **new destination admin password FILE**
at `secrets/postgres-primary-v1/zee_app_admin_20261023.password`; other destination
password files follow the same private directory. Root may instead reuse an
already-remote API/worker/reader password only when explicitly selected for the
transport overlay. The source laptop administrator password never moves.

`restore.py` requires a hash-pinned private plaintext custom archive, a separately
reviewed/hash-pinned role SQL plan and a hash-pinned origin proof. It checks the
exact new Compose container/image, PostgreSQL 18.6, destination system identifier,
archive database identity and absence of that database. It fsyncs an immutable
intent before destination writes, applies the reviewed roles and uses
`pg_restore --create --exit-on-error` with owner/ACL restoration enabled.
Root supplies the CLI values shown by `python3 restore.py --help`; it does not
accept a source URL or source administrator credential.

Root should stream/copy the already-verified decrypted archive into a root-0600
private restore directory, never a public transport or Git. Record its raw hash
before invoking the restore helper. This private temporary plaintext archive
still contains the application's encrypted financial payloads. Retain or dispose
of it only under the reviewed operator retention plan after restore acceptance.

A failed restore can leave a partial new database: the helper does not drop it,
retry, erase its intent or weaken errors. Investigate the original intent/state
and choose a separately reviewed fresh target. A successful restore status is
`LOGICAL_RESTORE_COMPLETED_ACCEPTANCE_PENDING`, not financial readiness.

## Original XIDs and cutover proof

Logical dump/restore **cannot preserve original PostgreSQL transaction IDs,
tuple xmin or the source server's pg_xact history**. Application columns that
store old IDs remain historical data, not destination commit proof. Never query
the new server's `pg_xact_status(old_xid)` as though it described the old server,
and never rewrite an old intent/receipt to make a destination result look exact.

The new restore intent records the distinct destination system identifier,
origin server reference, source proof hash and archive hash. Origin committed-XID
proofs remain tied to the origin server. The transport/relocation proof must
separately distinguish restored semantic row digests from origin xmin/XIDs and
bind the new endpoint, database, roles, CA and actual server identity.

Old Neon endpoint/branch/profile bindings cannot be changed by a URL substitution.
Use the separately reviewed transport overlay and cutover proof, then independently
qualify the restored schema/ACLs, books, financial obligations, original receipts,
leases, journals and fresh canonical observations. Keep admission closed until
those checks pass. Activate exactly one authoritative application database;
preserve Neon's archive/history and do not delete it as part of this workflow.

## Verification performed for this preparation

Seven pure local Python tests passed, covering credential confinement, pooled/
admin/TLS refusal, complete-read permission gating, unrelated-container refusal,
archive identity and secret-free SDK metadata projection. Python syntax compilation
passed. Compose YAML parsed and isolation/resource assertions passed.

No Docker command, image pull, database query, permission grant, backup, restore,
TLS handshake, VPS mutation, application cutover or financial operation was run
by this preparation. Actual PostgreSQL permission/catalog checks and restoration
remain unperformed. The Compose healthcheck alone cannot establish acceptance.
