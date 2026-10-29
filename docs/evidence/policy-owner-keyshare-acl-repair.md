# Policy-owner key-share ACL repair

Root reported that the actual financial worker captured the mature 12,490,000
zatoshi Native balance, then failed with SQLSTATE 42501 on
`root_testnet_service_policies` while recording readiness. The readiness function
was SECURITY DEFINER, owned by the application admin, and executable by the
worker. Its runtime table write permissions were present. Migration 0020 had
explicitly revoked the policy owner's privileges and restored only SELECT and
INSERT. The runtime table's foreign key performs a policy-row key-share lock.
PostgreSQL requires UPDATE privilege on at least one column for that lock.
See the official [PostgreSQL 18 SELECT documentation](https://www.postgresql.org/docs/18/sql-select.html).

Root reproduced the owner-role SELECT FOR KEY SHARE failure before the repair.
The exact owner-only change was:

```sql
GRANT UPDATE(policy_sha256)
ON zee.root_testnet_service_policies
TO zee_app_admin_20261023;
```

Root applied it once at committed XID 118703. Before the grant, the owner had neither
table-wide UPDATE nor key-column UPDATE. Afterward, table-wide UPDATE remained
false and key-column UPDATE became true. API and worker roles retained no UPDATE
privilege on any policy column. The same owner-role key-share query then passed.
The immutable BEFORE UPDATE/DELETE trigger remained enabled, and the hash of all
policy rows was identical before and after. Control remained epoch 236/xmin 99985
with accepting and dispatch enabled and reconciliation disabled. The existing
policy, caps, migration 0020, function bodies, financial 6ebb release and a70
execution manifest were unchanged.

The protected operator receipt is
`/opt/zeeswap-testnet/state/database-relocation/policy-keyshare-column-acl-repair.private.json`.
It remains outside Git. This implementation agent did not apply or repeat the
grant, probe the database or restart a service.

The separately reviewed operational SQL in
`deploy/postgres-primary/policy-owner-keyshare-repair.sql` documents a narrow,
guarded repair for this exact deployment. It checks database incarnation, owner,
control, policy caps, immutable trigger/body and application-role ACLs, then
verifies unchanged policy data and readiness-function body. It is not an
automatic migration or startup action. The current deployment already has the
repair; it must not be replayed as another operator attempt. The operational
SQL was prepared by inspection and has not been executed by this agent.

The ACL result establishes the previously missing lock permission. Worker
readiness, API admission and a completed customer swap require their own actual
runtime evidence; they do not follow from this metadata repair alone.
