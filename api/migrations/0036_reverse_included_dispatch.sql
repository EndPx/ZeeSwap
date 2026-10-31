-- Reverse L2 inclusion permits dispatch without asserting source or COMMIT finality.
CREATE TABLE zee.escrow_inclusions (
 order_id uuid NOT NULL REFERENCES zee.escrow_bindings(order_id),phase text NOT NULL CHECK(phase IN ('FUND','COMMIT','SETTLE')),
 tx_hash zee.digest NOT NULL,deposit_id uuid REFERENCES zee.deposits(id),block_height bigint NOT NULL CHECK(block_height>=0),
 block_hash text NOT NULL CHECK(block_hash ~ '^[0-9a-f]{64}$'),fee zee.atomic NOT NULL,
 receipt_payload bytea NOT NULL CHECK(octet_length(receipt_payload)>28),observed_at timestamptz NOT NULL,valid boolean NOT NULL DEFAULT true,
 PRIMARY KEY(order_id,phase),CHECK((phase='FUND')=(deposit_id IS NOT NULL))
);
REVOKE ALL ON zee.escrow_inclusions FROM PUBLIC;
GRANT SELECT ON zee.escrow_inclusions TO zeeswap_worker,zeeswap_reader;
CREATE VIEW zee.escrow_inclusion_status AS SELECT order_id,phase,block_height,receipt_payload,valid FROM zee.escrow_inclusions;
GRANT SELECT ON zee.escrow_inclusion_status TO zeeswap_api,zeeswap_reader;
CREATE FUNCTION zee.escrow_inclusion_ready(p_order uuid,p_phase text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
 SELECT EXISTS(SELECT 1 FROM zee.escrow_inclusions i JOIN zee.chain_observations b ON b.network='base-sepolia' AND b.height=i.block_height AND b.block_hash=i.block_hash
 WHERE i.order_id=p_order AND i.phase=p_phase AND i.valid AND i.observed_at BETWEEN clock_timestamp()-interval '15 seconds' AND clock_timestamp()+interval '5 seconds')
$$;
CREATE FUNCTION zee.observe_escrow_inclusion(p_order uuid,p_phase text,p_hash zee.digest,p_deposit uuid,p_height bigint,p_block text,p_fee zee.atomic,p_payload bytea)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE old zee.escrow_inclusions;d zee.deposits;op uuid;
BEGIN
 PERFORM 1 FROM zee.runtime_control WHERE singleton FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM zee.quotes WHERE id=p_order AND direction='BASE_TO_ZCASH' AND execution_mode='base-escrow-v1') THEN RAISE EXCEPTION 'reverse inclusion order mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM zee.chain_observations WHERE network='base-sepolia' AND height=p_height AND block_hash=p_block) THEN RAISE EXCEPTION 'reverse inclusion not canonical'; END IF;
 IF p_phase='FUND' THEN
  SELECT * INTO STRICT d FROM zee.deposits WHERE id=p_deposit;
  IF d.order_id<>p_order OR d.network<>'base-sepolia' OR d.classification<>'EXACT' OR (d.block_height,d.block_hash) IS DISTINCT FROM (p_height,p_block)
   OR NOT EXISTS(SELECT 1 FROM zee.orders WHERE id=p_order AND primary_deposit=d.id AND state IN('CONFIRMING','READY')) THEN RAISE EXCEPTION 'reverse included source mismatch'; END IF;
 ELSE
  IF p_deposit IS NOT NULL OR NOT EXISTS(SELECT 1 FROM (
   SELECT tx_hash,max_cost FROM zee.escrow_commits WHERE order_id=p_order AND p_phase='COMMIT'
   UNION ALL SELECT tx_hash,max_cost FROM zee.escrow_settlements WHERE order_id=p_order AND p_phase='SETTLE') a
   WHERE a.tx_hash=p_hash AND p_fee<=a.max_cost) THEN RAISE EXCEPTION 'reverse inclusion attempt mismatch'; END IF;
 END IF;
 SELECT * INTO old FROM zee.escrow_inclusions WHERE order_id=p_order AND phase=p_phase;
 IF FOUND AND (NOT old.valid OR (old.tx_hash,old.deposit_id,old.block_height,old.block_hash,old.fee) IS DISTINCT FROM (p_hash,p_deposit,p_height,p_block,p_fee)) THEN RAISE EXCEPTION 'reverse included receipt changed; reconcile'; END IF;
 INSERT INTO zee.escrow_inclusions VALUES(p_order,p_phase,p_hash,p_deposit,p_height,p_block,p_fee,p_payload,clock_timestamp(),true)
 ON CONFLICT(order_id,phase) DO UPDATE SET observed_at=EXCLUDED.observed_at;
 IF p_phase='FUND' THEN
  -- These create a dispatchable operation, never a finalized source receipt.
  INSERT INTO zee.operations(order_id,deposit_id,kind) VALUES(p_order,p_deposit,'PAYOUT') ON CONFLICT(deposit_id) DO NOTHING RETURNING id INTO op;
  IF op IS NOT NULL THEN INSERT INTO zee.outbox_jobs(operation_id) VALUES(op); END IF;
  UPDATE zee.orders SET state='READY' WHERE id=p_order AND state='CONFIRMING';
 END IF;
END $$;
CREATE FUNCTION zee.invalidate_escrow_inclusion(p_order uuid,p_phase text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 UPDATE zee.escrow_inclusions SET valid=false WHERE order_id=p_order AND phase=p_phase;
 IF FOUND THEN PERFORM zee.enter_reconciliation(); END IF;
END $$;
CREATE OR REPLACE FUNCTION zee.check_escrow_dispatch(p_order uuid,p_job uuid,p_owner uuid,p_fence bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 PERFORM 1 FROM zee.runtime_control WHERE singleton AND dispatch_enabled AND NOT reconciliation_required FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'dispatch paused'; END IF;
 IF (SELECT count(*) FROM zee.scanner_checkpoints WHERE observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds')<>2
 THEN RAISE EXCEPTION 'observers stale'; END IF;
 IF NOT EXISTS(SELECT 1 FROM zee.outbox_jobs j JOIN zee.operations op ON op.id=j.operation_id
 JOIN zee.orders o ON o.id=op.order_id JOIN zee.quotes q ON q.id=o.id
 JOIN zee.deposits d ON d.id=op.deposit_id JOIN zee.scanner_checkpoints s ON s.network=d.network
 JOIN zee.chain_observations b ON b.network=d.network AND b.height=d.block_height AND b.block_hash=d.block_hash
 WHERE j.id=p_job AND j.lease_owner=p_owner AND j.fence=p_fence AND j.status='LEASED' AND j.lease_until>clock_timestamp()
 AND op.order_id=p_order AND op.kind='PAYOUT' AND o.state='READY' AND q.execution_mode='base-escrow-v1'
 AND d.network='base-sepolia' AND d.classification='EXACT' AND ((d.confirmed_at IS NOT NULL AND s.finalized_height>=d.block_height) OR EXISTS(SELECT 1 FROM zee.escrow_inclusions i WHERE i.order_id=p_order AND i.phase='FUND' AND i.deposit_id=d.id AND i.block_height=d.block_height AND i.block_hash=d.block_hash AND zee.escrow_inclusion_ready(p_order,'FUND'))))
 THEN RAISE EXCEPTION 'stale lease or invalid source'; END IF;
END $$;
CREATE OR REPLACE FUNCTION zee.check_reverse_signing(p_order uuid,p_job uuid,p_owner uuid,p_fence bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 PERFORM zee.check_escrow_dispatch(p_order,p_job,p_owner,p_fence);
 IF NOT EXISTS(SELECT 1 FROM zee.escrow_commits a JOIN zee.chain_observations b ON b.network='base-sepolia'
 AND b.height=a.block_height AND b.block_hash=a.block_hash JOIN zee.scanner_checkpoints s ON s.network=b.network
 WHERE a.order_id=p_order AND a.confirmed AND s.finalized_height>=a.block_height)
 AND NOT zee.escrow_inclusion_ready(p_order,'COMMIT') THEN RAISE EXCEPTION 'canonical commitment missing'; END IF;
END $$;
CREATE OR REPLACE FUNCTION zee.store_escrow_settlement(p_order uuid,p_job uuid,p_owner uuid,p_fence bigint,p_hash zee.digest,p_payload bytea,p_max zee.atomic)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE a zee.escrow_settlements;
BEGIN
 PERFORM zee.check_reverse_signing(p_order,p_job,p_owner,p_fence);
 PERFORM zee.check_reverse_delivery(p_order);
 PERFORM 1 FROM zee.orders WHERE id=p_order FOR UPDATE;
 SELECT * INTO a FROM zee.escrow_settlements WHERE order_id=p_order;
 IF FOUND THEN
  IF (a.tx_hash,a.max_cost) IS DISTINCT FROM (p_hash,p_max) THEN RAISE EXCEPTION 'conflicting signed settlement'; END IF;
  RETURN;
 END IF;
 IF p_max+(SELECT COALESCE(actual_fee,max_cost) FROM zee.escrow_commits WHERE order_id=p_order)>(SELECT refund_fee FROM zee.quotes WHERE id=p_order)
 THEN RAISE EXCEPTION 'total Base gas reserve exceeded'; END IF;
 INSERT INTO zee.escrow_settlements(order_id,tx_hash,signed_payload,max_cost) VALUES(p_order,p_hash,p_payload,p_max);
 INSERT INTO zee.order_events(order_id,event_type) VALUES(p_order,'BASE_SETTLE_SIGNED');
END $$;
CREATE OR REPLACE FUNCTION zee.confirm_escrow_settlement(p_order uuid,p_hash zee.digest,p_height bigint,p_block text,p_fee zee.atomic,p_receipt bytea)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE a zee.escrow_settlements;q zee.quotes;o zee.orders;d zee.deposits;r record;spent numeric;fees numeric;event uuid:=gen_random_uuid();
BEGIN
 PERFORM 1 FROM zee.runtime_control WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT a FROM zee.escrow_settlements WHERE order_id=p_order FOR UPDATE;
 IF a.tx_hash<>p_hash THEN RAISE EXCEPTION 'settlement receipt identity mismatch'; END IF;
 IF a.confirmed THEN
  IF (a.block_height,a.block_hash,a.actual_fee) IS DISTINCT FROM (p_height,p_block,p_fee) THEN RAISE EXCEPTION 'settlement receipt changed; reconcile'; END IF;
  RETURN false;
 END IF;
 PERFORM zee.check_reverse_delivery(p_order);
 IF NOT EXISTS(SELECT 1 FROM zee.scanner_checkpoints s JOIN zee.chain_observations b ON b.network=s.network
 WHERE s.network='base-sepolia' AND s.finalized_height>=p_height AND b.height=p_height AND b.block_hash=p_block
 AND s.observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds')
 THEN RAISE EXCEPTION 'settlement is not finalized canonical'; END IF;
 IF p_fee>a.max_cost THEN RAISE EXCEPTION 'settlement fee cap exceeded'; END IF;
 SELECT * INTO STRICT o FROM zee.orders WHERE id=p_order FOR UPDATE;
 SELECT * INTO STRICT q FROM zee.quotes WHERE id=p_order;
 SELECT * INTO STRICT d FROM zee.deposits WHERE id=o.primary_deposit;
 IF d.confirmed_at IS NULL THEN RAISE EXCEPTION 'source is not finalized'; END IF;
 SELECT p_fee+actual_fee INTO fees FROM zee.escrow_commits WHERE order_id=p_order AND confirmed;
 IF fees IS NULL OR fees>q.refund_fee THEN RAISE EXCEPTION 'Base execution reserve insufficient'; END IF;
 UPDATE zee.escrow_settlements SET confirmed=true,block_height=p_height,block_hash=p_block,actual_fee=p_fee,receipt_payload=p_receipt WHERE order_id=p_order;
 FOR r IN SELECT * FROM zee.reservations WHERE order_id=p_order AND released_at IS NULL ORDER BY asset,purpose LOOP
  spent:=CASE WHEN r.asset='TAZ' AND r.purpose='principal' THEN q.output_amount
    WHEN r.asset='TAZ' AND r.purpose='fee' THEN (SELECT actual_fee FROM zee.reverse_payouts WHERE order_id=p_order)
    WHEN r.asset='baseETH' AND r.purpose='fee' THEN fees ELSE 0 END;
  IF spent>r.amount THEN RAISE EXCEPTION 'reservation insufficient'; END IF;
  UPDATE zee.inventory_accounts SET reserved=reserved-r.amount,balance=balance-spent WHERE asset=r.asset AND purpose=r.purpose;
  UPDATE zee.reservations SET released_at=clock_timestamp() WHERE order_id=p_order AND asset=r.asset AND purpose=r.purpose;
  INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount,order_id) VALUES(event,r.asset,r.purpose||':reserved',-r.amount,p_order);
  IF spent>0 THEN INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount,order_id) VALUES(event,r.asset,r.purpose||':spent',spent,p_order); END IF;
  IF r.amount>spent THEN INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount,order_id) VALUES(event,r.asset,r.purpose||':available',r.amount-spent,p_order); END IF;
 END LOOP;
 INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount,order_id) VALUES
 (event,'mockUSDC','customer:held',-d.amount,p_order),(event,'mockUSDC','operator:unreconciled',d.amount,p_order),
 (event,'mockUSDC','customer:liability',d.amount,p_order),(event,'mockUSDC','conversion:source',-d.amount,p_order);
 UPDATE zee.obligations SET state='DISCHARGED' WHERE deposit_id=d.id;
 UPDATE zee.operations SET state='CONFIRMED' WHERE order_id=p_order AND kind='PAYOUT';
 UPDATE zee.outbox_jobs SET status='DONE' WHERE operation_id IN(SELECT id FROM zee.operations WHERE order_id=p_order AND kind='PAYOUT');
 UPDATE zee.orders SET state=CASE WHEN state IN('REORGED','REVIEW_REQUIRED') THEN 'REVIEW_REQUIRED' ELSE 'SETTLED' END WHERE id=p_order;
 INSERT INTO zee.order_events(order_id,event_type) VALUES(p_order,'BASE_SETTLE_FINALIZED');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION zee.escrow_inclusion_ready(uuid,text),zee.observe_escrow_inclusion(uuid,text,zee.digest,uuid,bigint,text,zee.atomic,bytea),zee.invalidate_escrow_inclusion(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.escrow_inclusion_ready(uuid,text),zee.observe_escrow_inclusion(uuid,text,zee.digest,uuid,bigint,text,zee.atomic,bytea),zee.invalidate_escrow_inclusion(uuid,text) TO zeeswap_worker;
