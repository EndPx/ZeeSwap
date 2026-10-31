-- Opt-in Root authority for repeated recovery of fully closed books only.
-- No existing policy, grant, budget, admission, capital clock or receipt changes.
DO $$ BEGIN
 IF current_user<>'zee_app_admin_20261023' OR to_regprocedure('zee.testnet_policy_execution_epoch(zee.digest)') IS NULL
 THEN RAISE EXCEPTION 'CLOSED_RECOVERY_BASELINE';END IF;
 IF has_column_privilege(current_user,'zee.root_testnet_service_policies','policy_sha256','REFERENCES')
 THEN RAISE EXCEPTION 'CLOSED_RECOVERY_POLICY_ACL_BASELINE';END IF;
END $$;
-- 0020 deliberately stripped the owner's REFERENCES privilege. Borrow only
-- this column privilege to install actual FKs, then restore its exact ACL.
GRANT REFERENCES(policy_sha256) ON zee.root_testnet_service_policies TO CURRENT_USER;
CREATE TABLE zee.testnet_closed_recovery_authorizations(
 authorization_sha256 zee.digest PRIMARY KEY,policy_sha256 zee.digest NOT NULL UNIQUE REFERENCES zee.root_testnet_service_policies(policy_sha256),
 original_epoch bigint NOT NULL CHECK(original_epoch=242),initial_execution_epoch bigint NOT NULL CHECK(initial_execution_epoch=244),
 worker_config_sha256 zee.digest NOT NULL,execution_manifest_sha256 zee.digest NOT NULL,execution_approval_sha256 zee.digest NOT NULL,
 source_identity_digest zee.digest NOT NULL,created_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE zee.testnet_closed_recovery_generations(
 policy_sha256 zee.digest NOT NULL REFERENCES zee.root_testnet_service_policies(policy_sha256),
 effective_epoch bigint PRIMARY KEY CHECK(effective_epoch>244 AND effective_epoch%2=0),
 authorization_sha256 zee.digest NOT NULL REFERENCES zee.testnet_closed_recovery_authorizations(authorization_sha256),
 previous_execution_epoch bigint NOT NULL,paused_epoch bigint NOT NULL,paused_xmin text NOT NULL CHECK(paused_xmin ~ '^[1-9][0-9]*$'),
 qualification_sha256 zee.digest NOT NULL,created_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(previous_execution_epoch>=244 AND previous_execution_epoch%2=0 AND paused_epoch>previous_execution_epoch AND effective_epoch=(paused_epoch/2+1)*2)
);
REVOKE REFERENCES(policy_sha256) ON zee.root_testnet_service_policies FROM CURRENT_USER;
CREATE TRIGGER closed_recovery_authorization_immutable BEFORE UPDATE OR DELETE ON zee.testnet_closed_recovery_authorizations FOR EACH ROW EXECUTE FUNCTION zee.immutable();
CREATE TRIGGER closed_recovery_generation_immutable BEFORE UPDATE OR DELETE ON zee.testnet_closed_recovery_generations FOR EACH ROW EXECUTE FUNCTION zee.immutable();
REVOKE ALL ON zee.testnet_closed_recovery_authorizations,zee.testnet_closed_recovery_generations FROM PUBLIC,zeeswap_api,zeeswap_worker,zeeswap_reader;
GRANT SELECT ON zee.testnet_closed_recovery_authorizations,zee.testnet_closed_recovery_generations TO zeeswap_worker,zeeswap_reader;
CREATE OR REPLACE FUNCTION zee.testnet_policy_execution_epoch(p_policy zee.digest) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
 SELECT COALESCE((SELECT max(g.effective_epoch) FROM zee.testnet_closed_recovery_generations g WHERE g.policy_sha256=p_policy),r.effective_epoch,p.active_epoch)
 FROM zee.root_testnet_service_policies p LEFT JOIN zee.testnet_policy_execution_resumptions r USING(policy_sha256) WHERE p.policy_sha256=p_policy
$$;
-- This includes historical cohorts. A terminal label alone is insufficient.
CREATE FUNCTION zee.testnet_policy_closed_books() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
 SELECT NOT EXISTS(SELECT 1 FROM zee.orders WHERE state NOT IN('SETTLED','REFUNDED','EXPIRED_UNFUNDED'))
 AND NOT EXISTS(SELECT 1 FROM zee.obligations WHERE state<>'DISCHARGED')
 AND NOT EXISTS(SELECT 1 FROM zee.reservations WHERE released_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM zee.inventory_accounts WHERE reserved<>0)
 AND NOT EXISTS(SELECT 1 FROM zee.inventory_accounts i WHERE
  i.balance-i.reserved<>(SELECT COALESCE(sum(l.amount),0) FROM zee.ledger_entries l WHERE l.asset=i.asset AND l.bucket=i.purpose||':available')
  OR i.reserved<>(SELECT COALESCE(sum(l.amount),0) FROM zee.ledger_entries l WHERE l.asset=i.asset AND l.bucket=i.purpose||':reserved'))
 AND NOT EXISTS(SELECT 1 FROM zee.deposits d LEFT JOIN zee.obligations o ON o.deposit_id=d.id WHERE d.confirmed_at IS NULL OR o.deposit_id IS NULL)
 AND NOT EXISTS(SELECT 1 FROM zee.base_attempts WHERE NOT confirmed)
 AND NOT EXISTS(SELECT 1 FROM zee.escrow_commits WHERE NOT confirmed)
 AND NOT EXISTS(SELECT 1 FROM zee.reverse_payouts WHERE NOT confirmed)
 AND NOT EXISTS(SELECT 1 FROM zee.escrow_settlements WHERE NOT confirmed)
 AND NOT EXISTS(SELECT 1 FROM zee.source_refunds WHERE NOT confirmed OR (base_hash IS NOT NULL AND NOT base_confirmed))
 AND NOT EXISTS(SELECT 1 FROM zee.operations WHERE state<>'CONFIRMED')
 AND NOT EXISTS(SELECT 1 FROM zee.chain_transactions WHERE state<>'CONFIRMED')
 AND NOT EXISTS(SELECT 1 FROM zee.outbox_jobs WHERE status<>'DONE')
 AND NOT EXISTS(SELECT 1 FROM zee.ledger_entries GROUP BY event_id,asset HAVING sum(amount)<>0 OR count(*)<2)
 AND NOT EXISTS(SELECT 1 FROM zee.ledger_entries WHERE bucket='customer:liability' GROUP BY order_id,asset HAVING sum(amount)<>0)
 AND NOT EXISTS(SELECT 1 FROM zee.orders WHERE state='EXPIRED_UNFUNDED' AND primary_deposit IS NOT NULL)
$$;
REVOKE ALL ON FUNCTION zee.testnet_policy_closed_books() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.testnet_policy_closed_books() TO zeeswap_worker,zeeswap_reader;
CREATE FUNCTION zee.resume_testnet_closed_execution(p_authorization zee.digest,p_paused_epoch bigint,p_paused_xmin text,p_qualification zee.digest,
 p_worker_config zee.digest,p_manifest zee.digest,p_execution zee.digest,p_source_identity zee.digest) RETURNS xid8
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE a zee.testnet_closed_recovery_authorizations;p zee.root_testnet_service_policies;previous bigint;stamp timestamptz;
BEGIN
 IF NOT pg_try_advisory_xact_lock(84532,20261023) OR NOT pg_try_advisory_xact_lock(84532,20261026) THEN RAISE EXCEPTION 'CLOSED_RECOVERY_ACTOR_RUNNING';END IF;
 PERFORM zee.lock_observer_cycle();stamp:=clock_timestamp();
 SELECT * INTO STRICT a FROM zee.testnet_closed_recovery_authorizations WHERE authorization_sha256=p_authorization;
 SELECT * INTO STRICT p FROM zee.root_testnet_service_policies WHERE policy_sha256=a.policy_sha256;
 previous:=zee.testnet_policy_execution_epoch(a.policy_sha256);
 IF p.active_epoch<>a.original_epoch OR previous<a.initial_execution_epoch OR previous%2<>0
 OR (a.worker_config_sha256,a.execution_manifest_sha256,a.execution_approval_sha256,a.source_identity_digest)
 IS DISTINCT FROM(p_worker_config,p_manifest,p_execution,p_source_identity) OR p.source_identity_digest<>a.source_identity_digest
 OR NOT zee.testnet_policy_nonexpiring(a.policy_sha256) OR NOT zee.testnet_unfunded_reuse_enabled(a.policy_sha256)
 THEN RAISE EXCEPTION 'CLOSED_RECOVERY_AUTHORITY';END IF;
 PERFORM 1 FROM zee.runtime_control WHERE singleton AND epoch=p_paused_epoch AND epoch>previous AND xmin::text=p_paused_xmin
 AND NOT accepting_orders AND NOT dispatch_enabled AND reconciliation_required FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CLOSED_RECOVERY_PAUSED_CAS';END IF;
 IF NOT zee.testnet_policy_closed_books() THEN RAISE EXCEPTION 'CLOSED_RECOVERY_NOT_CLOSED';END IF;
 IF (SELECT count(*) FROM zee.scanner_checkpoints WHERE network IN('zcash-testnet','base-sepolia') AND observed_at BETWEEN stamp-interval '30 seconds' AND stamp+interval '5 seconds')<>2
 THEN RAISE EXCEPTION 'CLOSED_RECOVERY_SOURCE_STALE';END IF;
 INSERT INTO zee.testnet_closed_recovery_generations(policy_sha256,effective_epoch,authorization_sha256,previous_execution_epoch,paused_epoch,paused_xmin,qualification_sha256)
 VALUES(a.policy_sha256,(p_paused_epoch/2+1)*2,p_authorization,previous,p_paused_epoch,p_paused_xmin,p_qualification);
 UPDATE zee.runtime_control SET epoch=(p_paused_epoch/2+1)*2,accepting_orders=false,dispatch_enabled=true,reconciliation_required=false WHERE singleton;
 RETURN pg_current_xact_id();
END $$;
-- Fence admission under the same observer/admission mutex before stopping an idle worker.
CREATE FUNCTION zee.pause_testnet_closed_execution(p_authorization zee.digest,p_effective_epoch bigint,p_control_xmin text) RETURNS xid8
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE a zee.testnet_closed_recovery_authorizations;
BEGIN
 PERFORM zee.lock_observer_cycle();
 SELECT * INTO STRICT a FROM zee.testnet_closed_recovery_authorizations WHERE authorization_sha256=p_authorization;
 PERFORM 1 FROM zee.runtime_control WHERE singleton AND epoch=p_effective_epoch AND xmin::text=p_control_xmin
 AND epoch=zee.testnet_policy_execution_epoch(a.policy_sha256) AND dispatch_enabled AND NOT reconciliation_required FOR UPDATE;
 IF NOT FOUND OR NOT zee.testnet_policy_nonexpiring(a.policy_sha256) OR NOT zee.testnet_unfunded_reuse_enabled(a.policy_sha256)
 THEN RAISE EXCEPTION 'CLOSED_RECOVERY_PAUSE_CAS';END IF;
 IF NOT zee.testnet_policy_closed_books() THEN RAISE EXCEPTION 'CLOSED_RECOVERY_NOT_CLOSED';END IF;
 UPDATE zee.runtime_control SET epoch=p_effective_epoch+1,accepting_orders=false,dispatch_enabled=false,reconciliation_required=true WHERE singleton;
 RETURN pg_current_xact_id();
END $$;
-- A new worker must establish real fresh capital before intake is enabled.
CREATE FUNCTION zee.enable_testnet_closed_intake(p_authorization zee.digest,p_effective_epoch bigint,p_control_xmin text) RETURNS xid8
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE a zee.testnet_closed_recovery_authorizations;r zee.testnet_service_runtime;stamp timestamptz;
BEGIN
 PERFORM zee.lock_observer_cycle();stamp:=clock_timestamp();
 SELECT * INTO STRICT a FROM zee.testnet_closed_recovery_authorizations WHERE authorization_sha256=p_authorization;
 PERFORM 1 FROM zee.runtime_control WHERE singleton AND epoch=p_effective_epoch AND xmin::text=p_control_xmin
 AND epoch=zee.testnet_policy_execution_epoch(a.policy_sha256) AND NOT accepting_orders AND dispatch_enabled AND NOT reconciliation_required FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM zee.testnet_closed_recovery_generations WHERE effective_epoch=p_effective_epoch AND authorization_sha256=p_authorization)
 OR NOT zee.testnet_policy_nonexpiring(a.policy_sha256) OR NOT zee.testnet_unfunded_reuse_enabled(a.policy_sha256)
 THEN RAISE EXCEPTION 'CLOSED_RECOVERY_INTAKE_CAS';END IF;
 IF NOT zee.testnet_policy_closed_books() THEN RAISE EXCEPTION 'CLOSED_RECOVERY_NOT_CLOSED';END IF;
 IF (SELECT count(*) FROM zee.scanner_checkpoints WHERE network IN('zcash-testnet','base-sepolia') AND observed_at BETWEEN stamp-interval '30 seconds' AND stamp+interval '5 seconds')<>2
 THEN RAISE EXCEPTION 'CLOSED_RECOVERY_SOURCE_STALE';END IF;
 SELECT * INTO r FROM zee.testnet_service_runtime WHERE policy_sha256=a.policy_sha256;
 IF NOT FOUND OR r.control_epoch<>p_effective_epoch OR NOT zee.testnet_worker_lease_owned(r.worker_backend_pid)
 OR r.worker_ready_at NOT BETWEEN stamp-interval '30 seconds' AND stamp+interval '5 seconds'
 OR r.capital_observed_at NOT BETWEEN stamp-interval '30 seconds' AND stamp+interval '5 seconds'
 THEN RAISE EXCEPTION 'CLOSED_RECOVERY_ACTUAL_CAPITAL_REQUIRED';END IF;
 UPDATE zee.runtime_control SET accepting_orders=true WHERE singleton;
 RETURN pg_current_xact_id();
END $$;
REVOKE ALL ON FUNCTION zee.resume_testnet_closed_execution(zee.digest,bigint,text,zee.digest,zee.digest,zee.digest,zee.digest,zee.digest),zee.pause_testnet_closed_execution(zee.digest,bigint,text),zee.enable_testnet_closed_intake(zee.digest,bigint,text) FROM PUBLIC,zeeswap_worker,zeeswap_api,zeeswap_reader;
