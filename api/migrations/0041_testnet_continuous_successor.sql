-- Immutable execution continuation: no inventory allocation, discharge or finality change.
DO $$ BEGIN
 IF current_user<>'zee_app_admin_20261023' OR to_regprocedure('zee.testnet_order_delivery_included(uuid)') IS NULL THEN RAISE EXCEPTION 'CONTINUOUS_SUCCESSOR_BASELINE';END IF;
END $$;
CREATE TABLE zee.testnet_continuous_execution_generations(
 generation bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 policy_sha256 zee.digest NOT NULL,authorization_sha256 zee.digest NOT NULL UNIQUE,
 previous_authorization_sha256 zee.digest NOT NULL,human_approval_sha256 zee.digest NOT NULL,
 qualification_sha256 zee.digest NOT NULL,
 worker_config_sha256 zee.digest NOT NULL,execution_manifest_sha256 zee.digest NOT NULL,
 execution_approval_sha256 zee.digest NOT NULL,capital_approval_sha256 zee.digest NOT NULL,
 created_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER continuous_execution_immutable BEFORE UPDATE OR DELETE ON zee.testnet_continuous_execution_generations FOR EACH ROW EXECUTE FUNCTION zee.immutable();
REVOKE ALL ON zee.testnet_continuous_execution_generations FROM PUBLIC,zeeswap_api,zeeswap_worker,zeeswap_reader;
GRANT SELECT ON zee.testnet_continuous_execution_generations TO CURRENT_USER,zeeswap_worker,zeeswap_reader;
CREATE FUNCTION zee.testnet_continuous_current_execution(p_policy zee.digest)
 RETURNS TABLE(authorization_sha256 zee.digest,worker_config_sha256 zee.digest,execution_manifest_sha256 zee.digest,execution_approval_sha256 zee.digest,capital_approval_sha256 zee.digest)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
 SELECT x.authorization_sha256,x.worker_config_sha256,x.execution_manifest_sha256,x.execution_approval_sha256,x.capital_approval_sha256
 FROM(SELECT g.authorization_sha256,g.worker_config_sha256,g.execution_manifest_sha256,g.execution_approval_sha256,g.capital_approval_sha256,g.generation FROM zee.testnet_continuous_execution_generations g WHERE g.policy_sha256=p_policy
 UNION ALL SELECT a.authorization_sha256,a.worker_config_sha256,a.execution_manifest_sha256,a.execution_approval_sha256,a.capital_approval_sha256,0 FROM zee.testnet_continuous_demo_authorizations a WHERE a.policy_sha256=p_policy) x
 WHERE zee.testnet_continuous_demo_enabled(p_policy) ORDER BY x.generation DESC LIMIT 1
$$;
CREATE FUNCTION zee.testnet_continuous_execution_authorized(p_policy zee.digest,p_worker zee.digest,p_manifest zee.digest,p_execution zee.digest,p_capital zee.digest) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
 SELECT EXISTS(SELECT 1 FROM zee.testnet_continuous_current_execution(p_policy) a WHERE (a.worker_config_sha256,a.execution_manifest_sha256,a.execution_approval_sha256,a.capital_approval_sha256)=(p_worker,p_manifest,p_execution,p_capital))
$$;
CREATE FUNCTION zee.testnet_continuous_capital_authorized(p_policy zee.digest,p_capital zee.digest) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
 SELECT EXISTS(SELECT 1 FROM zee.testnet_continuous_current_execution(p_policy) WHERE capital_approval_sha256=p_capital)
$$;
CREATE FUNCTION zee.publish_testnet_continuous_successor(p_policy zee.digest,p_previous zee.digest,p_authorization zee.digest,p_human zee.digest,p_qualification zee.digest,p_epoch bigint,p_xmin text,p_publish_before timestamptz,p_worker zee.digest,p_manifest zee.digest,p_execution zee.digest,p_capital zee.digest) RETURNS xid8
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE stamp timestamptz;
BEGIN
 PERFORM zee.lock_observer_cycle();stamp:=clock_timestamp();
 PERFORM 1 FROM zee.runtime_control WHERE singleton AND epoch=p_epoch AND xmin::text=p_xmin AND epoch=zee.testnet_policy_execution_epoch(p_policy) AND dispatch_enabled AND NOT reconciliation_required AND NOT accepting_orders FOR UPDATE;
 IF NOT FOUND OR zee.testnet_global_slot_busy() OR zee.testnet_continuous_late_exposure(p_policy)
 OR NOT EXISTS(SELECT 1 FROM zee.testnet_continuous_current_execution(p_policy) WHERE authorization_sha256=p_previous)
 OR EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND classid=84532 AND objid=20261026 AND granted AND pid<>pg_backend_pid())
 OR p_publish_before<=stamp OR p_publish_before>stamp+interval '5 minutes'
 OR decode(repeat('00',32),'hex') IN(p_authorization,p_human,p_qualification,p_worker,p_manifest,p_execution,p_capital)
 THEN RAISE EXCEPTION 'CONTINUOUS_SUCCESSOR_BOUNDARY';END IF;
 IF (SELECT count(*) FROM zee.scanner_checkpoints WHERE network IN('base-sepolia','zcash-testnet') AND observed_at BETWEEN stamp-interval '30 seconds' AND stamp+interval '5 seconds')<>2 THEN RAISE EXCEPTION 'CONTINUOUS_SUCCESSOR_SOURCE_STALE';END IF;
 INSERT INTO zee.testnet_continuous_execution_generations(policy_sha256,authorization_sha256,previous_authorization_sha256,human_approval_sha256,qualification_sha256,worker_config_sha256,execution_manifest_sha256,execution_approval_sha256,capital_approval_sha256)
 VALUES(p_policy,p_authorization,p_previous,p_human,p_qualification,p_worker,p_manifest,p_execution,p_capital);
 RETURN pg_current_xact_id();
END $$;
REVOKE ALL ON FUNCTION zee.publish_testnet_continuous_successor(zee.digest,zee.digest,zee.digest,zee.digest,zee.digest,bigint,text,timestamptz,zee.digest,zee.digest,zee.digest,zee.digest) FROM PUBLIC,zeeswap_api,zeeswap_worker,zeeswap_reader;
REVOKE ALL ON FUNCTION zee.testnet_continuous_current_execution(zee.digest),zee.testnet_continuous_execution_authorized(zee.digest,zee.digest,zee.digest,zee.digest,zee.digest),zee.testnet_continuous_capital_authorized(zee.digest,zee.digest) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.testnet_continuous_current_execution(zee.digest),zee.testnet_continuous_execution_authorized(zee.digest,zee.digest,zee.digest,zee.digest,zee.digest),zee.testnet_continuous_capital_authorized(zee.digest,zee.digest) TO zeeswap_worker,zeeswap_reader;
CREATE FUNCTION zee.enable_testnet_continuous_intake(p_policy zee.digest,p_authorization zee.digest,p_epoch bigint,p_xmin text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 PERFORM zee.lock_observer_cycle();
 IF NOT EXISTS(SELECT 1 FROM zee.testnet_continuous_current_execution(p_policy) WHERE authorization_sha256=p_authorization)
 OR zee.testnet_global_slot_busy() OR zee.testnet_continuous_late_exposure(p_policy)
 OR (SELECT count(*) FROM zee.scanner_checkpoints WHERE network IN('base-sepolia','zcash-testnet') AND observed_at BETWEEN clock_timestamp()-interval '30 seconds' AND clock_timestamp()+interval '5 seconds')<>2
 THEN RAISE EXCEPTION 'CONTINUOUS_SUCCESSOR_INTAKE_BOUNDARY';END IF;
 UPDATE zee.runtime_control SET accepting_orders=true WHERE singleton AND epoch=p_epoch AND xmin::text=p_xmin AND epoch=zee.testnet_policy_execution_epoch(p_policy) AND dispatch_enabled AND NOT reconciliation_required AND NOT accepting_orders;
 IF NOT FOUND THEN RAISE EXCEPTION 'CONTINUOUS_SUCCESSOR_INTAKE_CONTROL';END IF;
END $$;
REVOKE ALL ON FUNCTION zee.enable_testnet_continuous_intake(zee.digest,zee.digest,bigint,text) FROM PUBLIC,zeeswap_api,zeeswap_worker,zeeswap_reader;
