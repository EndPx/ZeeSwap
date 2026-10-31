-- Explicit continuous-demo overlay. Original policy, grants and usage stay immutable.
DO $$ BEGIN
 IF current_user<>'zee_app_admin_20261023' OR to_regprocedure('zee.testnet_policy_closed_books()') IS NULL
 THEN RAISE EXCEPTION 'CONTINUOUS_DEMO_BASELINE';END IF;
END $$;
CREATE TABLE zee.testnet_continuous_demo_authorizations(
 policy_sha256 zee.digest PRIMARY KEY,authorization_sha256 zee.digest NOT NULL UNIQUE,
 human_approval_sha256 zee.digest NOT NULL,capital_proof_sha256 zee.digest NOT NULL,journal_qualification_sha256 zee.digest NOT NULL,
 original_activation_xid xid8 NOT NULL,original_epoch bigint NOT NULL,publication_epoch bigint NOT NULL,publication_xmin text NOT NULL,
 source_identity_digest zee.digest NOT NULL,profile_sha256 zee.digest NOT NULL,
 worker_config_sha256 zee.digest NOT NULL,execution_manifest_sha256 zee.digest NOT NULL,execution_approval_sha256 zee.digest NOT NULL,capital_approval_sha256 zee.digest NOT NULL,
 native_principal_target zee.atomic NOT NULL CHECK(native_principal_target=1000000),
 native_fee_target zee.atomic NOT NULL CHECK(native_fee_target=200000),
 base_principal_target zee.atomic NOT NULL CHECK(base_principal_target=9900000),
 base_fee_target zee.atomic NOT NULL,
 created_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE zee.testnet_continuous_proceeds(
 deposit_id uuid PRIMARY KEY,order_id uuid NOT NULL UNIQUE,policy_sha256 zee.digest NOT NULL,
 qualification_sha256 zee.digest NOT NULL,asset text NOT NULL,amount zee.atomic NOT NULL,
 created_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER continuous_demo_immutable BEFORE UPDATE OR DELETE ON zee.testnet_continuous_demo_authorizations FOR EACH ROW EXECUTE FUNCTION zee.immutable();
CREATE TRIGGER continuous_proceeds_immutable BEFORE UPDATE OR DELETE ON zee.testnet_continuous_proceeds FOR EACH ROW EXECUTE FUNCTION zee.immutable();
REVOKE ALL ON zee.testnet_continuous_demo_authorizations,zee.testnet_continuous_proceeds FROM PUBLIC,zeeswap_api,zeeswap_worker,zeeswap_reader;
GRANT SELECT ON zee.testnet_continuous_demo_authorizations,zee.testnet_continuous_proceeds TO CURRENT_USER,zeeswap_worker,zeeswap_reader;
CREATE FUNCTION zee.testnet_continuous_demo_enabled(p_policy zee.digest) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
 SELECT EXISTS(SELECT 1 FROM zee.testnet_continuous_demo_authorizations a JOIN zee.root_testnet_service_policies p USING(policy_sha256)
 WHERE a.policy_sha256=p_policy AND (a.original_activation_xid,a.original_epoch,a.source_identity_digest,a.profile_sha256)
 IS NOT DISTINCT FROM(p.created_xid,p.active_epoch,p.source_identity_digest,p.profile_sha256)
 AND zee.testnet_policy_nonexpiring(p_policy) AND zee.testnet_unfunded_reuse_enabled(p_policy))
$$;
CREATE FUNCTION zee.testnet_continuous_late_exposure(p_policy zee.digest) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
 SELECT EXISTS(SELECT 1 FROM zee.testnet_policy_admissions a JOIN zee.quotes q ON q.id=a.order_id
 JOIN zee.order_events e ON e.order_id=a.order_id AND e.event_type='EXPIRED_UNFUNDED'
 JOIN zee.deposits d ON d.order_id=a.order_id OR d.reference_hash=q.deposit_reference_hash
 WHERE a.policy_sha256 IN(SELECT zee.testnet_policy_lineage(p_policy)))
$$;
CREATE FUNCTION zee.testnet_continuous_capacity(p_direction text) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
 SELECT CASE WHEN count(*)=3 THEN least(9007199254740991::numeric,min(floor((i.balance-i.reserved)/x.amount)))::bigint ELSE 0 END
 FROM(VALUES(CASE WHEN p_direction='ZCASH_TO_BASE' THEN 'mockUSDC' ELSE 'TAZ' END,'principal',100000::numeric),('TAZ','fee',10000::numeric),('baseETH','fee',100000000000000::numeric)) x(asset,purpose,amount)
 JOIN zee.inventory_accounts i USING(asset,purpose)
$$;
-- Root supplies a byte-pinned, independently qualified physical-capital proof.
-- This function only allocates already owned capital; it never signs or transfers.
CREATE FUNCTION zee.publish_testnet_continuous_demo(p_policy zee.digest,p_authorization zee.digest,p_human zee.digest,p_capital zee.digest,p_qualification zee.digest,p_epoch bigint,p_xmin text,p_publish_before timestamptz,p_base_fee zee.atomic,p_worker zee.digest,p_manifest zee.digest,p_execution zee.digest,p_capital_approval zee.digest) RETURNS xid8
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE p zee.root_testnet_service_policies;r record;old_balance numeric;event uuid:=gen_random_uuid();stamp timestamptz;
BEGIN
 PERFORM zee.lock_observer_cycle();stamp:=clock_timestamp();
 SELECT * INTO STRICT p FROM zee.root_testnet_service_policies WHERE policy_sha256=p_policy;
 IF EXISTS(SELECT 1 FROM zee.testnet_continuous_demo_authorizations WHERE policy_sha256=p_policy) THEN RAISE EXCEPTION 'CONTINUOUS_DEMO_ALREADY_PUBLISHED';END IF;
 PERFORM 1 FROM zee.runtime_control WHERE singleton AND epoch=p_epoch AND xmin::text=p_xmin AND epoch=zee.testnet_policy_execution_epoch(p_policy) AND dispatch_enabled AND NOT reconciliation_required FOR UPDATE;
 IF NOT FOUND OR NOT zee.testnet_policy_nonexpiring(p_policy) OR NOT zee.testnet_unfunded_reuse_enabled(p_policy)
 OR NOT zee.testnet_policy_closed_books() OR zee.testnet_continuous_late_exposure(p_policy)
 OR p_publish_before<=stamp OR p_publish_before>stamp+interval '5 minutes'
 OR p_worker=decode(repeat('00',32),'hex') OR p_manifest=decode(repeat('00',32),'hex') OR p_execution=decode(repeat('00',32),'hex') OR p_capital_approval=decode(repeat('00',32),'hex')
 OR p_authorization=decode(repeat('00',32),'hex') OR p_capital=decode(repeat('00',32),'hex') OR p_qualification=decode(repeat('00',32),'hex') OR p_human=decode(repeat('00',32),'hex')
 THEN RAISE EXCEPTION 'CONTINUOUS_DEMO_CURRENT_CLOSED_AUTHORITY';END IF;
 IF (SELECT count(*) FROM zee.scanner_checkpoints WHERE network IN('base-sepolia','zcash-testnet') AND observed_at BETWEEN stamp-interval '30 seconds' AND stamp+interval '5 seconds')<>2 THEN RAISE EXCEPTION 'CONTINUOUS_DEMO_SOURCE_STALE';END IF;
 SELECT balance INTO STRICT old_balance FROM zee.inventory_accounts WHERE asset='baseETH' AND purpose='fee' FOR UPDATE;
 IF p_base_fee<>old_balance THEN RAISE EXCEPTION 'CONTINUOUS_DEMO_BASE_FEE_UNCHANGED';END IF;
 FOR r IN SELECT * FROM(VALUES('TAZ','principal',1000000::numeric),('TAZ','fee',200000::numeric),('mockUSDC','principal',9900000::numeric)) x(asset,purpose,target) ORDER BY asset,purpose LOOP
  SELECT balance INTO STRICT old_balance FROM zee.inventory_accounts WHERE asset=r.asset AND purpose=r.purpose AND reserved=0 FOR UPDATE;
  IF old_balance>r.target THEN RAISE EXCEPTION 'CONTINUOUS_DEMO_NO_CAPITAL_REDUCTION';END IF;
  IF old_balance<r.target THEN
   event:=gen_random_uuid();
   UPDATE zee.inventory_accounts SET balance=r.target WHERE asset=r.asset AND purpose=r.purpose;
   INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount) VALUES(event,r.asset,'operator:capital',old_balance-r.target),(event,r.asset,r.purpose||':available',r.target-old_balance);
  END IF;
 END LOOP;
 INSERT INTO zee.testnet_continuous_demo_authorizations(policy_sha256,authorization_sha256,human_approval_sha256,capital_proof_sha256,journal_qualification_sha256,original_activation_xid,original_epoch,publication_epoch,publication_xmin,source_identity_digest,profile_sha256,native_principal_target,native_fee_target,base_principal_target,base_fee_target,worker_config_sha256,execution_manifest_sha256,execution_approval_sha256,capital_approval_sha256)
 VALUES(p_policy,p_authorization,p_human,p_capital,p_qualification,p.created_xid,p.active_epoch,p_epoch,p_xmin,p.source_identity_digest,p.profile_sha256,1000000,200000,9900000,p_base_fee,p_worker,p_manifest,p_execution,p_capital_approval);
 RETURN pg_current_xact_id();
END $$;
-- Each finalized source deposit is credited once, after Root authenticates the
-- original closed SQL and signed journals. Source-held funds never qualify.
CREATE FUNCTION zee.reconcile_testnet_continuous_proceeds(p_policy zee.digest,p_order uuid,p_qualification zee.digest,p_qualified_at timestamptz) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE o zee.orders;q zee.quotes;d zee.deposits;net text;stamp timestamptz;net_amount numeric;event uuid:=gen_random_uuid();
BEGIN
 PERFORM zee.lock_observer_cycle();stamp:=clock_timestamp();
 IF (SELECT count(*) FROM zee.scanner_checkpoints WHERE network IN('base-sepolia','zcash-testnet') AND observed_at BETWEEN stamp-interval '30 seconds' AND stamp+interval '5 seconds')<>2 THEN RAISE EXCEPTION 'CONTINUOUS_PROCEEDS_SOURCE_STALE';END IF;
 IF NOT zee.testnet_continuous_demo_enabled(p_policy) OR p_qualification=decode(repeat('00',32),'hex')
 OR p_qualified_at NOT BETWEEN stamp-interval '30 seconds' AND stamp+interval '5 seconds'
 OR NOT zee.testnet_policy_closed_books() OR zee.testnet_continuous_late_exposure(p_policy)
 THEN RAISE EXCEPTION 'CONTINUOUS_PROCEEDS_CLOSED_QUALIFICATION';END IF;
 SELECT * INTO STRICT o FROM zee.orders WHERE id=p_order;
 SELECT * INTO STRICT q FROM zee.quotes WHERE id=p_order;
 SELECT * INTO STRICT d FROM zee.deposits WHERE id=o.primary_deposit;
 IF EXISTS(SELECT 1 FROM zee.testnet_continuous_proceeds WHERE deposit_id=d.id AND order_id=p_order AND policy_sha256=p_policy) THEN RETURN false;END IF;
 IF o.state<>'SETTLED' OR d.order_id<>p_order OR d.classification<>'EXACT' OR d.confirmed_at IS NULL OR d.amount<>q.input_amount
 OR NOT EXISTS(SELECT 1 FROM zee.testnet_policy_admissions a WHERE a.order_id=p_order AND a.policy_sha256 IN(SELECT zee.testnet_policy_lineage(p_policy)))
 OR NOT EXISTS(SELECT 1 FROM zee.obligations b WHERE b.deposit_id=d.id AND b.order_id=p_order AND b.state='DISCHARGED' AND b.source_amount=d.amount)
 OR (SELECT count(*) FROM zee.deposits WHERE order_id=p_order OR reference_hash=q.deposit_reference_hash)<>1
 THEN RAISE EXCEPTION 'CONTINUOUS_PROCEEDS_EXACT_DISCHARGED_SOURCE';END IF;
 IF NOT EXISTS(SELECT 1 FROM zee.chain_observations b JOIN zee.scanner_checkpoints c USING(network) WHERE b.network=d.network AND b.height=d.block_height AND b.block_hash=d.block_hash AND c.finalized_height>=b.height)
 THEN RAISE EXCEPTION 'CONTINUOUS_PROCEEDS_SOURCE_NOT_FINAL';END IF;
 IF q.direction='ZCASH_TO_BASE' THEN
  IF (SELECT count(*) FROM zee.base_attempts t JOIN zee.chain_observations b ON b.network='base-sepolia' AND b.height=t.block_height AND b.block_hash=t.block_hash JOIN zee.scanner_checkpoints c USING(network) WHERE t.order_id=p_order AND t.phase IN('RESERVE','PAY') AND t.confirmed AND c.finalized_height>=b.height AND octet_length(t.signed_payload)>28 AND octet_length(t.receipt_payload)>28)<>2 THEN RAISE EXCEPTION 'CONTINUOUS_PROCEEDS_DELIVERY_NOT_FINAL';END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM zee.reverse_payouts t JOIN zee.chain_observations b ON b.network='zcash-testnet' AND b.height=t.block_height AND b.block_hash=t.block_hash JOIN zee.scanner_checkpoints c USING(network) WHERE t.order_id=p_order AND t.confirmed AND c.finalized_height>=b.height AND octet_length(t.signed_payload)>28 AND octet_length(t.receipt_payload)>28)
  OR NOT EXISTS(SELECT 1 FROM zee.escrow_settlements t JOIN zee.chain_observations b ON b.network='base-sepolia' AND b.height=t.block_height AND b.block_hash=t.block_hash JOIN zee.scanner_checkpoints c USING(network) WHERE t.order_id=p_order AND t.confirmed AND c.finalized_height>=b.height AND octet_length(t.signed_payload)>28 AND octet_length(t.receipt_payload)>28)
  THEN RAISE EXCEPTION 'CONTINUOUS_PROCEEDS_DELIVERY_NOT_FINAL';END IF;
 END IF;
 SELECT COALESCE(sum(amount),0) INTO net_amount FROM zee.ledger_entries WHERE order_id=p_order AND asset=q.source_asset AND bucket='operator:unreconciled';
 IF net_amount<>d.amount THEN RAISE EXCEPTION 'CONTINUOUS_PROCEEDS_EXACT_UNRECONCILED';END IF;
 UPDATE zee.inventory_accounts SET balance=balance+d.amount WHERE asset=q.source_asset AND purpose='principal';
 IF NOT FOUND THEN RAISE EXCEPTION 'CONTINUOUS_PROCEEDS_INVENTORY_ACCOUNT';END IF;
 INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount,order_id) VALUES(event,q.source_asset,'operator:unreconciled',-d.amount,p_order),(event,q.source_asset,'principal:available',d.amount,p_order);
 INSERT INTO zee.testnet_continuous_proceeds(deposit_id,order_id,policy_sha256,qualification_sha256,asset,amount) VALUES(d.id,p_order,p_policy,p_qualification,q.source_asset,d.amount);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION zee.publish_testnet_continuous_demo(zee.digest,zee.digest,zee.digest,zee.digest,zee.digest,bigint,text,timestamp with time zone,zee.atomic,zee.digest,zee.digest,zee.digest,zee.digest),zee.reconcile_testnet_continuous_proceeds(zee.digest,uuid,zee.digest,timestamp with time zone) FROM PUBLIC,zeeswap_api,zeeswap_worker,zeeswap_reader;
REVOKE ALL ON FUNCTION zee.testnet_continuous_demo_enabled(zee.digest),zee.testnet_continuous_late_exposure(zee.digest),zee.testnet_continuous_capacity(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.testnet_continuous_demo_enabled(zee.digest),zee.testnet_continuous_late_exposure(zee.digest),zee.testnet_continuous_capacity(text) TO zeeswap_worker,zeeswap_reader;

-- Preserve every existing branch, including original epoch and late-funds
-- guards; opt out only from cumulative pilot counters for the actual new grant.
DO $$ DECLARE signature text;body text;old text;replacement text; BEGIN
 FOREACH signature IN ARRAY ARRAY['zee.accept_testnet_policy_quote(uuid,zee.digest,zee.digest)','zee.check_testnet_policy_worker(zee.digest,uuid)','zee.testnet_policy_gate(zee.digest)'] LOOP
  body:=pg_get_functiondef(signature::regprocedure);
  IF signature='zee.accept_testnet_policy_quote(uuid,zee.digest,zee.digest)' THEN
   old:='IF (q.direction=';replacement:='IF NOT zee.testnet_continuous_demo_enabled(p_policy) AND ((q.direction=';
   IF (length(body)-length(replace(body,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CONTINUOUS_DEMO_ADMISSION_BASELINE';END IF;
   body:=replace(body,old,replacement);
   old:='p.native_principal_budget THEN RAISE EXCEPTION ''SERVICE_POLICY_LIMIT''';replacement:='p.native_principal_budget) THEN RAISE EXCEPTION ''SERVICE_POLICY_LIMIT''';
  ELSE
   old:='IF nf>p.forward_cap OR nr>p.reverse_cap';replacement:='IF NOT zee.testnet_continuous_demo_enabled(p_policy) AND (nf>p.forward_cap OR nr>p.reverse_cap';
   IF (length(body)-length(replace(body,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CONTINUOUS_DEMO_WORKER_BASELINE';END IF;
   body:=replace(body,old,replacement);
   old:='nr*100000>p.native_principal_budget';replacement:='nr*100000>p.native_principal_budget)';
  END IF;
  IF (length(body)-length(replace(body,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CONTINUOUS_DEMO_CAP_TAIL_BASELINE %',signature;END IF;
  body:=replace(body,old,replacement);
  -- Existing retired-order refusal stays; additionally fence all new dispatch
  -- on a retired late receipt regardless of the removed lifetime counters.
  old:='PERFORM zee.lock_observer_cycle();';
  replacement:=old||chr(10)||' IF zee.testnet_continuous_demo_enabled(p_policy) AND zee.testnet_continuous_late_exposure(p_policy) THEN RAISE EXCEPTION ''SERVICE_REUSE_RETIRED_LATE_FUNDS_REVIEW'';END IF;';
  IF (length(body)-length(replace(body,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CONTINUOUS_DEMO_LOCK_BASELINE';END IF;
  EXECUTE replace(body,old,replacement);
 END LOOP;
 body:=pg_get_functiondef('zee.bind_testnet_policy_quote(uuid,zee.digest,zee.digest)'::regprocedure);
 old:='IF (SELECT count(*) FROM zee.testnet_policy_quotes WHERE policy_sha256 IN(SELECT zee.testnet_policy_lineage(p_policy)))>=p.quote_cap';
 IF strpos(body,old)=0 THEN RAISE EXCEPTION 'CONTINUOUS_DEMO_QUOTE_BASELINE';END IF;
 body:=replace(body,old,'IF NOT zee.testnet_continuous_demo_enabled(p_policy) AND (SELECT count(*) FROM zee.testnet_policy_quotes WHERE policy_sha256 IN(SELECT zee.testnet_policy_lineage(p_policy)))>=p.quote_cap');
 old:='INSERT INTO zee.testnet_policy_quotes VALUES';
 body:=replace(body,old,'IF zee.testnet_continuous_demo_enabled(p_policy) AND (SELECT count(*) FROM zee.testnet_policy_quotes WHERE policy_sha256 IN(SELECT zee.testnet_policy_lineage(p_policy)) AND created_at>clock_timestamp()-interval ''120 seconds'')>=32 THEN RAISE EXCEPTION ''SERVICE_QUOTE_RATE_LIMIT'';END IF;'||chr(10)||' '||old);
 EXECUTE body;
END $$;

ALTER FUNCTION zee.testnet_policy_availability(zee.digest) RENAME TO testnet_policy_availability_bounded;
REVOKE ALL ON FUNCTION zee.testnet_policy_availability_bounded(zee.digest) FROM PUBLIC,zeeswap_api,zeeswap_worker,zeeswap_reader;

CREATE OR REPLACE FUNCTION zee.testnet_policy_availability(p_policy zee.digest) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE p zee.root_testnet_service_policies;c zee.runtime_control;r zee.testnet_service_runtime;stamp timestamptz:=clock_timestamp();nf bigint;nr bigint;nq integer;na integer;result jsonb;reason text;f boolean;v boolean;
BEGIN
 IF NOT zee.testnet_continuous_demo_enabled(p_policy) THEN RETURN zee.testnet_policy_availability_bounded(p_policy);END IF;
 SELECT * INTO p FROM zee.root_testnet_service_policies WHERE policy_sha256=p_policy;
 IF NOT FOUND THEN RETURN jsonb_build_object('version',1,'status','disabled','checkedAt',stamp,'policy',NULL);END IF;
 SELECT * INTO c FROM zee.runtime_control WHERE singleton;SELECT * INTO r FROM zee.testnet_service_runtime WHERE policy_sha256=p_policy;
 nf:=zee.testnet_continuous_capacity('ZCASH_TO_BASE');nr:=zee.testnet_continuous_capacity('BASE_TO_ZCASH');
 SELECT count(*) INTO nq FROM zee.testnet_policy_quotes WHERE policy_sha256 IN(SELECT zee.testnet_policy_lineage(p_policy)) AND created_at>stamp-interval '120 seconds';
 SELECT count(*) INTO na FROM zee.orders WHERE state NOT IN('SETTLED','REFUNDED','EXPIRED_UNFUNDED');
 IF p.expires_at<=stamp AND NOT zee.testnet_policy_nonexpiring(p_policy) THEN reason:='POLICY_EXPIRED';
 ELSIF c.reconciliation_required THEN reason:='RECONCILING';
 ELSIF c.epoch<>zee.testnet_policy_execution_epoch(p_policy) OR NOT c.accepting_orders OR NOT c.dispatch_enabled THEN reason:='RUNTIME_PAUSED';
 ELSIF (SELECT count(*) FROM zee.assets WHERE id IN('TAZ','mockUSDC') AND live_enabled)<>2 OR EXISTS(SELECT 1 FROM zee.assets WHERE id='baseETH' AND live_enabled) OR NOT EXISTS(SELECT 1 FROM zee.assets WHERE id='TAZ' AND decimals=8 AND network='zcash-testnet' AND contract_address IS NULL) OR NOT EXISTS(SELECT 1 FROM zee.assets WHERE id='mockUSDC' AND decimals=6 AND network='base-sepolia' AND lower(contract_address)=p.token_contract) THEN reason:='RUNTIME_PAUSED';
 ELSIF (SELECT count(*) FROM zee.scanner_checkpoints WHERE network IN('zcash-testnet','base-sepolia') AND observed_at BETWEEN stamp-interval '60 seconds' AND stamp+interval '5 seconds')<>2 THEN reason:='SOURCE_STALE';
 ELSIF zee.testnet_continuous_late_exposure(p_policy) THEN reason:='REUSE_LATE_LIABILITY_REVIEW';
 ELSIF nq>=32 THEN reason:='QUOTE_RATE_LIMIT';
 ELSIF r.policy_sha256 IS NULL OR r.control_epoch<>c.epoch OR NOT zee.testnet_worker_lease_owned(r.worker_backend_pid) THEN reason:='WORKER_OR_CAPITAL_STALE';
 ELSIF r.worker_ready_at NOT BETWEEN stamp-interval '60 seconds' AND stamp+interval '5 seconds' THEN reason:='WORKER_OR_CAPITAL_STALE';
 ELSIF zee.testnet_global_slot_busy() THEN reason:='GLOBAL_ORDER_ACTIVE';
 ELSIF r.capital_observed_at NOT BETWEEN stamp-interval '60 seconds' AND stamp+interval '5 seconds' THEN reason:='CAPITAL_UNAVAILABLE';END IF;
 f:=nf>0;v:=nr>0;
 IF reason IS NULL AND NOT f AND NOT v THEN reason:='CAPITAL_UNAVAILABLE';END IF;
 RETURN jsonb_build_object('version',5,'status',CASE WHEN reason IS NULL THEN 'ready' WHEN reason='QUOTE_RATE_LIMIT' THEN 'rate_limited' WHEN reason='POLICY_EXPIRED' THEN 'policy_expired' WHEN reason='GLOBAL_ORDER_ACTIVE' THEN 'busy' WHEN reason='RECONCILING' THEN 'reconciling' WHEN reason='SOURCE_STALE' THEN 'source_unavailable' WHEN reason='WORKER_OR_CAPITAL_STALE' THEN 'worker_unavailable' WHEN reason='CAPITAL_UNAVAILABLE' THEN 'capital_unavailable' ELSE 'paused' END,'checkedAt',stamp,
 'policy',jsonb_build_object('id',p.policy_id,'sha256',encode(p_policy,'hex'),'expiresAt',CASE WHEN zee.testnet_policy_nonexpiring(p_policy) THEN NULL ELSE p.expires_at END,'inputAmountAtomic','100000','maxAcceptedByDirection',NULL,'remainingByDirection',jsonb_build_object('ZCASH_TO_BASE',nf,'BASE_TO_ZCASH',nr),'maxConcurrent',1,'activeOrders',na,
 'availableByDirection',jsonb_build_object('ZCASH_TO_BASE',reason IS NULL AND f,'BASE_TO_ZCASH',reason IS NULL AND v),'remainingQuotes',NULL,'quoteRateLimit',jsonb_build_object('max',32,'windowSeconds',120,'remaining',greatest(0,32-nq))) || CASE WHEN zee.testnet_policy_nonexpiring(p_policy) THEN jsonb_build_object('lifetime','nonexpiring','lifetimeAuthorizationSha256',(SELECT encode(authorization_sha256,'hex') FROM zee.testnet_service_lifetime_authorizations WHERE policy_sha256=p_policy)) ELSE '{}'::jsonb END || CASE WHEN zee.testnet_unfunded_reuse_enabled(p_policy) THEN jsonb_build_object('capacityBasis','current-liquidity','capacityAuthorizationSha256',(SELECT encode(authorization_sha256,'hex') FROM zee.testnet_continuous_demo_authorizations WHERE policy_sha256=p_policy)) ELSE '{}'::jsonb END);
END $$;
REVOKE ALL ON FUNCTION zee.testnet_policy_availability(zee.digest) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.testnet_policy_availability(zee.digest) TO zeeswap_worker,zeeswap_reader;
