-- DESTINATION PRIMARY ONLY. No source grants, role membership or elevated flags.
\set ON_ERROR_STOP on
\connect zee_envio_20261023
BEGIN;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO
  zee_envio_owner_20261023, zee_envio_export_20261023;
COMMIT;
\connect zee_chef_20261023
BEGIN;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO zee_chef_owner_20261023;
COMMIT;
