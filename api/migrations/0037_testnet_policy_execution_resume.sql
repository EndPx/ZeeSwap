-- One Root-reviewed idle resumption. Policy, accepted epochs, quotas and books remain immutable.
DO $$ BEGIN
 IF current_user<>'zee_app_admin_20261023' OR to_regprocedure('zee.testnet_policy_nonexpiring(zee.digest)') IS NULL
 THEN RAISE EXCEPTION 'SERVICE_RESUME_ADMIN_LIFETIME_REQUIRED';END IF;
END $$;
CREATE TABLE zee.testnet_policy_execution_resumptions(
 policy_sha256 zee.digest PRIMARY KEY,authorization_sha256 zee.digest NOT NULL,
 original_epoch bigint NOT NULL CHECK(original_epoch=242),paused_epoch bigint NOT NULL CHECK(paused_epoch=243),
 effective_epoch bigint NOT NULL UNIQUE CHECK(effective_epoch=244),paused_xmin text NOT NULL CHECK(paused_xmin ~ '^[1-9][0-9]*$'),
 financial_sha256 zee.digest NOT NULL,execution_approval_sha256 zee.digest NOT NULL,
 publication_expires_at timestamptz NOT NULL,created_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(policy_sha256=decode('1684eb5a004f4cc9bfbe332bea10970796374349ce00fddfd540fe80da5d41a8','hex'))
);
CREATE TRIGGER policy_execution_resume_immutable BEFORE UPDATE OR DELETE ON zee.testnet_policy_execution_resumptions FOR EACH ROW EXECUTE FUNCTION zee.immutable();
REVOKE ALL ON zee.testnet_policy_execution_resumptions FROM PUBLIC,zeeswap_worker,zeeswap_api,zeeswap_reader;
GRANT SELECT ON zee.testnet_policy_execution_resumptions TO zeeswap_worker,zeeswap_reader;
CREATE FUNCTION zee.testnet_policy_execution_epoch(p_policy zee.digest) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
 SELECT COALESCE(r.effective_epoch,p.active_epoch) FROM zee.root_testnet_service_policies p LEFT JOIN zee.testnet_policy_execution_resumptions r USING(policy_sha256) WHERE p.policy_sha256=p_policy
$$;
REVOKE ALL ON FUNCTION zee.testnet_policy_execution_epoch(zee.digest) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.testnet_policy_execution_epoch(zee.digest) TO zeeswap_worker,zeeswap_api,zeeswap_reader;
-- Preserve the current reviewed function bodies, including lifetime/reuse and
-- timestamp compatibility. Replace exactly the runtime comparison in each;
-- accepted_epoch and every budget/admission expression remain byte-for-byte.
DO $$ DECLARE signature text;body text;old text:='c.epoch<>p.active_epoch';replacement text:='c.epoch<>zee.testnet_policy_execution_epoch(p_policy)'; BEGIN
 FOREACH signature IN ARRAY ARRAY['zee.record_testnet_worker_readiness(zee.digest,timestamp with time zone,zee.digest)','zee.testnet_policy_gate(zee.digest)','zee.testnet_policy_availability(zee.digest)','zee.check_testnet_policy_worker(zee.digest,uuid)'] LOOP
  body:=pg_get_functiondef(signature::regprocedure);
  IF (length(body)-length(replace(body,old,'')))/length(old)<>1 OR strpos(body,replacement)<>0 THEN RAISE EXCEPTION 'SERVICE_RESUME_FUNCTION_BASELINE %',signature;END IF;
  EXECUTE replace(body,old,replacement);
 END LOOP;
END $$;
CREATE FUNCTION zee.resume_testnet_policy_execution(p_authorization zee.digest,p_paused_xmin text,p_financial zee.digest,p_execution zee.digest,p_expires timestamptz) RETURNS xid8
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE policy zee.digest:=decode('1684eb5a004f4cc9bfbe332bea10970796374349ce00fddfd540fe80da5d41a8','hex');stamp timestamptz:=clock_timestamp();changed integer;
BEGIN
 IF NOT pg_try_advisory_xact_lock(84532,20261023) OR NOT pg_try_advisory_xact_lock(84532,20261026) THEN RAISE EXCEPTION 'SERVICE_RESUME_ACTOR_RUNNING';END IF;
 PERFORM zee.lock_observer_cycle();stamp:=clock_timestamp();
 PERFORM 1 FROM zee.runtime_control WHERE singleton AND epoch=243 AND xmin::text=p_paused_xmin AND NOT accepting_orders AND NOT dispatch_enabled AND reconciliation_required FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_RESUME_PAUSED_CAS';END IF;
 IF p_expires<=stamp OR p_expires>stamp+interval '5 minutes' THEN RAISE EXCEPTION 'SERVICE_RESUME_PUBLICATION_EXPIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM zee.root_testnet_service_policies WHERE policy_sha256=policy AND active_epoch=242)
 OR NOT zee.testnet_policy_nonexpiring(policy) OR NOT zee.testnet_unfunded_reuse_enabled(policy)
 THEN RAISE EXCEPTION 'SERVICE_RESUME_ORIGINAL_POLICY';END IF;
 IF EXISTS(SELECT 1 FROM zee.orders WHERE state NOT IN('SETTLED','REFUNDED','EXPIRED_UNFUNDED'))
 OR EXISTS(SELECT 1 FROM zee.base_attempts WHERE NOT confirmed)
 OR EXISTS(SELECT 1 FROM zee.reservations WHERE released_at IS NULL)
 OR EXISTS(SELECT 1 FROM zee.inventory_accounts WHERE reserved<>0)
 THEN RAISE EXCEPTION 'SERVICE_RESUME_NOT_CLOSED';END IF;
 IF (SELECT count(*) FROM zee.scanner_checkpoints WHERE network IN('zcash-testnet','base-sepolia') AND observed_at BETWEEN stamp-interval '30 seconds' AND stamp+interval '5 seconds')<>2 THEN RAISE EXCEPTION 'SERVICE_RESUME_SOURCE_STALE';END IF;
 INSERT INTO zee.testnet_policy_execution_resumptions(policy_sha256,authorization_sha256,original_epoch,paused_epoch,effective_epoch,paused_xmin,financial_sha256,execution_approval_sha256,publication_expires_at)
 VALUES(policy,p_authorization,242,243,244,p_paused_xmin,p_financial,p_execution,p_expires);
 UPDATE zee.runtime_control SET epoch=244,accepting_orders=true,dispatch_enabled=true,reconciliation_required=false
 WHERE singleton AND epoch=243 AND xmin::text=p_paused_xmin AND NOT accepting_orders AND NOT dispatch_enabled AND reconciliation_required;
 GET DIAGNOSTICS changed=ROW_COUNT;IF changed<>1 THEN RAISE EXCEPTION 'SERVICE_RESUME_PAUSED_CAS';END IF;
 RETURN pg_current_xact_id();
END $$;
REVOKE ALL ON FUNCTION zee.resume_testnet_policy_execution(zee.digest,text,zee.digest,zee.digest,timestamp with time zone) FROM PUBLIC,zeeswap_worker,zeeswap_api,zeeswap_reader;
