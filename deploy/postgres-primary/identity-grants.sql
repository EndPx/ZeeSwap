-- DESTINATION ONLY, after source roles/owner/ACL restore. Intentional recorded
-- system-function ACL delta; does not grant pg_monitor or elevated role flags.
BEGIN;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO
  zee_app_api_20261023, zee_app_worker_20261023,
  zee_app_reader_20261023, zee_app_admin_20261023;
COMMIT;
