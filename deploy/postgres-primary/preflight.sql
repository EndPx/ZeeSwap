-- SELECT-only permission inventory. No grants, role changes, writes or DDL.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '15s';
WITH me AS (
  SELECT oid,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user
), namespaces AS (
  SELECT oid FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
), relations AS (
  SELECT c.* FROM pg_class c JOIN namespaces n ON n.oid=c.relnamespace
)
SELECT json_build_object(
  'database', current_database(), 'role', current_user,
  'server_version', current_setting('server_version'),
  'server_version_num', current_setting('server_version_num')::integer,
  'read_only', current_setting('transaction_read_only')='on',
  'missing_schema_usage', (SELECT count(*) FROM namespaces WHERE NOT has_schema_privilege(oid,'USAGE')),
  'missing_table_select', (SELECT count(*) FROM relations WHERE CASE WHEN relkind IN ('r','p','m') THEN NOT has_table_privilege(oid,'SELECT') ELSE false END),
  'missing_sequence_select', (SELECT count(*) FROM relations WHERE CASE WHEN relkind='S' THEN NOT has_sequence_privilege(oid,'SELECT') ELSE false END),
  'rls_blocked_tables', (SELECT count(*) FROM relations,me WHERE relkind IN ('r','p') AND relrowsecurity AND NOT (me.rolsuper OR me.rolbypassrls OR (pg_has_role(relowner,'USAGE') AND NOT relforcerowsecurity))),
  'foreign_tables', (SELECT count(*) FROM relations WHERE relkind='f'),
  'missing_large_object_select', (SELECT count(*) FROM pg_largeobject_metadata WHERE NOT has_largeobject_privilege(oid,'SELECT')),
  'role_catalog_readable', (SELECT count(*)>=1 FROM pg_roles),
  'membership_catalog_readable', (SELECT count(*)>=0 FROM pg_auth_members)
);
COMMIT;
