-- Explicit safe-unfunded capacity reuse only. No quota, capital or policy reset.
-- Explicit Root unfunded reuse only. Apply exactly this migration in a reviewed
-- transaction, never a migration sweep. Existing policy rows/lineage stay immutable.
DO $$ BEGIN
 IF current_user<>'zee_app_admin_20261023' OR to_regclass('zee.testnet_policy_predecessors') IS NULL
 THEN RAISE EXCEPTION 'SERVICE_UNFUNDED_REUSE_ADMIN_0030_REQUIRED';END IF;
END $$;
CREATE TABLE zee.testnet_unfunded_reuse_authorizations(
 policy_sha256 zee.digest PRIMARY KEY,
 authorization_id uuid NOT NULL UNIQUE,authorization_sha256 zee.digest NOT NULL UNIQUE,
 human_approval_sha256 zee.digest NOT NULL,
 purpose text NOT NULL CHECK(purpose='ROOT_TESTNET_UNFUNDED_REUSE'),
 lifetime_authorization_sha256 zee.digest NOT NULL,journal_review_sha256 zee.digest NOT NULL,
 original_activation_xid xid8 NOT NULL,active_epoch bigint NOT NULL,
 control_xmin text NOT NULL,profile_sha256 zee.digest NOT NULL,
 settlement_contract text NOT NULL,token_contract text NOT NULL,
 original_expires_at timestamptz NOT NULL,
 root_approved_at timestamptz NOT NULL,root_publish_before timestamptz NOT NULL,
 created_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(root_publish_before>root_approved_at AND root_publish_before<=root_approved_at+interval '30 minutes')
);
CREATE FUNCTION zee.check_testnet_unfunded_reuse() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE p zee.root_testnet_service_policies;c zee.runtime_control;cx text;stamp timestamptz;
BEGIN
 PERFORM zee.lock_observer_cycle();
 SELECT * INTO STRICT p FROM zee.root_testnet_service_policies WHERE policy_sha256=NEW.policy_sha256;
 SELECT xmin::text INTO STRICT cx FROM zee.runtime_control WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT c FROM zee.runtime_control WHERE singleton;stamp:=clock_timestamp();
 IF (NEW.original_activation_xid,NEW.active_epoch,NEW.profile_sha256,NEW.settlement_contract,NEW.token_contract,NEW.original_expires_at)
 IS DISTINCT FROM (p.created_xid,p.active_epoch,p.profile_sha256,p.settlement_contract,p.token_contract,p.expires_at)
 OR NOT EXISTS(SELECT 1 FROM zee.testnet_service_lifetime_authorizations l WHERE l.policy_sha256=NEW.policy_sha256 AND l.authorization_sha256=NEW.lifetime_authorization_sha256)
 OR NEW.control_xmin<>cx OR c.epoch<>p.active_epoch OR NOT c.accepting_orders OR NOT c.dispatch_enabled OR c.reconciliation_required
 OR pg_xact_status(NEW.original_activation_xid)<>'committed'
 OR NEW.root_approved_at>stamp+interval '5 seconds' OR NEW.root_publish_before<=stamp
 OR NEW.created_xid<>pg_current_xact_id() OR NEW.created_at NOT BETWEEN stamp-interval '30 seconds' AND stamp+interval '5 seconds'
 THEN RAISE EXCEPTION 'SERVICE_UNFUNDED_REUSE_EXACT_CURRENT_AUTHORITY';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER unfunded_reuse_scope BEFORE INSERT ON zee.testnet_unfunded_reuse_authorizations FOR EACH ROW EXECUTE FUNCTION zee.check_testnet_unfunded_reuse();
CREATE TRIGGER unfunded_reuse_immutable BEFORE UPDATE OR DELETE ON zee.testnet_unfunded_reuse_authorizations FOR EACH ROW EXECUTE FUNCTION zee.immutable();
REVOKE ALL ON zee.testnet_unfunded_reuse_authorizations FROM PUBLIC,zeeswap_api,zeeswap_worker,zeeswap_reader;
REVOKE ALL ON zee.testnet_unfunded_reuse_authorizations FROM CURRENT_USER;
GRANT SELECT,INSERT ON zee.testnet_unfunded_reuse_authorizations TO CURRENT_USER;
GRANT SELECT ON zee.testnet_unfunded_reuse_authorizations TO zeeswap_worker,zeeswap_reader;
REVOKE ALL ON FUNCTION zee.check_testnet_unfunded_reuse() FROM PUBLIC;

CREATE FUNCTION zee.testnet_unfunded_reuse_enabled(p_policy zee.digest) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
 SELECT EXISTS(SELECT 1 FROM zee.testnet_unfunded_reuse_authorizations a JOIN zee.root_testnet_service_policies p USING(policy_sha256)
 JOIN zee.testnet_service_lifetime_authorizations l USING(policy_sha256)
 WHERE a.policy_sha256=p_policy AND a.lifetime_authorization_sha256=l.authorization_sha256
 AND (a.original_activation_xid,a.active_epoch,a.profile_sha256,a.settlement_contract,a.token_contract,a.original_expires_at)
 IS NOT DISTINCT FROM (p.created_xid,p.active_epoch,p.profile_sha256,p.settlement_contract,p.token_contract,p.expires_at))
$$;
CREATE FUNCTION zee.testnet_unfunded_attempt_reusable(p_order uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
 SELECT EXISTS(SELECT 1 FROM zee.orders o JOIN zee.quotes q ON q.id=o.id
 JOIN zee.scanner_checkpoints s ON s.network=CASE WHEN q.direction='ZCASH_TO_BASE' THEN 'zcash-testnet' ELSE 'base-sepolia' END
 WHERE o.id=p_order AND o.state='EXPIRED_UNFUNDED' AND o.primary_deposit IS NULL
 AND ((o.funding_cutoff_height IS NOT NULL AND s.scanned_height>=o.funding_cutoff_height+9)
 OR (o.funding_cutoff_time IS NOT NULL AND s.finalized_time>=o.funding_cutoff_time))
 AND NOT EXISTS(SELECT 1 FROM zee.deposits d WHERE d.order_id=o.id OR d.reference_hash=q.deposit_reference_hash)
 AND NOT EXISTS(SELECT 1 FROM zee.obligations WHERE order_id=o.id)
 AND NOT EXISTS(SELECT 1 FROM zee.operations WHERE order_id=o.id)
 AND NOT EXISTS(SELECT 1 FROM zee.chain_transactions t JOIN zee.operations op ON op.id=t.operation_id WHERE op.order_id=o.id)
 AND NOT EXISTS(SELECT 1 FROM zee.outbox_jobs j JOIN zee.operations op ON op.id=j.operation_id WHERE op.order_id=o.id)
 AND NOT EXISTS(SELECT 1 FROM zee.base_bindings WHERE order_id=o.id)
 AND NOT EXISTS(SELECT 1 FROM zee.base_attempts WHERE order_id=o.id)
 AND NOT EXISTS(SELECT 1 FROM zee.escrow_bindings WHERE order_id=o.id)
 AND NOT EXISTS(SELECT 1 FROM zee.escrow_commits WHERE order_id=o.id)
 AND NOT EXISTS(SELECT 1 FROM zee.reverse_payouts WHERE order_id=o.id)
 AND NOT EXISTS(SELECT 1 FROM zee.escrow_settlements WHERE order_id=o.id)
 AND NOT EXISTS(SELECT 1 FROM zee.source_refunds WHERE order_id=o.id)
 AND (SELECT count(*) FROM zee.reservations WHERE order_id=o.id)=3
 AND NOT EXISTS(SELECT 1 FROM zee.reservations r WHERE r.order_id=o.id AND
 (r.released_at IS NULL OR (r.asset,r.purpose,r.amount) NOT IN((q.destination_asset,'principal',q.output_amount),(q.payout_fee_asset,'fee',q.payout_fee),(q.refund_fee_asset,'fee',q.refund_fee))))
 AND (SELECT count(*) FROM zee.ledger_entries WHERE order_id=o.id)=12
 AND NOT EXISTS(SELECT 1 FROM zee.ledger_entries e LEFT JOIN zee.reservations r ON r.order_id=e.order_id AND r.asset=e.asset AND e.bucket IN(r.purpose||':available',r.purpose||':reserved')
 WHERE e.order_id=o.id AND (r.order_id IS NULL OR e.bucket NOT IN(r.purpose||':available',r.purpose||':reserved') OR abs(e.amount)<>r.amount))
 AND NOT EXISTS(SELECT 1 FROM zee.ledger_entries WHERE order_id=o.id GROUP BY asset,bucket HAVING count(*)<>2 OR sum(amount)<>0)
 AND (SELECT count(*) FROM zee.order_events WHERE order_id=o.id AND event_type IN('ACCEPTED','EXPIRED_UNFUNDED'))=2
 AND NOT EXISTS(SELECT 1 FROM zee.order_events WHERE order_id=o.id AND event_type NOT IN('ACCEPTED','EXPIRED_UNFUNDED')))
$$;
CREATE FUNCTION zee.testnet_policy_chargeable_admissions(p_policy zee.digest) RETURNS SETOF zee.testnet_policy_admissions
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
 SELECT a.* FROM zee.testnet_policy_admissions a WHERE a.policy_sha256 IN(SELECT zee.testnet_policy_lineage(p_policy))
 AND (NOT zee.testnet_unfunded_reuse_enabled(p_policy) OR NOT zee.testnet_unfunded_attempt_reusable(a.order_id))
$$;
REVOKE ALL ON FUNCTION zee.testnet_unfunded_reuse_enabled(zee.digest),zee.testnet_unfunded_attempt_reusable(uuid),zee.testnet_policy_chargeable_admissions(zee.digest) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.testnet_unfunded_reuse_enabled(zee.digest),zee.testnet_unfunded_attempt_reusable(uuid),zee.testnet_policy_chargeable_admissions(zee.digest) TO zeeswap_worker,zeeswap_reader;

CREATE OR REPLACE FUNCTION zee.accept_testnet_policy_quote(p_id uuid,p_policy zee.digest,p_owner zee.digest) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE q zee.quotes;p zee.root_testnet_service_policies;a zee.testnet_policy_admissions;b zee.testnet_policy_quotes;s zee.scanner_checkpoints;r record;stamp timestamptz;nf bigint;nr bigint;n bigint;
BEGIN
 PERFORM zee.lock_observer_cycle();q:=zee.check_testnet_policy_quote(p_id,p_policy,p_owner);
 SELECT * INTO STRICT b FROM zee.testnet_policy_quotes WHERE quote_id=p_id;
 IF b.policy_sha256<>p_policy OR b.owner_hash<>p_owner THEN RAISE EXCEPTION 'SERVICE_QUOTE_BINDING_CONFLICT';END IF;
 SELECT * INTO a FROM zee.testnet_policy_admissions WHERE order_id=p_id;
 IF FOUND THEN IF a.policy_sha256<>p_policy OR a.owner_hash<>p_owner OR a.direction<>q.direction THEN RAISE EXCEPTION 'SERVICE_ADMISSION_CONFLICT';END IF;RETURN p_id;END IF;
 IF EXISTS(SELECT 1 FROM zee.orders WHERE id=p_id) THEN RAISE EXCEPTION 'SERVICE_LEGACY_ORDER';END IF;
 p:=zee.testnet_policy_gate(p_policy);stamp:=clock_timestamp();IF q.expires_at<=stamp THEN RAISE EXCEPTION 'quote expired';END IF;
 SELECT count(*) FILTER(WHERE direction='ZCASH_TO_BASE'),count(*) FILTER(WHERE direction='BASE_TO_ZCASH'),count(*) INTO nf,nr,n FROM zee.testnet_policy_chargeable_admissions(p_policy);
 IF (q.direction='ZCASH_TO_BASE' AND nf>=p.forward_cap) OR (q.direction='BASE_TO_ZCASH' AND nr>=p.reverse_cap)
 OR (n+1)*10000>p.native_fee_budget OR (n+1)*100000000000000>p.base_fee_budget
 OR (nf+CASE WHEN q.direction='ZCASH_TO_BASE' THEN 1 ELSE 0 END)*100000>p.base_principal_budget
 OR (nr+CASE WHEN q.direction='BASE_TO_ZCASH' THEN 1 ELSE 0 END)*100000>p.native_principal_budget THEN RAISE EXCEPTION 'SERVICE_POLICY_LIMIT';END IF;
 IF zee.testnet_global_slot_busy() THEN RAISE EXCEPTION 'SERVICE_GLOBAL_SLOT_BUSY';END IF;
 SELECT * INTO STRICT s FROM zee.scanner_checkpoints WHERE network=CASE WHEN q.direction='ZCASH_TO_BASE' THEN 'zcash-testnet' ELSE 'base-sepolia' END;
 INSERT INTO zee.orders(id,accepted_at,funding_cutoff_height,funding_cutoff_time,cancellation_available_at) VALUES(p_id,stamp,
 CASE WHEN q.direction='ZCASH_TO_BASE' THEN s.scanned_height+40 END,CASE WHEN q.direction='BASE_TO_ZCASH' THEN date_trunc('second',stamp)+interval '900 seconds' END,
 CASE WHEN q.direction='BASE_TO_ZCASH' THEN date_trunc('second',stamp)+interval '8100 seconds' END);
 FOR r IN SELECT asset,purpose,sum(amount) amount FROM(VALUES(q.destination_asset,'principal',q.output_amount::numeric),(q.payout_fee_asset,'fee',q.payout_fee::numeric),(q.refund_fee_asset,'fee',q.refund_fee::numeric)) x(asset,purpose,amount) GROUP BY asset,purpose ORDER BY asset,purpose LOOP
  UPDATE zee.inventory_accounts SET reserved=reserved+r.amount WHERE asset=r.asset AND purpose=r.purpose AND balance-reserved>=r.amount;
  IF NOT FOUND THEN RAISE EXCEPTION 'insufficient inventory or fee budget';END IF;
  INSERT INTO zee.reservations VALUES(p_id,r.asset,r.purpose,r.amount,NULL);
  INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount,order_id) VALUES(p_id,r.asset,r.purpose||':available',-r.amount,p_id),(p_id,r.asset,r.purpose||':reserved',r.amount,p_id);
 END LOOP;
 INSERT INTO zee.testnet_policy_admissions VALUES(p_id,p_policy,p_owner,q.direction,p.active_epoch,100000,10000,100000000000000,stamp);
 INSERT INTO zee.order_events(order_id,event_type) VALUES(p_id,'ACCEPTED');RETURN p_id;
END $$;


CREATE OR REPLACE FUNCTION zee.testnet_policy_availability(p_policy zee.digest) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE p zee.root_testnet_service_policies;c zee.runtime_control;r zee.testnet_service_runtime;stamp timestamptz:=clock_timestamp();nf integer;nr integer;nq integer;na integer;reason text;f boolean;v boolean;
BEGIN
 SELECT * INTO p FROM zee.root_testnet_service_policies WHERE policy_sha256=p_policy;
 IF NOT FOUND THEN RETURN jsonb_build_object('version',1,'status','disabled','checkedAt',stamp,'policy',NULL);END IF;
 SELECT * INTO c FROM zee.runtime_control WHERE singleton;SELECT * INTO r FROM zee.testnet_service_runtime WHERE policy_sha256=p_policy;
 SELECT count(*) FILTER(WHERE direction='ZCASH_TO_BASE'),count(*) FILTER(WHERE direction='BASE_TO_ZCASH') INTO nf,nr FROM zee.testnet_policy_chargeable_admissions(p_policy);
 SELECT count(*) INTO nq FROM zee.testnet_policy_quotes WHERE policy_sha256 IN(SELECT zee.testnet_policy_lineage(p_policy));
 SELECT count(*) INTO na FROM zee.orders WHERE state NOT IN('SETTLED','REFUNDED','EXPIRED_UNFUNDED');
 IF p.expires_at<=stamp AND NOT zee.testnet_policy_nonexpiring(p_policy) THEN reason:='POLICY_EXPIRED';
 ELSIF c.reconciliation_required THEN reason:='RECONCILING';
 ELSIF c.epoch<>p.active_epoch OR NOT c.accepting_orders OR NOT c.dispatch_enabled THEN reason:='RUNTIME_PAUSED';
 ELSIF (SELECT count(*) FROM zee.assets WHERE id IN('TAZ','mockUSDC') AND live_enabled)<>2 OR EXISTS(SELECT 1 FROM zee.assets WHERE id='baseETH' AND live_enabled) OR NOT EXISTS(SELECT 1 FROM zee.assets WHERE id='TAZ' AND decimals=8 AND network='zcash-testnet' AND contract_address IS NULL) OR NOT EXISTS(SELECT 1 FROM zee.assets WHERE id='mockUSDC' AND decimals=6 AND network='base-sepolia' AND lower(contract_address)=p.token_contract) THEN reason:='RUNTIME_PAUSED';
 ELSIF (SELECT count(*) FROM zee.scanner_checkpoints WHERE network IN('zcash-testnet','base-sepolia') AND observed_at BETWEEN stamp-interval '60 seconds' AND stamp+interval '5 seconds')<>2 THEN reason:='SOURCE_STALE';
 ELSIF zee.testnet_unfunded_reuse_enabled(p_policy) AND (nf>p.forward_cap OR nr>p.reverse_cap OR (nf+nr)*10000>p.native_fee_budget OR (nf+nr)*100000000000000>p.base_fee_budget OR nf*100000>p.base_principal_budget OR nr*100000>p.native_principal_budget) THEN reason:='REUSE_LATE_LIABILITY_REVIEW';
 ELSIF nf>=2 AND nr>=2 THEN reason:='POLICY_EXHAUSTED';ELSIF nq>=32 THEN reason:='QUOTE_LIMIT';
 ELSIF r.policy_sha256 IS NULL OR r.control_epoch<>c.epoch OR NOT zee.testnet_worker_lease_owned(r.worker_backend_pid) THEN reason:='WORKER_OR_CAPITAL_STALE';
 ELSIF r.worker_ready_at NOT BETWEEN stamp-interval '60 seconds' AND stamp+interval '5 seconds' THEN reason:='WORKER_OR_CAPITAL_STALE';
 ELSIF zee.testnet_global_slot_busy() THEN reason:='GLOBAL_ORDER_ACTIVE';
 ELSIF r.capital_observed_at NOT BETWEEN stamp-interval '60 seconds' AND stamp+interval '5 seconds' THEN reason:='CAPITAL_UNAVAILABLE';END IF;
 f:=nf<2 AND NOT EXISTS(SELECT 1 FROM(VALUES('mockUSDC','principal',100000::numeric),('TAZ','fee',10000::numeric),('baseETH','fee',100000000000000::numeric)) x(asset,purpose,amount) LEFT JOIN zee.inventory_accounts i USING(asset,purpose) WHERE i.asset IS NULL OR i.balance-i.reserved<x.amount);
 v:=nr<2 AND NOT EXISTS(SELECT 1 FROM(VALUES('TAZ','principal',100000::numeric),('TAZ','fee',10000::numeric),('baseETH','fee',100000000000000::numeric)) x(asset,purpose,amount) LEFT JOIN zee.inventory_accounts i USING(asset,purpose) WHERE i.asset IS NULL OR i.balance-i.reserved<x.amount);
 IF reason IS NULL AND NOT f AND NOT v THEN reason:='CAPITAL_UNAVAILABLE';END IF;
 RETURN jsonb_build_object('version',CASE WHEN zee.testnet_unfunded_reuse_enabled(p_policy) THEN 4 WHEN zee.testnet_policy_nonexpiring(p_policy) THEN 3 ELSE 1 END,'status',CASE WHEN reason IS NULL THEN 'ready' WHEN reason IN('POLICY_EXHAUSTED','QUOTE_LIMIT') THEN 'policy_exhausted' WHEN reason='POLICY_EXPIRED' THEN 'policy_expired' WHEN reason='GLOBAL_ORDER_ACTIVE' THEN 'busy' WHEN reason='RECONCILING' THEN 'reconciling' WHEN reason='SOURCE_STALE' THEN 'source_unavailable' WHEN reason='WORKER_OR_CAPITAL_STALE' THEN 'worker_unavailable' WHEN reason='CAPITAL_UNAVAILABLE' THEN 'capital_unavailable' ELSE 'paused' END,'checkedAt',stamp,
 'policy',jsonb_build_object('id',p.policy_id,'sha256',encode(p_policy,'hex'),'expiresAt',CASE WHEN zee.testnet_policy_nonexpiring(p_policy) THEN NULL ELSE p.expires_at END,'inputAmountAtomic','100000','maxAcceptedByDirection',jsonb_build_object('ZCASH_TO_BASE',2,'BASE_TO_ZCASH',2),'remainingByDirection',jsonb_build_object('ZCASH_TO_BASE',greatest(0,2-nf),'BASE_TO_ZCASH',greatest(0,2-nr)),'maxConcurrent',1,'activeOrders',na,
 'availableByDirection',jsonb_build_object('ZCASH_TO_BASE',reason IS NULL AND f,'BASE_TO_ZCASH',reason IS NULL AND v),'remainingQuotes',32-nq) || CASE WHEN zee.testnet_policy_nonexpiring(p_policy) THEN jsonb_build_object('lifetime','nonexpiring','lifetimeAuthorizationSha256',(SELECT encode(authorization_sha256,'hex') FROM zee.testnet_service_lifetime_authorizations WHERE policy_sha256=p_policy)) ELSE '{}'::jsonb END || CASE WHEN zee.testnet_unfunded_reuse_enabled(p_policy) THEN jsonb_build_object('capacityBasis','funded-or-active','capacityAuthorizationSha256',(SELECT encode(authorization_sha256,'hex') FROM zee.testnet_unfunded_reuse_authorizations WHERE policy_sha256=p_policy)) ELSE '{}'::jsonb END);
END $$;

CREATE OR REPLACE FUNCTION zee.check_testnet_policy_worker(p_policy zee.digest,p_order uuid) RETURNS TABLE(order_id uuid,direction text,state text,accepted_epoch bigint,worker_backend_pid integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE p zee.root_testnet_service_policies;c zee.runtime_control;a zee.testnet_policy_admissions;q zee.quotes;r zee.testnet_service_runtime;stamp timestamptz:=clock_timestamp();nf bigint;nr bigint;n bigint;
BEGIN
 PERFORM zee.lock_observer_cycle();stamp:=clock_timestamp();SELECT * INTO STRICT p FROM zee.root_testnet_service_policies WHERE policy_sha256=p_policy;
 SELECT * INTO STRICT c FROM zee.runtime_control WHERE singleton;SELECT * INTO STRICT a FROM zee.testnet_policy_admissions m WHERE m.order_id=p_order AND m.policy_sha256=p_policy;
 IF c.epoch<>p.active_epoch OR a.accepted_epoch<>p.active_epoch OR NOT c.dispatch_enabled OR c.reconciliation_required THEN RAISE EXCEPTION 'SERVICE_RUNTIME_FENCED';END IF;
 q:=zee.check_testnet_policy_quote(p_order,p_policy,a.owner_hash);
 IF a.direction<>q.direction OR a.amount_atomic<>100000 THEN RAISE EXCEPTION 'SERVICE_ADMISSION_CONFLICT';END IF;
 SELECT * INTO r FROM zee.testnet_service_runtime WHERE policy_sha256=p_policy;
 IF NOT FOUND OR r.control_epoch<>c.epoch OR NOT zee.testnet_worker_lease_owned(r.worker_backend_pid) THEN RAISE EXCEPTION 'SERVICE_WORKER_OR_CAPITAL_STALE';END IF;
 IF (SELECT count(*) FROM zee.scanner_checkpoints WHERE network IN('zcash-testnet','base-sepolia') AND observed_at BETWEEN stamp-interval '60 seconds' AND stamp+interval '5 seconds')<>2 THEN RAISE EXCEPTION 'SERVICE_SOURCE_STALE';END IF;
 IF zee.testnet_unfunded_reuse_enabled(p_policy) THEN
  IF EXISTS(SELECT 1 FROM zee.order_events oe WHERE oe.order_id=p_order AND oe.event_type='EXPIRED_UNFUNDED')
  AND EXISTS(SELECT 1 FROM zee.deposits d JOIN zee.quotes z ON z.id=p_order WHERE d.order_id=p_order OR d.reference_hash=z.deposit_reference_hash)
  THEN RAISE EXCEPTION 'SERVICE_REUSE_RETIRED_LATE_FUNDS_REVIEW';END IF;
  SELECT count(*) FILTER(WHERE ca.direction='ZCASH_TO_BASE'),count(*) FILTER(WHERE ca.direction='BASE_TO_ZCASH'),count(*) INTO nf,nr,n FROM zee.testnet_policy_chargeable_admissions(p_policy) ca;
  IF nf>p.forward_cap OR nr>p.reverse_cap OR n*10000>p.native_fee_budget OR n*100000000000000>p.base_fee_budget
  OR nf*100000>p.base_principal_budget OR nr*100000>p.native_principal_budget
  THEN RAISE EXCEPTION 'SERVICE_REUSE_LATE_LIABILITY_REVIEW';END IF;
 END IF;
 RETURN QUERY SELECT o.id,z.direction,o.state,a.accepted_epoch,r.worker_backend_pid FROM zee.orders o JOIN zee.quotes z ON z.id=o.id WHERE o.id=p_order;
END $$;

CREATE OR REPLACE FUNCTION zee.testnet_policy_gate(p_policy zee.digest) RETURNS zee.root_testnet_service_policies
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE p zee.root_testnet_service_policies;c zee.runtime_control;r zee.testnet_service_runtime;stamp timestamptz:=clock_timestamp();nf bigint;nr bigint;n bigint;
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
 IF zee.testnet_unfunded_reuse_enabled(p_policy) THEN
  SELECT count(*) FILTER(WHERE direction='ZCASH_TO_BASE'),count(*) FILTER(WHERE direction='BASE_TO_ZCASH'),count(*) INTO nf,nr,n FROM zee.testnet_policy_chargeable_admissions(p_policy);
  IF nf>p.forward_cap OR nr>p.reverse_cap OR n*10000>p.native_fee_budget OR n*100000000000000>p.base_fee_budget
  OR nf*100000>p.base_principal_budget OR nr*100000>p.native_principal_budget
  THEN RAISE EXCEPTION 'SERVICE_REUSE_LATE_LIABILITY_REVIEW';END IF;
 END IF;
 RETURN p;
END $$;
