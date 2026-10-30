-- Explicit Root service lifetime only. Apply exactly this migration in a reviewed
-- transaction, never a migration sweep. Existing policy rows/lineage stay immutable.
DO $$ BEGIN
 IF current_user<>'zee_app_admin_20261023' OR to_regclass('zee.testnet_policy_predecessors') IS NULL
 THEN RAISE EXCEPTION 'SERVICE_LIFETIME_ADMIN_0030_REQUIRED';END IF;
END $$;
CREATE TABLE zee.testnet_service_lifetime_authorizations(
 policy_sha256 zee.digest PRIMARY KEY,
 authorization_id uuid NOT NULL UNIQUE,authorization_sha256 zee.digest NOT NULL UNIQUE,
 human_approval_sha256 zee.digest NOT NULL,
 purpose text NOT NULL CHECK(purpose='ROOT_TESTNET_SERVICE_NO_EXPIRY'),
 service_expires_at timestamptz CHECK(service_expires_at IS NULL),
 original_activation_xid xid8 NOT NULL,active_epoch bigint NOT NULL,
 control_xmin text NOT NULL,profile_sha256 zee.digest NOT NULL,
 settlement_contract text NOT NULL,token_contract text NOT NULL,
 original_expires_at timestamptz NOT NULL,
 root_approved_at timestamptz NOT NULL,root_publish_before timestamptz NOT NULL,
 created_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(root_publish_before>root_approved_at AND root_publish_before<=root_approved_at+interval '30 minutes')
);
CREATE FUNCTION zee.check_testnet_service_lifetime() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE p zee.root_testnet_service_policies;c zee.runtime_control;cx text;stamp timestamptz;
BEGIN
 PERFORM zee.lock_observer_cycle();
 SELECT * INTO STRICT p FROM zee.root_testnet_service_policies WHERE policy_sha256=NEW.policy_sha256;
 SELECT xmin::text INTO STRICT cx FROM zee.runtime_control WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT c FROM zee.runtime_control WHERE singleton;stamp:=clock_timestamp();
 IF (NEW.original_activation_xid,NEW.active_epoch,NEW.profile_sha256,NEW.settlement_contract,NEW.token_contract,NEW.original_expires_at)
 IS DISTINCT FROM (p.created_xid,p.active_epoch,p.profile_sha256,p.settlement_contract,p.token_contract,p.expires_at)
 OR NEW.control_xmin<>cx OR c.epoch<>p.active_epoch OR NOT c.accepting_orders OR NOT c.dispatch_enabled OR c.reconciliation_required
 OR pg_xact_status(NEW.original_activation_xid)<>'committed'
 OR NEW.root_approved_at>stamp+interval '5 seconds' OR NEW.root_publish_before<=stamp
 OR NEW.created_xid<>pg_current_xact_id() OR NEW.created_at NOT BETWEEN stamp-interval '30 seconds' AND stamp+interval '5 seconds'
 THEN RAISE EXCEPTION 'SERVICE_LIFETIME_EXACT_CURRENT_AUTHORITY';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER service_lifetime_scope BEFORE INSERT ON zee.testnet_service_lifetime_authorizations FOR EACH ROW EXECUTE FUNCTION zee.check_testnet_service_lifetime();
CREATE TRIGGER service_lifetime_immutable BEFORE UPDATE OR DELETE ON zee.testnet_service_lifetime_authorizations FOR EACH ROW EXECUTE FUNCTION zee.immutable();
REVOKE ALL ON zee.testnet_service_lifetime_authorizations FROM PUBLIC,zeeswap_api,zeeswap_worker,zeeswap_reader;
REVOKE ALL ON zee.testnet_service_lifetime_authorizations FROM CURRENT_USER;
GRANT SELECT,INSERT ON zee.testnet_service_lifetime_authorizations TO CURRENT_USER;
GRANT SELECT ON zee.testnet_service_lifetime_authorizations TO zeeswap_worker,zeeswap_reader;
CREATE FUNCTION zee.testnet_policy_nonexpiring(p_policy zee.digest) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
 SELECT EXISTS(SELECT 1 FROM zee.testnet_service_lifetime_authorizations a JOIN zee.root_testnet_service_policies p USING(policy_sha256)
 WHERE a.policy_sha256=p_policy AND a.purpose='ROOT_TESTNET_SERVICE_NO_EXPIRY' AND a.service_expires_at IS NULL
 AND (a.original_activation_xid,a.active_epoch,a.profile_sha256,a.settlement_contract,a.token_contract,a.original_expires_at)
 IS NOT DISTINCT FROM (p.created_xid,p.active_epoch,p.profile_sha256,p.settlement_contract,p.token_contract,p.expires_at))
$$;
REVOKE ALL ON FUNCTION zee.check_testnet_service_lifetime(),zee.testnet_policy_nonexpiring(zee.digest) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.testnet_policy_nonexpiring(zee.digest) TO zeeswap_worker,zeeswap_reader;

CREATE OR REPLACE FUNCTION zee.testnet_policy_gate(p_policy zee.digest) RETURNS zee.root_testnet_service_policies
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE p zee.root_testnet_service_policies;c zee.runtime_control;r zee.testnet_service_runtime;stamp timestamptz:=clock_timestamp();
BEGIN
 PERFORM zee.lock_observer_cycle();stamp:=clock_timestamp();SELECT * INTO STRICT p FROM zee.root_testnet_service_policies WHERE policy_sha256=p_policy;
 SELECT * INTO STRICT c FROM zee.runtime_control WHERE singleton;
 IF p.expires_at<=stamp AND NOT zee.testnet_policy_nonexpiring(p_policy) THEN RAISE EXCEPTION 'SERVICE_POLICY_EXPIRED';END IF;
 IF c.epoch<>p.active_epoch OR c.reconciliation_required OR NOT c.accepting_orders OR NOT c.dispatch_enabled THEN RAISE EXCEPTION 'SERVICE_RUNTIME_FENCED';END IF;
 IF (SELECT count(*) FROM zee.assets WHERE id IN('TAZ','mockUSDC') AND live_enabled)<>2 OR EXISTS(SELECT 1 FROM zee.assets WHERE id='baseETH' AND live_enabled)
 OR NOT EXISTS(SELECT 1 FROM zee.assets WHERE id='TAZ' AND decimals=8 AND network='zcash-testnet' AND contract_address IS NULL)
 OR NOT EXISTS(SELECT 1 FROM zee.assets WHERE id='mockUSDC' AND decimals=6 AND network='base-sepolia' AND lower(contract_address)=p.token_contract)
 THEN RAISE EXCEPTION 'SERVICE_ROUTE_UNAVAILABLE';END IF;
 IF (SELECT count(*) FROM zee.scanner_checkpoints WHERE network IN('zcash-testnet','base-sepolia') AND observed_at BETWEEN stamp-interval '60 seconds' AND stamp+interval '5 seconds')<>2 THEN RAISE EXCEPTION 'SERVICE_SOURCE_STALE';END IF;
 SELECT * INTO r FROM zee.testnet_service_runtime WHERE policy_sha256=p_policy;
 IF NOT FOUND OR r.control_epoch<>c.epoch OR NOT zee.testnet_worker_lease_owned(r.worker_backend_pid)
 OR r.worker_ready_at NOT BETWEEN stamp-interval '60 seconds' AND stamp+interval '5 seconds'
 OR r.capital_observed_at NOT BETWEEN stamp-interval '60 seconds' AND stamp+interval '5 seconds'
 THEN RAISE EXCEPTION 'SERVICE_WORKER_OR_CAPITAL_STALE';END IF;
 RETURN p;
END $$;

CREATE OR REPLACE FUNCTION zee.testnet_policy_availability(p_policy zee.digest) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE p zee.root_testnet_service_policies;c zee.runtime_control;r zee.testnet_service_runtime;stamp timestamptz:=clock_timestamp();nf integer;nr integer;nq integer;na integer;reason text;f boolean;v boolean;
BEGIN
 SELECT * INTO p FROM zee.root_testnet_service_policies WHERE policy_sha256=p_policy;
 IF NOT FOUND THEN RETURN jsonb_build_object('version',1,'status','disabled','checkedAt',stamp,'policy',NULL);END IF;
 SELECT * INTO c FROM zee.runtime_control WHERE singleton;SELECT * INTO r FROM zee.testnet_service_runtime WHERE policy_sha256=p_policy;
 SELECT count(*) FILTER(WHERE direction='ZCASH_TO_BASE'),count(*) FILTER(WHERE direction='BASE_TO_ZCASH') INTO nf,nr FROM zee.testnet_policy_admissions WHERE policy_sha256 IN(SELECT zee.testnet_policy_lineage(p_policy));
 SELECT count(*) INTO nq FROM zee.testnet_policy_quotes WHERE policy_sha256 IN(SELECT zee.testnet_policy_lineage(p_policy));
 SELECT count(*) INTO na FROM zee.orders WHERE state NOT IN('SETTLED','REFUNDED','EXPIRED_UNFUNDED');
 IF p.expires_at<=stamp AND NOT zee.testnet_policy_nonexpiring(p_policy) THEN reason:='POLICY_EXPIRED';
 ELSIF c.reconciliation_required THEN reason:='RECONCILING';
 ELSIF c.epoch<>p.active_epoch OR NOT c.accepting_orders OR NOT c.dispatch_enabled THEN reason:='RUNTIME_PAUSED';
 ELSIF (SELECT count(*) FROM zee.assets WHERE id IN('TAZ','mockUSDC') AND live_enabled)<>2 OR EXISTS(SELECT 1 FROM zee.assets WHERE id='baseETH' AND live_enabled) OR NOT EXISTS(SELECT 1 FROM zee.assets WHERE id='TAZ' AND decimals=8 AND network='zcash-testnet' AND contract_address IS NULL) OR NOT EXISTS(SELECT 1 FROM zee.assets WHERE id='mockUSDC' AND decimals=6 AND network='base-sepolia' AND lower(contract_address)=p.token_contract) THEN reason:='RUNTIME_PAUSED';
 ELSIF (SELECT count(*) FROM zee.scanner_checkpoints WHERE network IN('zcash-testnet','base-sepolia') AND observed_at BETWEEN stamp-interval '60 seconds' AND stamp+interval '5 seconds')<>2 THEN reason:='SOURCE_STALE';
 ELSIF nf>=2 AND nr>=2 THEN reason:='POLICY_EXHAUSTED';ELSIF nq>=32 THEN reason:='QUOTE_LIMIT';
 ELSIF r.policy_sha256 IS NULL OR r.control_epoch<>c.epoch OR NOT zee.testnet_worker_lease_owned(r.worker_backend_pid) THEN reason:='WORKER_OR_CAPITAL_STALE';
 ELSIF r.worker_ready_at NOT BETWEEN stamp-interval '60 seconds' AND stamp+interval '5 seconds' THEN reason:='WORKER_OR_CAPITAL_STALE';
 ELSIF zee.testnet_global_slot_busy() THEN reason:='GLOBAL_ORDER_ACTIVE';
 ELSIF r.capital_observed_at NOT BETWEEN stamp-interval '60 seconds' AND stamp+interval '5 seconds' THEN reason:='CAPITAL_UNAVAILABLE';END IF;
 f:=nf<2 AND NOT EXISTS(SELECT 1 FROM(VALUES('mockUSDC','principal',100000::numeric),('TAZ','fee',10000::numeric),('baseETH','fee',100000000000000::numeric)) x(asset,purpose,amount) LEFT JOIN zee.inventory_accounts i USING(asset,purpose) WHERE i.asset IS NULL OR i.balance-i.reserved<x.amount);
 v:=nr<2 AND NOT EXISTS(SELECT 1 FROM(VALUES('TAZ','principal',100000::numeric),('TAZ','fee',10000::numeric),('baseETH','fee',100000000000000::numeric)) x(asset,purpose,amount) LEFT JOIN zee.inventory_accounts i USING(asset,purpose) WHERE i.asset IS NULL OR i.balance-i.reserved<x.amount);
 IF reason IS NULL AND NOT f AND NOT v THEN reason:='CAPITAL_UNAVAILABLE';END IF;
 RETURN jsonb_build_object('version',CASE WHEN zee.testnet_policy_nonexpiring(p_policy) THEN 3 ELSE 1 END,'status',CASE WHEN reason IS NULL THEN 'ready' WHEN reason IN('POLICY_EXHAUSTED','QUOTE_LIMIT') THEN 'policy_exhausted' WHEN reason='POLICY_EXPIRED' THEN 'policy_expired' WHEN reason='GLOBAL_ORDER_ACTIVE' THEN 'busy' WHEN reason='RECONCILING' THEN 'reconciling' WHEN reason='SOURCE_STALE' THEN 'source_unavailable' WHEN reason='WORKER_OR_CAPITAL_STALE' THEN 'worker_unavailable' WHEN reason='CAPITAL_UNAVAILABLE' THEN 'capital_unavailable' ELSE 'paused' END,'checkedAt',stamp,
 'policy',jsonb_build_object('id',p.policy_id,'sha256',encode(p_policy,'hex'),'expiresAt',CASE WHEN zee.testnet_policy_nonexpiring(p_policy) THEN NULL ELSE p.expires_at END,'inputAmountAtomic','100000','maxAcceptedByDirection',jsonb_build_object('ZCASH_TO_BASE',2,'BASE_TO_ZCASH',2),'remainingByDirection',jsonb_build_object('ZCASH_TO_BASE',2-nf,'BASE_TO_ZCASH',2-nr),'maxConcurrent',1,'activeOrders',na,
 'availableByDirection',jsonb_build_object('ZCASH_TO_BASE',reason IS NULL AND f,'BASE_TO_ZCASH',reason IS NULL AND v),'remainingQuotes',32-nq) || CASE WHEN zee.testnet_policy_nonexpiring(p_policy) THEN jsonb_build_object('lifetime','nonexpiring','lifetimeAuthorizationSha256',(SELECT encode(authorization_sha256,'hex') FROM zee.testnet_service_lifetime_authorizations WHERE policy_sha256=p_policy)) ELSE '{}'::jsonb END);
END $$;
