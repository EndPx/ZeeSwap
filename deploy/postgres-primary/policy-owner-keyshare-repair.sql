-- Explicit operator repair, not an automatic migration or service startup step.
-- Run only after reviewing the target database, policy and original ACL evidence.
-- The current deployment already applied this repair at XID118703: do not replay it.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
SET LOCAL ROLE zee_app_admin_20261023;
DO $$
DECLARE
  policy_table regclass := 'zee.root_testnet_service_policies'::regclass;
  policy_hash text := '10f877f468032e3c54b748748825dab5e7fe17e5a50d2ec78710392222417dae';
  before_rows text;
  before_function text;
  before_owner text;
  role_name text;
BEGIN
  IF current_database() <> 'zee_app_20261023'
     OR current_user <> 'zee_app_admin_20261023'
     OR (SELECT system_identifier::text FROM pg_control_system()) <> '7701863382450487342' THEN
    RAISE EXCEPTION 'POLICY_KEYSHARE_TARGET_REFUSED';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM zee.runtime_control WHERE singleton AND epoch=236
                AND xmin::text='99985' AND accepting_orders AND dispatch_enabled
                AND NOT reconciliation_required) THEN
    RAISE EXCEPTION 'POLICY_KEYSHARE_CONTROL_REFUSED';
  END IF;
  SELECT pg_get_userbyid(relowner) INTO before_owner FROM pg_class WHERE oid=policy_table;
  IF before_owner <> current_user OR has_table_privilege(current_user,policy_table,'UPDATE')
     OR NOT has_table_privilege(current_user,policy_table,'SELECT')
     OR NOT has_table_privilege(current_user,policy_table,'INSERT') THEN
    RAISE EXCEPTION 'POLICY_KEYSHARE_OWNER_ACL_REFUSED';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=policy_table AND attnum>0
            AND NOT attisdropped AND attname<>'policy_sha256'
            AND has_column_privilege(current_user,policy_table,attnum,'UPDATE')) THEN
    RAISE EXCEPTION 'POLICY_KEYSHARE_OTHER_OWNER_COLUMNS_REFUSED';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid=policy_table AND NOT tgisinternal
       AND tgenabled='O' AND tgtype=27 AND tgfoid='zee.immutable()'::regprocedure) <> 1 THEN
    RAISE EXCEPTION 'POLICY_KEYSHARE_IMMUTABLE_TRIGGER_REFUSED';
  END IF;
  IF (SELECT regexp_replace(prosrc,'[[:space:]]','','g') FROM pg_proc
       WHERE oid='zee.immutable()'::regprocedure)
       <> 'BEGINRAISEEXCEPTION''immutablerecord''USINGERRCODE=''23514'';END' THEN
    RAISE EXCEPTION 'POLICY_KEYSHARE_IMMUTABLE_BODY_REFUSED';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=
       'zee.record_testnet_worker_readiness(zee.digest,timestamptz,zee.digest)'::regprocedure
       AND prosecdef AND pg_get_userbyid(proowner)=current_user)
     OR NOT has_function_privilege('zee_app_worker_20261023',
       'zee.record_testnet_worker_readiness(zee.digest,timestamptz,zee.digest)','EXECUTE') THEN
    RAISE EXCEPTION 'POLICY_KEYSHARE_DEFINER_REFUSED';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['zee_app_api_20261023','zee_app_worker_20261023'] LOOP
    IF has_any_column_privilege(role_name,policy_table,'UPDATE') THEN
      RAISE EXCEPTION 'POLICY_KEYSHARE_APPLICATION_UPDATE_REFUSED';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM zee.root_testnet_service_policies) <> 1
     OR NOT EXISTS(SELECT 1 FROM zee.root_testnet_service_policies
        WHERE encode(policy_sha256,'hex')=policy_hash AND active_epoch=236
          AND public_commit='6ebb11da0fdaa70ccdd35d0c04e5abfe0b256ecc'
          AND amount_atomic=100000 AND forward_cap=2 AND reverse_cap=2
          AND global_concurrency=1 AND quote_cap=32 AND forward_cutoff_blocks=40
          AND min_lead_blocks=12 AND native_principal_budget=200000
          AND base_principal_budget=200000 AND native_fee_budget=40000
          AND base_fee_budget=400000000000000) THEN
    RAISE EXCEPTION 'POLICY_KEYSHARE_POLICY_CAPS_REFUSED';
  END IF;
  SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.policy_sha256)::text,'[]'))
    INTO before_rows FROM zee.root_testnet_service_policies p;
  SELECT pg_get_functiondef('zee.record_testnet_worker_readiness(zee.digest,timestamptz,zee.digest)'::regprocedure)
    INTO before_function;
  IF NOT has_column_privilege(current_user,policy_table,'policy_sha256','UPDATE') THEN
    GRANT UPDATE(policy_sha256) ON zee.root_testnet_service_policies TO zee_app_admin_20261023;
  ELSE
    RAISE NOTICE 'POLICY_KEYSHARE_ALREADY_APPLIED_VERIFY_ONLY';
  END IF;
  IF has_table_privilege(current_user,policy_table,'UPDATE')
     OR NOT has_column_privilege(current_user,policy_table,'policy_sha256','UPDATE') THEN
    RAISE EXCEPTION 'POLICY_KEYSHARE_POST_ACL_REFUSED';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['zee_app_api_20261023','zee_app_worker_20261023'] LOOP
    IF has_any_column_privilege(role_name,policy_table,'UPDATE') THEN
      RAISE EXCEPTION 'POLICY_KEYSHARE_POST_APPLICATION_UPDATE_REFUSED';
    END IF;
  END LOOP;
  PERFORM policy_sha256 FROM zee.root_testnet_service_policies
    WHERE encode(policy_sha256,'hex')=policy_hash FOR KEY SHARE;
  IF before_rows IS DISTINCT FROM (SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.policy_sha256)::text,'[]')) FROM zee.root_testnet_service_policies p)
     OR before_function IS DISTINCT FROM pg_get_functiondef('zee.record_testnet_worker_readiness(zee.digest,timestamptz,zee.digest)'::regprocedure)
     OR before_owner IS DISTINCT FROM (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid=policy_table) THEN
    RAISE EXCEPTION 'POLICY_KEYSHARE_UNEXPECTED_DATA_OR_BODY_CHANGE';
  END IF;
END $$;
COMMIT;
