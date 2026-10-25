-- Opt-in accepted policy liability drain. Legacy 0013 remains unchanged.
-- All routines lock the current control row through the existing policy gate.
CREATE FUNCTION zee.check_testnet_policy_source_refund_liability(p_order uuid,p_policy zee.digest) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE d zee.deposits;o zee.orders;
BEGIN
 PERFORM zee.check_testnet_policy_worker(p_policy,p_order);
 SELECT * INTO STRICT o FROM zee.orders WHERE id=p_order FOR UPDATE;
 SELECT * INTO STRICT d FROM zee.deposits WHERE id=o.primary_deposit;
 IF d.confirmed_at IS NULL OR d.amount<=0 OR d.amount>100000 OR d.classification NOT IN('EXACT','UNDER','LATE')
  OR (SELECT count(*) FROM zee.deposits WHERE order_id=p_order)<>1
  OR (SELECT count(*) FROM zee.obligations WHERE order_id=p_order AND deposit_id=d.id AND source_amount=d.amount AND state IN('HELD','REFUND_REQUIRED'))<>1
  OR EXISTS(SELECT 1 FROM zee.obligations WHERE order_id=p_order AND deposit_id<>d.id AND state<>'DISCHARGED')
 THEN RAISE EXCEPTION 'policy refund requires sole allocated confirmed primary liability'; END IF;
 IF NOT EXISTS(SELECT 1 FROM zee.scanner_checkpoints s JOIN zee.chain_observations b ON b.network=s.network AND b.height=d.block_height AND b.block_hash=d.block_hash WHERE s.network=d.network AND ((d.network='zcash-testnet' AND s.scanned_height-d.block_height+1>=10) OR (d.network='base-sepolia' AND s.finalized_height>=d.block_height))) THEN RAISE EXCEPTION 'policy refund canonical confirmed source required';END IF;
 IF EXISTS(SELECT 1 FROM zee.operations WHERE order_id=p_order AND state='CONFIRMED')
  OR EXISTS(SELECT 1 FROM zee.base_attempts WHERE order_id=p_order AND (phase='PAY' OR NOT confirmed))
  OR EXISTS(SELECT 1 FROM zee.escrow_commits WHERE order_id=p_order)
  OR EXISTS(SELECT 1 FROM zee.reverse_payouts WHERE order_id=p_order)
  OR EXISTS(SELECT 1 FROM zee.chain_transactions t JOIN zee.operations op ON op.id=t.operation_id WHERE op.order_id=p_order AND op.kind<>'REFUND' AND t.state NOT IN('REVERTED','EXPIRED'))
 THEN RAISE EXCEPTION 'policy refund paid committed or unresolved original attempt'; END IF;
END $$;

CREATE FUNCTION zee.begin_testnet_policy_source_refund(p_order uuid,p_policy zee.digest) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE o zee.orders;q zee.quotes;d zee.deposits;c zee.runtime_control;
BEGIN
 SELECT * INTO STRICT c FROM zee.runtime_control WHERE singleton FOR UPDATE;
 PERFORM zee.check_testnet_policy_source_refund_liability(p_order,p_policy);
 SELECT * INTO STRICT o FROM zee.orders WHERE id=p_order FOR UPDATE;
 SELECT * INTO STRICT q FROM zee.quotes WHERE id=p_order;
 IF EXISTS(SELECT 1 FROM zee.source_refunds WHERE order_id=p_order) THEN RETURN; END IF;
 IF o.state NOT IN('READY','REFUND_REQUIRED') OR q.execution_mode NOT IN('base-settlement-v1','base-escrow-v1') THEN RAISE EXCEPTION 'order not refundable'; END IF;
 SELECT * INTO STRICT d FROM zee.deposits WHERE id=o.primary_deposit;
 IF d.confirmed_at IS NULL OR d.classification NOT IN('EXACT','UNDER','OVER','LATE') OR
  EXISTS(SELECT 1 FROM zee.obligations WHERE order_id=p_order AND deposit_id<>d.id AND state<>'DISCHARGED')
 THEN RAISE EXCEPTION 'confirmed sole primary liability required; extra deposits require separately budgeted recovery'; END IF;
 IF EXISTS(SELECT 1 FROM zee.operations WHERE order_id=p_order AND state='CONFIRMED') OR
  EXISTS(SELECT 1 FROM zee.base_attempts WHERE order_id=p_order AND phase='PAY' AND confirmed) OR
  EXISTS(SELECT 1 FROM zee.escrow_commits WHERE order_id=p_order) OR
  EXISTS(SELECT 1 FROM zee.reverse_payouts WHERE order_id=p_order)
 THEN RAISE EXCEPTION 'paid or committed order cannot refund'; END IF;
 INSERT INTO zee.source_refunds(order_id,deposit_id,epoch,base_phase)
 VALUES(p_order,d.id,c.epoch,CASE WHEN q.direction='ZCASH_TO_BASE' THEN 'CANCEL' ELSE 'REFUND' END);
 UPDATE zee.orders SET state='REFUND_REQUIRED' WHERE id=p_order;
 -- Retire any ordinary payout job before cancellation/refund. Previously signed
 -- Base bytes remain in their independent journal and onchain CANCEL excludes them.
 UPDATE zee.outbox_jobs SET status='DONE',fence=fence+1 WHERE operation_id IN(SELECT id FROM zee.operations WHERE order_id=p_order);
 UPDATE zee.operations SET kind='REFUND',chain_authorization_verified=false WHERE order_id=p_order;
 INSERT INTO zee.order_events(order_id,event_type) VALUES(p_order,'SOURCE_REFUND_PLANNED');
END $$;

CREATE FUNCTION zee.check_testnet_policy_source_refund_operator(p_order uuid,p_policy zee.digest) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 PERFORM zee.check_testnet_policy_source_refund_liability(p_order,p_policy);
 PERFORM 1 FROM zee.runtime_control c JOIN zee.source_refunds a ON a.epoch=c.epoch JOIN zee.orders o ON o.id=a.order_id
 WHERE c.singleton AND c.dispatch_enabled AND NOT c.reconciliation_required
 AND a.order_id=p_order AND NOT a.confirmed AND o.state='REFUND_REQUIRED' FOR SHARE OF c;
 IF NOT FOUND THEN RAISE EXCEPTION 'refund operator epoch/state fenced'; END IF;
 IF EXISTS(SELECT 1 FROM zee.escrow_commits WHERE order_id=p_order) OR EXISTS(SELECT 1 FROM zee.reverse_payouts WHERE order_id=p_order)
 THEN RAISE EXCEPTION 'committed reverse refund forbidden'; END IF;
END $$;

CREATE FUNCTION zee.store_testnet_policy_source_refund_base(p_order uuid,p_policy zee.digest,p_hash zee.digest,p_payload bytea,p_max zee.atomic) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE a zee.source_refunds;q zee.quotes;
BEGIN
 PERFORM zee.check_testnet_policy_source_refund_operator(p_order,p_policy);SELECT * INTO STRICT a FROM zee.source_refunds WHERE order_id=p_order FOR UPDATE;
 IF a.base_hash IS NOT NULL THEN IF (a.base_hash,a.base_max_cost) IS DISTINCT FROM(p_hash,p_max) THEN RAISE EXCEPTION 'conflicting source refund Base transaction'; END IF;RETURN;END IF;
 SELECT * INTO STRICT q FROM zee.quotes WHERE id=p_order;
 IF p_max>10000000000000 OR p_max<=0 OR p_max>(CASE WHEN a.base_phase='CANCEL' THEN q.payout_fee ELSE q.refund_fee END)
 THEN RAISE EXCEPTION 'source refund Base fee cap exceeded'; END IF;
 UPDATE zee.source_refunds SET base_hash=p_hash,base_payload=p_payload,base_max_cost=p_max WHERE order_id=p_order;
 INSERT INTO zee.order_events(order_id,event_type) VALUES(p_order,'SOURCE_REFUND_BASE_SIGNED');
END $$;

CREATE FUNCTION zee.check_testnet_policy_source_refund_signing(p_order uuid,p_policy zee.digest) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 PERFORM zee.check_testnet_policy_source_refund_operator(p_order,p_policy);
 IF NOT EXISTS(SELECT 1 FROM zee.source_refunds a JOIN zee.deposits d ON d.id=a.deposit_id
 JOIN zee.scanner_checkpoints z ON z.network='zcash-testnet' JOIN zee.chain_observations zb ON zb.network=z.network AND zb.height=d.block_height AND zb.block_hash=d.block_hash
 JOIN zee.scanner_checkpoints b ON b.network='base-sepolia' JOIN zee.chain_observations bb ON bb.network=b.network AND bb.height=a.base_height AND bb.block_hash=a.base_block
 WHERE a.order_id=p_order AND a.base_phase='CANCEL' AND a.base_confirmed AND d.confirmed_at IS NOT NULL AND z.scanned_height-d.block_height+1>=10
 AND b.finalized_height>=a.base_height AND z.observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds'
 AND b.observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds')
 THEN RAISE EXCEPTION 'fresh canonical source and permanent Base cancellation required';END IF;
END $$;

CREATE FUNCTION zee.store_testnet_policy_source_refund_zcash(p_order uuid,p_policy zee.digest,p_hash zee.digest,p_payload bytea,p_fee zee.atomic,p_expiry bigint) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE a zee.source_refunds;
BEGIN
 PERFORM zee.check_testnet_policy_source_refund_signing(p_order,p_policy);SELECT * INTO STRICT a FROM zee.source_refunds WHERE order_id=p_order FOR UPDATE;
 IF a.zcash_hash IS NOT NULL THEN IF (a.zcash_hash,a.zcash_fee,a.expiry_height) IS DISTINCT FROM(p_hash,p_fee,p_expiry) THEN RAISE EXCEPTION 'conflicting signed source refund';END IF;RETURN;END IF;
 IF p_fee>10000 OR p_fee<=0 OR p_fee>(SELECT refund_fee FROM zee.quotes WHERE id=p_order) OR p_expiry<(SELECT scanned_height+20 FROM zee.scanner_checkpoints WHERE network='zcash-testnet') THEN RAISE EXCEPTION 'refund fee or expiry unsafe';END IF;
 UPDATE zee.source_refunds SET zcash_hash=p_hash,zcash_payload=p_payload,zcash_fee=p_fee,expiry_height=p_expiry WHERE order_id=p_order;
 UPDATE zee.operations SET state='SIGNED' WHERE order_id=p_order AND kind='REFUND';
END $$;

CREATE FUNCTION zee.confirm_testnet_policy_source_refund_base(p_order uuid,p_policy zee.digest,p_phase text,p_hash zee.digest,p_height bigint,p_block text,p_fee zee.atomic,p_receipt bytea) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 PERFORM zee.check_testnet_policy_worker(p_policy,p_order);
 IF EXISTS(SELECT 1 FROM zee.source_refunds WHERE order_id=p_order AND NOT confirmed) THEN PERFORM zee.check_testnet_policy_source_refund_liability(p_order,p_policy);END IF;
 IF NOT EXISTS(SELECT 1 FROM zee.source_refunds a JOIN zee.runtime_control c ON c.epoch=a.epoch WHERE c.singleton AND a.order_id=p_order) THEN RAISE EXCEPTION 'policy refund receipt epoch fenced';END IF;
 RETURN zee.confirm_source_refund_base(p_order,p_phase,p_hash,p_height,p_block,p_fee,p_receipt);
END $$;

CREATE FUNCTION zee.confirm_testnet_policy_source_refund_zcash(p_order uuid,p_policy zee.digest,p_hash zee.digest,p_height bigint,p_block text,p_fee zee.atomic,p_receipt bytea) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 PERFORM zee.check_testnet_policy_worker(p_policy,p_order);
 IF EXISTS(SELECT 1 FROM zee.source_refunds WHERE order_id=p_order AND NOT confirmed) THEN PERFORM zee.check_testnet_policy_source_refund_liability(p_order,p_policy);END IF;
 IF NOT EXISTS(SELECT 1 FROM zee.source_refunds a JOIN zee.runtime_control c ON c.epoch=a.epoch WHERE c.singleton AND a.order_id=p_order) THEN RAISE EXCEPTION 'policy refund receipt epoch fenced';END IF;
 RETURN zee.confirm_source_refund_zcash(p_order,p_hash,p_height,p_block,p_fee,p_receipt);
END $$;

REVOKE ALL ON FUNCTION zee.check_testnet_policy_source_refund_liability(uuid,zee.digest) FROM PUBLIC;

REVOKE ALL ON FUNCTION zee.begin_testnet_policy_source_refund(uuid,zee.digest) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION zee.begin_testnet_policy_source_refund(uuid,zee.digest) TO zeeswap_worker;

REVOKE ALL ON FUNCTION zee.check_testnet_policy_source_refund_operator(uuid,zee.digest) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION zee.check_testnet_policy_source_refund_operator(uuid,zee.digest) TO zeeswap_worker;

REVOKE ALL ON FUNCTION zee.store_testnet_policy_source_refund_base(uuid,zee.digest,zee.digest,bytea,zee.atomic) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION zee.store_testnet_policy_source_refund_base(uuid,zee.digest,zee.digest,bytea,zee.atomic) TO zeeswap_worker;

REVOKE ALL ON FUNCTION zee.check_testnet_policy_source_refund_signing(uuid,zee.digest) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION zee.check_testnet_policy_source_refund_signing(uuid,zee.digest) TO zeeswap_worker;

REVOKE ALL ON FUNCTION zee.store_testnet_policy_source_refund_zcash(uuid,zee.digest,zee.digest,bytea,zee.atomic,bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION zee.store_testnet_policy_source_refund_zcash(uuid,zee.digest,zee.digest,bytea,zee.atomic,bigint) TO zeeswap_worker;

REVOKE ALL ON FUNCTION zee.confirm_testnet_policy_source_refund_base(uuid,zee.digest,text,zee.digest,bigint,text,zee.atomic,bytea) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION zee.confirm_testnet_policy_source_refund_base(uuid,zee.digest,text,zee.digest,bigint,text,zee.atomic,bytea) TO zeeswap_worker;

REVOKE ALL ON FUNCTION zee.confirm_testnet_policy_source_refund_zcash(uuid,zee.digest,zee.digest,bigint,text,zee.atomic,bytea) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION zee.confirm_testnet_policy_source_refund_zcash(uuid,zee.digest,zee.digest,bigint,text,zee.atomic,bytea) TO zeeswap_worker;
