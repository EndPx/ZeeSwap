-- Explicit reconciliation successor only; never run a migration sweep.
-- FK creation needs REFERENCES separately from the existing owner key-share UPDATE.
-- Require an empty REFERENCES ACL so its immediate revoke cannot remove an old grant.
DO $$
BEGIN
 IF current_user<>'zee_app_admin_20261023'
 OR (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='zee.root_testnet_service_policies'::regclass)<>current_user
 OR has_table_privilege(current_user,'zee.root_testnet_service_policies','REFERENCES')
 OR has_any_column_privilege(current_user,'zee.root_testnet_service_policies','REFERENCES')
 THEN RAISE EXCEPTION 'SERVICE_SUCCESSOR_REFERENCES_BASELINE';END IF;
END $$;
GRANT REFERENCES(policy_sha256) ON zee.root_testnet_service_policies TO CURRENT_USER;
CREATE TABLE zee.testnet_policy_predecessors(
 policy_sha256 zee.digest PRIMARY KEY REFERENCES zee.root_testnet_service_policies(policy_sha256),
 predecessor_sha256 zee.digest NOT NULL UNIQUE REFERENCES zee.root_testnet_service_policies(policy_sha256),
 approval_sha256 zee.digest NOT NULL,original_activation_xid xid8 NOT NULL,reconciliation_xid xid8 NOT NULL,
 carried_quotes integer NOT NULL CHECK(carried_quotes>=0),carried_forward integer NOT NULL CHECK(carried_forward>=0),carried_reverse integer NOT NULL CHECK(carried_reverse>=0),
 created_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(policy_sha256<>predecessor_sha256)
);
REVOKE REFERENCES(policy_sha256) ON zee.root_testnet_service_policies FROM CURRENT_USER;
DO $$
BEGIN
 IF has_table_privilege(current_user,'zee.root_testnet_service_policies','REFERENCES')
 OR has_any_column_privilege(current_user,'zee.root_testnet_service_policies','REFERENCES')
 THEN RAISE EXCEPTION 'SERVICE_SUCCESSOR_REFERENCES_NOT_RESTORED';END IF;
END $$;
CREATE TRIGGER policy_predecessor_immutable BEFORE UPDATE OR DELETE ON zee.testnet_policy_predecessors FOR EACH ROW EXECUTE FUNCTION zee.immutable();
REVOKE ALL ON zee.testnet_policy_predecessors FROM PUBLIC,zeeswap_api,zeeswap_worker,zeeswap_reader;
REVOKE ALL ON zee.testnet_policy_predecessors FROM CURRENT_USER;
GRANT SELECT,INSERT ON zee.testnet_policy_predecessors TO CURRENT_USER;
GRANT SELECT ON zee.testnet_policy_predecessors TO zeeswap_worker,zeeswap_reader;
CREATE FUNCTION zee.testnet_policy_lineage(p_policy zee.digest) RETURNS SETOF zee.digest
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
 WITH RECURSIVE ancestors(sha) AS(SELECT p_policy::bytea UNION SELECT p.predecessor_sha256::bytea FROM zee.testnet_policy_predecessors p JOIN ancestors a ON p.policy_sha256=a.sha)
 SELECT sha::zee.digest FROM ancestors
$$;
REVOKE ALL ON FUNCTION zee.testnet_policy_lineage(zee.digest) FROM PUBLIC;
CREATE FUNCTION zee.check_testnet_policy_predecessor() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE p zee.root_testnet_service_policies;n zee.root_testnet_service_policies;c zee.runtime_control;control_xmin text;nq bigint;nf bigint;nr bigint;
BEGIN
 SELECT * INTO STRICT p FROM zee.root_testnet_service_policies WHERE policy_sha256=NEW.predecessor_sha256 FOR KEY SHARE;
 SELECT * INTO STRICT n FROM zee.root_testnet_service_policies WHERE policy_sha256=NEW.policy_sha256 FOR KEY SHARE;
 SELECT xmin::text INTO STRICT control_xmin FROM zee.runtime_control WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT c FROM zee.runtime_control WHERE singleton;
 IF n.active_epoch<>p.active_epoch+2 OR c.epoch<>p.active_epoch+1 OR control_xmin<>NEW.reconciliation_xid::text
 OR c.accepting_orders OR c.dispatch_enabled OR NOT c.reconciliation_required
 OR n.expires_at<>p.expires_at OR n.expires_at<=clock_timestamp() OR n.created_at<=p.created_at
 OR NEW.original_activation_xid<>p.created_xid OR n.created_xid<>pg_current_xact_id()
 OR (n.profile_sha256,n.source_identity_digest,n.capital_allocation_sha256,n.public_commit,n.settlement_contract,n.token_contract,n.amount_atomic,n.forward_cap,n.reverse_cap,n.global_concurrency,n.quote_cap,n.forward_cutoff_blocks,n.min_lead_blocks,n.native_principal_budget,n.base_principal_budget,n.native_fee_budget,n.base_fee_budget)
 IS DISTINCT FROM (p.profile_sha256,p.source_identity_digest,p.capital_allocation_sha256,p.public_commit,p.settlement_contract,p.token_contract,p.amount_atomic,p.forward_cap,p.reverse_cap,p.global_concurrency,p.quote_cap,p.forward_cutoff_blocks,p.min_lead_blocks,p.native_principal_budget,p.base_principal_budget,p.native_fee_budget,p.base_fee_budget)
 THEN RAISE EXCEPTION 'SERVICE_SUCCESSOR_SCOPE';END IF;
 IF pg_xact_status(NEW.original_activation_xid)<>'committed' OR pg_xact_status(NEW.reconciliation_xid)<>'committed' THEN RAISE EXCEPTION 'SERVICE_SUCCESSOR_ORIGINAL_XIDS';END IF;
 SELECT count(*) INTO nq FROM zee.testnet_policy_quotes WHERE policy_sha256 IN(SELECT zee.testnet_policy_lineage(NEW.predecessor_sha256));
 SELECT count(*) FILTER(WHERE direction='ZCASH_TO_BASE'),count(*) FILTER(WHERE direction='BASE_TO_ZCASH') INTO nf,nr FROM zee.testnet_policy_admissions WHERE policy_sha256 IN(SELECT zee.testnet_policy_lineage(NEW.predecessor_sha256));
 IF (nq,nf,nr) IS DISTINCT FROM (NEW.carried_quotes::bigint,NEW.carried_forward::bigint,NEW.carried_reverse::bigint) THEN RAISE EXCEPTION 'SERVICE_SUCCESSOR_CARRY_CHANGED';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION zee.check_testnet_policy_predecessor() FROM PUBLIC;
CREATE TRIGGER policy_predecessor_scope BEFORE INSERT ON zee.testnet_policy_predecessors FOR EACH ROW EXECUTE FUNCTION zee.check_testnet_policy_predecessor();
CREATE OR REPLACE FUNCTION zee.bind_testnet_policy_quote(p_id uuid,p_policy zee.digest,p_owner zee.digest) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE q zee.quotes;b zee.testnet_policy_quotes;p zee.root_testnet_service_policies;
BEGIN
 PERFORM zee.lock_observer_cycle();q:=zee.check_testnet_policy_quote(p_id,p_policy,p_owner);
 SELECT * INTO b FROM zee.testnet_policy_quotes WHERE quote_id=p_id;
 IF FOUND THEN IF b.policy_sha256<>p_policy OR b.owner_hash<>p_owner THEN RAISE EXCEPTION 'SERVICE_QUOTE_BINDING_CONFLICT';END IF;RETURN p_id;END IF;
 p:=zee.testnet_policy_gate(p_policy);
 IF q.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'quote expired';END IF;
 IF (SELECT count(*) FROM zee.testnet_policy_quotes WHERE policy_sha256 IN(SELECT zee.testnet_policy_lineage(p_policy)))>=p.quote_cap THEN RAISE EXCEPTION 'SERVICE_QUOTE_LIMIT';END IF;
 INSERT INTO zee.testnet_policy_quotes VALUES(p_id,p_policy,p_owner,clock_timestamp());RETURN p_id;
END $$;

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
 SELECT count(*) FILTER(WHERE direction='ZCASH_TO_BASE'),count(*) FILTER(WHERE direction='BASE_TO_ZCASH'),count(*) INTO nf,nr,n FROM zee.testnet_policy_admissions WHERE policy_sha256 IN(SELECT zee.testnet_policy_lineage(p_policy));
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
 SELECT count(*) FILTER(WHERE direction='ZCASH_TO_BASE'),count(*) FILTER(WHERE direction='BASE_TO_ZCASH') INTO nf,nr FROM zee.testnet_policy_admissions WHERE policy_sha256 IN(SELECT zee.testnet_policy_lineage(p_policy));
 SELECT count(*) INTO nq FROM zee.testnet_policy_quotes WHERE policy_sha256 IN(SELECT zee.testnet_policy_lineage(p_policy));
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
