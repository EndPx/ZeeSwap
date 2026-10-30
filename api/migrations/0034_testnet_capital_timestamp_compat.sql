-- Same-proof timestamp transport compatibility only. No row or authority changes.
DO $$ BEGIN
 IF current_user<>'zee_app_admin_20261023' OR to_regprocedure('zee.testnet_unfunded_reuse_enabled(zee.digest)') IS NULL
 THEN RAISE EXCEPTION 'SERVICE_TIMESTAMP_ADMIN_0033_REQUIRED';END IF;
END $$;
CREATE OR REPLACE FUNCTION zee.record_testnet_worker_readiness(p_policy zee.digest,p_capital_observed_at timestamptz,p_proof zee.digest)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE p zee.root_testnet_service_policies;c zee.runtime_control;old zee.testnet_service_runtime;stamp timestamptz:=clock_timestamp();
BEGIN
 IF NOT zee.testnet_worker_lease_owned(pg_backend_pid()) THEN RAISE EXCEPTION 'SERVICE_WORKER_LEASE_REQUIRED';END IF;
 PERFORM zee.lock_observer_cycle();stamp:=clock_timestamp();SELECT * INTO STRICT p FROM zee.root_testnet_service_policies WHERE policy_sha256=p_policy;
 SELECT * INTO STRICT c FROM zee.runtime_control WHERE singleton;
 IF c.epoch<>p.active_epoch OR c.reconciliation_required OR NOT c.dispatch_enabled THEN RAISE EXCEPTION 'SERVICE_RUNTIME_FENCED';END IF;
 IF p_capital_observed_at IS NULL OR p_capital_observed_at>stamp+interval '5 seconds' THEN RAISE EXCEPTION 'SERVICE_CAPITAL_STALE';END IF;
 SELECT * INTO old FROM zee.testnet_service_runtime WHERE policy_sha256=p_policy FOR UPDATE;
 -- Legacy node-postgres Date transport drops microseconds; restore only the
 -- exact previously stored instant for an unchanged proof, never a new clock.
 IF FOUND AND zee.testnet_policy_nonexpiring(p_policy) AND zee.testnet_unfunded_reuse_enabled(p_policy)
 AND p_proof=old.capital_proof_digest AND p_capital_observed_at=date_trunc('milliseconds',old.capital_observed_at)
 THEN p_capital_observed_at:=old.capital_observed_at;END IF;
 IF (NOT FOUND OR p_capital_observed_at>old.capital_observed_at) AND p_capital_observed_at<stamp-interval '60 seconds' THEN RAISE EXCEPTION 'SERVICE_CAPITAL_STALE';END IF;
 IF FOUND AND (p_capital_observed_at<old.capital_observed_at OR (p_capital_observed_at=old.capital_observed_at AND p_proof<>old.capital_proof_digest)) THEN RAISE EXCEPTION 'SERVICE_CAPITAL_PROOF_REGRESSION';END IF;
 INSERT INTO zee.testnet_service_runtime VALUES(p_policy,c.epoch,pg_backend_pid(),stamp,p_capital_observed_at,p_proof)
 ON CONFLICT(policy_sha256) DO UPDATE SET control_epoch=excluded.control_epoch,worker_backend_pid=excluded.worker_backend_pid,
 worker_ready_at=excluded.worker_ready_at,capital_observed_at=excluded.capital_observed_at,capital_proof_digest=excluded.capital_proof_digest;
END $$;
