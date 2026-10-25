-- Explicit opt-in only. Do not apply unapplied0015/0016. Historical function bodies remain unchanged.
CREATE TABLE zee.root_testnet_service_policies(
 policy_sha256 zee.digest PRIMARY KEY,policy_id uuid NOT NULL UNIQUE,active_epoch bigint NOT NULL UNIQUE CHECK(active_epoch>0),
 profile_sha256 zee.digest NOT NULL,source_identity_digest zee.digest NOT NULL,canonical_audit_sha256 zee.digest NOT NULL,
 capital_allocation_sha256 zee.digest NOT NULL,initial_books_sha256 zee.digest NOT NULL,public_commit text NOT NULL CHECK(public_commit ~ '^[0-9a-f]{40}$'),
 settlement_contract text NOT NULL CHECK(settlement_contract ~ '^0x[0-9a-f]{40}$'),token_contract text NOT NULL CHECK(token_contract ~ '^0x[0-9a-f]{40}$'),
 amount_atomic zee.atomic NOT NULL CHECK(amount_atomic=100000),forward_cap smallint NOT NULL CHECK(forward_cap=2),reverse_cap smallint NOT NULL CHECK(reverse_cap=2),
 global_concurrency smallint NOT NULL CHECK(global_concurrency=1),quote_cap smallint NOT NULL CHECK(quote_cap=32),
 forward_cutoff_blocks integer NOT NULL CHECK(forward_cutoff_blocks=40),min_lead_blocks integer NOT NULL CHECK(min_lead_blocks=12),
 native_principal_budget zee.atomic NOT NULL CHECK(native_principal_budget=200000),base_principal_budget zee.atomic NOT NULL CHECK(base_principal_budget=200000),
 native_fee_budget zee.atomic NOT NULL CHECK(native_fee_budget=40000),base_fee_budget zee.atomic NOT NULL CHECK(base_fee_budget=400000000000000),
 created_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '24 hours')
);
CREATE TABLE zee.testnet_policy_quotes(
 quote_id uuid PRIMARY KEY REFERENCES zee.quotes(id),policy_sha256 zee.digest NOT NULL REFERENCES zee.root_testnet_service_policies(policy_sha256),
 owner_hash zee.digest NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE zee.testnet_policy_admissions(
 order_id uuid PRIMARY KEY REFERENCES zee.orders(id),policy_sha256 zee.digest NOT NULL REFERENCES zee.root_testnet_service_policies(policy_sha256),
 owner_hash zee.digest NOT NULL,direction text NOT NULL CHECK(direction IN('ZCASH_TO_BASE','BASE_TO_ZCASH')),
 accepted_epoch bigint NOT NULL,amount_atomic zee.atomic NOT NULL CHECK(amount_atomic=100000),
 native_fee_ceiling zee.atomic NOT NULL CHECK(native_fee_ceiling=10000),base_fee_ceiling zee.atomic NOT NULL CHECK(base_fee_ceiling=100000000000000),
 accepted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE zee.testnet_service_runtime(
 policy_sha256 zee.digest PRIMARY KEY REFERENCES zee.root_testnet_service_policies(policy_sha256),control_epoch bigint NOT NULL,
 worker_backend_pid integer NOT NULL,worker_ready_at timestamptz NOT NULL,capital_observed_at timestamptz NOT NULL,capital_proof_digest zee.digest NOT NULL
);
CREATE TRIGGER testnet_service_policy_immutable BEFORE UPDATE OR DELETE ON zee.root_testnet_service_policies FOR EACH ROW EXECUTE FUNCTION zee.immutable();
CREATE TRIGGER testnet_policy_quote_immutable BEFORE UPDATE OR DELETE ON zee.testnet_policy_quotes FOR EACH ROW EXECUTE FUNCTION zee.immutable();
CREATE TRIGGER testnet_policy_admission_immutable BEFORE UPDATE OR DELETE ON zee.testnet_policy_admissions FOR EACH ROW EXECUTE FUNCTION zee.immutable();
REVOKE ALL ON zee.root_testnet_service_policies,zee.testnet_policy_quotes,zee.testnet_policy_admissions,zee.testnet_service_runtime FROM PUBLIC,zeeswap_api,zeeswap_worker,zeeswap_reader;
REVOKE ALL ON zee.root_testnet_service_policies FROM CURRENT_USER;
GRANT SELECT,INSERT ON zee.root_testnet_service_policies TO CURRENT_USER;
GRANT SELECT ON zee.root_testnet_service_policies,zee.testnet_policy_quotes,zee.testnet_policy_admissions,zee.testnet_service_runtime TO zeeswap_worker,zeeswap_reader;

-- API cannot bypass this opt-in policy through any previously shipped admission function.
REVOKE EXECUTE ON FUNCTION zee.accept_quote(uuid),zee.accept_post_refund_circle(uuid,uuid,bigint,zee.digest),
 zee.accept_post_refund_replacement(uuid,uuid,uuid,bigint,zee.digest),zee.accept_root_authorized_replacement(uuid,zee.digest) FROM zeeswap_api;

CREATE FUNCTION zee.testnet_worker_lease_owned(p_pid integer) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
 SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database())
 AND classid=84532::oid AND objid=20261026::oid AND objsubid=2 AND mode='ExclusiveLock' AND granted AND pid=p_pid)
$$;

CREATE FUNCTION zee.record_testnet_worker_readiness(p_policy zee.digest,p_capital_observed_at timestamptz,p_proof zee.digest)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE p zee.root_testnet_service_policies;c zee.runtime_control;old zee.testnet_service_runtime;stamp timestamptz:=clock_timestamp();
BEGIN
 IF NOT zee.testnet_worker_lease_owned(pg_backend_pid()) THEN RAISE EXCEPTION 'SERVICE_WORKER_LEASE_REQUIRED';END IF;
 PERFORM zee.lock_observer_cycle();stamp:=clock_timestamp();SELECT * INTO STRICT p FROM zee.root_testnet_service_policies WHERE policy_sha256=p_policy;
 SELECT * INTO STRICT c FROM zee.runtime_control WHERE singleton;
 IF c.epoch<>p.active_epoch OR c.reconciliation_required OR NOT c.dispatch_enabled THEN RAISE EXCEPTION 'SERVICE_RUNTIME_FENCED';END IF;
 IF p_capital_observed_at IS NULL OR p_capital_observed_at>stamp+interval '5 seconds' THEN RAISE EXCEPTION 'SERVICE_CAPITAL_STALE';END IF;
 SELECT * INTO old FROM zee.testnet_service_runtime WHERE policy_sha256=p_policy FOR UPDATE;
 IF (NOT FOUND OR p_capital_observed_at>old.capital_observed_at) AND p_capital_observed_at<stamp-interval '60 seconds' THEN RAISE EXCEPTION 'SERVICE_CAPITAL_STALE';END IF;
 IF FOUND AND (p_capital_observed_at<old.capital_observed_at OR (p_capital_observed_at=old.capital_observed_at AND p_proof<>old.capital_proof_digest)) THEN RAISE EXCEPTION 'SERVICE_CAPITAL_PROOF_REGRESSION';END IF;
 INSERT INTO zee.testnet_service_runtime VALUES(p_policy,c.epoch,pg_backend_pid(),stamp,p_capital_observed_at,p_proof)
 ON CONFLICT(policy_sha256) DO UPDATE SET control_epoch=excluded.control_epoch,worker_backend_pid=excluded.worker_backend_pid,
 worker_ready_at=excluded.worker_ready_at,capital_observed_at=excluded.capital_observed_at,capital_proof_digest=excluded.capital_proof_digest;
END $$;

CREATE FUNCTION zee.testnet_policy_gate(p_policy zee.digest) RETURNS zee.root_testnet_service_policies
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE p zee.root_testnet_service_policies;c zee.runtime_control;r zee.testnet_service_runtime;stamp timestamptz:=clock_timestamp();
BEGIN
 PERFORM zee.lock_observer_cycle();stamp:=clock_timestamp();SELECT * INTO STRICT p FROM zee.root_testnet_service_policies WHERE policy_sha256=p_policy;
 SELECT * INTO STRICT c FROM zee.runtime_control WHERE singleton;
 IF p.expires_at<=stamp THEN RAISE EXCEPTION 'SERVICE_POLICY_EXPIRED';END IF;
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

CREATE FUNCTION zee.check_testnet_policy_quote(p_id uuid,p_policy zee.digest,p_owner zee.digest) RETURNS zee.quotes
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE q zee.quotes;p zee.root_testnet_service_policies;
BEGIN
 SELECT * INTO STRICT q FROM zee.quotes WHERE id=p_id;SELECT * INTO STRICT p FROM zee.root_testnet_service_policies WHERE policy_sha256=p_policy;
 IF q.access_hash<>p_owner OR q.input_amount<>100000 OR q.output_amount<>100000 OR q.created_at<p.created_at
 OR q.payout_fee<>(CASE WHEN q.direction='ZCASH_TO_BASE' THEN 100000000000000 ELSE 10000 END)
 OR q.refund_fee<>(CASE WHEN q.direction='ZCASH_TO_BASE' THEN 10000 ELSE 100000000000000 END)
 OR q.execution_mode<>(CASE WHEN q.direction='ZCASH_TO_BASE' THEN 'base-settlement-v1' ELSE 'base-escrow-v1' END)
 OR lower(q.base_contract) IS DISTINCT FROM p.settlement_contract THEN RAISE EXCEPTION 'SERVICE_QUOTE_SCOPE';END IF;
 RETURN q;
END $$;

CREATE FUNCTION zee.bind_testnet_policy_quote(p_id uuid,p_policy zee.digest,p_owner zee.digest) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE q zee.quotes;b zee.testnet_policy_quotes;p zee.root_testnet_service_policies;
BEGIN
 PERFORM zee.lock_observer_cycle();q:=zee.check_testnet_policy_quote(p_id,p_policy,p_owner);
 SELECT * INTO b FROM zee.testnet_policy_quotes WHERE quote_id=p_id;
 IF FOUND THEN IF b.policy_sha256<>p_policy OR b.owner_hash<>p_owner THEN RAISE EXCEPTION 'SERVICE_QUOTE_BINDING_CONFLICT';END IF;RETURN p_id;END IF;
 p:=zee.testnet_policy_gate(p_policy);
 IF q.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'quote expired';END IF;
 IF (SELECT count(*) FROM zee.testnet_policy_quotes WHERE policy_sha256=p_policy)>=p.quote_cap THEN RAISE EXCEPTION 'SERVICE_QUOTE_LIMIT';END IF;
 INSERT INTO zee.testnet_policy_quotes VALUES(p_id,p_policy,p_owner,clock_timestamp());RETURN p_id;
END $$;

CREATE FUNCTION zee.testnet_global_slot_busy() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
 SELECT EXISTS(SELECT 1 FROM zee.orders WHERE state NOT IN('SETTLED','REFUNDED','EXPIRED_UNFUNDED'))
 OR EXISTS(SELECT 1 FROM zee.obligations WHERE state<>'DISCHARGED') OR EXISTS(SELECT 1 FROM zee.reservations WHERE released_at IS NULL)
 OR EXISTS(SELECT 1 FROM zee.operations WHERE state<>'CONFIRMED') OR EXISTS(SELECT 1 FROM zee.outbox_jobs WHERE status<>'DONE')
 OR EXISTS(SELECT 1 FROM zee.chain_transactions WHERE state NOT IN('CONFIRMED','REVERTED','EXPIRED'))
 OR EXISTS(SELECT 1 FROM zee.base_attempts WHERE NOT confirmed) OR EXISTS(SELECT 1 FROM zee.escrow_commits WHERE NOT confirmed)
 OR EXISTS(SELECT 1 FROM zee.reverse_payouts WHERE NOT confirmed) OR EXISTS(SELECT 1 FROM zee.escrow_settlements WHERE NOT confirmed)
 OR EXISTS(SELECT 1 FROM zee.source_refunds WHERE NOT base_confirmed OR NOT confirmed)
$$;
CREATE FUNCTION zee.accept_testnet_policy_quote(p_id uuid,p_policy zee.digest,p_owner zee.digest) RETURNS uuid
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
 SELECT count(*) FILTER(WHERE direction='ZCASH_TO_BASE'),count(*) FILTER(WHERE direction='BASE_TO_ZCASH'),count(*) INTO nf,nr,n FROM zee.testnet_policy_admissions WHERE policy_sha256=p_policy;
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

CREATE FUNCTION zee.testnet_policy_availability(p_policy zee.digest) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE p zee.root_testnet_service_policies;c zee.runtime_control;r zee.testnet_service_runtime;stamp timestamptz:=clock_timestamp();nf integer;nr integer;nq integer;na integer;reason text;f boolean;v boolean;
BEGIN
 SELECT * INTO p FROM zee.root_testnet_service_policies WHERE policy_sha256=p_policy;
 IF NOT FOUND THEN RETURN jsonb_build_object('version',1,'status','disabled','checkedAt',stamp,'policy',NULL);END IF;
 SELECT * INTO c FROM zee.runtime_control WHERE singleton;SELECT * INTO r FROM zee.testnet_service_runtime WHERE policy_sha256=p_policy;
 SELECT count(*) FILTER(WHERE direction='ZCASH_TO_BASE'),count(*) FILTER(WHERE direction='BASE_TO_ZCASH') INTO nf,nr FROM zee.testnet_policy_admissions WHERE policy_sha256=p_policy;
 SELECT count(*) INTO nq FROM zee.testnet_policy_quotes WHERE policy_sha256=p_policy;
 SELECT count(*) INTO na FROM zee.orders WHERE state NOT IN('SETTLED','REFUNDED','EXPIRED_UNFUNDED');
 IF p.expires_at<=stamp THEN reason:='POLICY_EXPIRED';
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
 RETURN jsonb_build_object('version',1,'status',CASE WHEN reason IS NULL THEN 'ready' WHEN reason IN('POLICY_EXHAUSTED','QUOTE_LIMIT') THEN 'policy_exhausted' WHEN reason='POLICY_EXPIRED' THEN 'policy_expired' WHEN reason='GLOBAL_ORDER_ACTIVE' THEN 'busy' WHEN reason='RECONCILING' THEN 'reconciling' WHEN reason='SOURCE_STALE' THEN 'source_unavailable' WHEN reason='WORKER_OR_CAPITAL_STALE' THEN 'worker_unavailable' WHEN reason='CAPITAL_UNAVAILABLE' THEN 'capital_unavailable' ELSE 'paused' END,'checkedAt',stamp,
 'policy',jsonb_build_object('id',p.policy_id,'sha256',encode(p_policy,'hex'),'expiresAt',p.expires_at,'inputAmountAtomic','100000','maxAcceptedByDirection',jsonb_build_object('ZCASH_TO_BASE',2,'BASE_TO_ZCASH',2),'remainingByDirection',jsonb_build_object('ZCASH_TO_BASE',2-nf,'BASE_TO_ZCASH',2-nr),'maxConcurrent',1,'activeOrders',na,
 'availableByDirection',jsonb_build_object('ZCASH_TO_BASE',reason IS NULL AND f,'BASE_TO_ZCASH',reason IS NULL AND v),'remainingQuotes',32-nq));
END $$;
CREATE FUNCTION zee.check_testnet_policy_worker(p_policy zee.digest,p_order uuid) RETURNS TABLE(order_id uuid,direction text,state text,accepted_epoch bigint,worker_backend_pid integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE p zee.root_testnet_service_policies;c zee.runtime_control;a zee.testnet_policy_admissions;q zee.quotes;r zee.testnet_service_runtime;stamp timestamptz:=clock_timestamp();
BEGIN
 PERFORM zee.lock_observer_cycle();stamp:=clock_timestamp();SELECT * INTO STRICT p FROM zee.root_testnet_service_policies WHERE policy_sha256=p_policy;
 SELECT * INTO STRICT c FROM zee.runtime_control WHERE singleton;SELECT * INTO STRICT a FROM zee.testnet_policy_admissions m WHERE m.order_id=p_order AND m.policy_sha256=p_policy;
 IF c.epoch<>p.active_epoch OR a.accepted_epoch<>p.active_epoch OR NOT c.dispatch_enabled OR c.reconciliation_required THEN RAISE EXCEPTION 'SERVICE_RUNTIME_FENCED';END IF;
 q:=zee.check_testnet_policy_quote(p_order,p_policy,a.owner_hash);
 IF a.direction<>q.direction OR a.amount_atomic<>100000 THEN RAISE EXCEPTION 'SERVICE_ADMISSION_CONFLICT';END IF;
 SELECT * INTO r FROM zee.testnet_service_runtime WHERE policy_sha256=p_policy;
 IF NOT FOUND OR r.control_epoch<>c.epoch OR NOT zee.testnet_worker_lease_owned(r.worker_backend_pid) THEN RAISE EXCEPTION 'SERVICE_WORKER_OR_CAPITAL_STALE';END IF;
 IF (SELECT count(*) FROM zee.scanner_checkpoints WHERE network IN('zcash-testnet','base-sepolia') AND observed_at BETWEEN stamp-interval '60 seconds' AND stamp+interval '5 seconds')<>2 THEN RAISE EXCEPTION 'SERVICE_SOURCE_STALE';END IF;
 RETURN QUERY SELECT o.id,z.direction,o.state,a.accepted_epoch,r.worker_backend_pid FROM zee.orders o JOIN zee.quotes z ON z.id=o.id WHERE o.id=p_order;
END $$;
REVOKE ALL ON FUNCTION zee.testnet_worker_lease_owned(integer),zee.record_testnet_worker_readiness(zee.digest,timestamptz,zee.digest),zee.testnet_policy_gate(zee.digest),zee.check_testnet_policy_quote(uuid,zee.digest,zee.digest),zee.bind_testnet_policy_quote(uuid,zee.digest,zee.digest),zee.accept_testnet_policy_quote(uuid,zee.digest,zee.digest),zee.testnet_policy_availability(zee.digest) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.record_testnet_worker_readiness(zee.digest,timestamptz,zee.digest) TO zeeswap_worker;
GRANT EXECUTE ON FUNCTION zee.bind_testnet_policy_quote(uuid,zee.digest,zee.digest),zee.accept_testnet_policy_quote(uuid,zee.digest,zee.digest),zee.testnet_policy_availability(zee.digest) TO zeeswap_api;
GRANT EXECUTE ON FUNCTION zee.testnet_policy_availability(zee.digest) TO zeeswap_worker,zeeswap_reader;
REVOKE ALL ON FUNCTION zee.check_testnet_policy_worker(zee.digest,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.check_testnet_policy_worker(zee.digest,uuid) TO zeeswap_worker;
REVOKE ALL ON FUNCTION zee.testnet_global_slot_busy() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.testnet_global_slot_busy() TO zeeswap_worker;
