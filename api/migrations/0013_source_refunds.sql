-- Restricted operator source refunds. No committed escrow abort is exposed.
-- Trusted adapters establish actual terminal contract state/recipient receipts;
-- SQL independently checks immutable liability, canonical finality and budgets.
CREATE TABLE zee.source_refunds (
 order_id uuid PRIMARY KEY REFERENCES zee.orders(id),deposit_id uuid NOT NULL UNIQUE REFERENCES zee.deposits(id),
 epoch bigint NOT NULL,base_phase text NOT NULL CHECK(base_phase IN('CANCEL','REFUND')),
 base_hash zee.digest UNIQUE,base_payload bytea,base_max_cost zee.atomic,
 base_confirmed boolean NOT NULL DEFAULT false,base_height bigint,base_block text,base_fee zee.atomic,base_receipt bytea,
 zcash_hash zee.digest UNIQUE,zcash_payload bytea,zcash_fee zee.atomic,expiry_height bigint,
 confirmed boolean NOT NULL DEFAULT false,height bigint,block_hash text,receipt_payload bytea,
 CHECK((base_hash IS NULL AND base_payload IS NULL AND base_max_cost IS NULL) OR
  (base_hash IS NOT NULL AND octet_length(base_payload)>28 AND base_max_cost>0)),
 CHECK(NOT base_confirmed OR (base_hash IS NOT NULL AND base_height>0 AND base_block~'^[0-9a-f]{64}$' AND base_fee IS NOT NULL AND octet_length(base_receipt)>28)),
 CHECK((zcash_hash IS NULL AND zcash_payload IS NULL AND zcash_fee IS NULL AND expiry_height IS NULL) OR
  (base_phase='CANCEL' AND zcash_hash IS NOT NULL AND octet_length(zcash_payload)>28 AND zcash_fee>0 AND expiry_height>0)),
 CHECK(NOT confirmed OR (height>0 AND block_hash~'^[0-9a-f]{64}$' AND octet_length(receipt_payload)>28))
);
CREATE FUNCTION zee.freeze_source_refund() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,zee AS $$
BEGIN
 IF TG_OP='DELETE' OR (NEW.order_id,NEW.deposit_id,NEW.epoch,NEW.base_phase) IS DISTINCT FROM (OLD.order_id,OLD.deposit_id,OLD.epoch,OLD.base_phase)
  OR (OLD.base_hash IS NOT NULL AND (NEW.base_hash,NEW.base_payload,NEW.base_max_cost) IS DISTINCT FROM (OLD.base_hash,OLD.base_payload,OLD.base_max_cost))
  OR (OLD.base_confirmed AND (NEW.base_confirmed,NEW.base_height,NEW.base_block,NEW.base_fee,NEW.base_receipt) IS DISTINCT FROM (OLD.base_confirmed,OLD.base_height,OLD.base_block,OLD.base_fee,OLD.base_receipt))
  OR (OLD.zcash_hash IS NOT NULL AND (NEW.zcash_hash,NEW.zcash_payload,NEW.zcash_fee,NEW.expiry_height) IS DISTINCT FROM (OLD.zcash_hash,OLD.zcash_payload,OLD.zcash_fee,OLD.expiry_height))
  OR OLD.confirmed THEN RAISE EXCEPTION 'immutable source refund attempt'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_source_refund BEFORE UPDATE OR DELETE ON zee.source_refunds FOR EACH ROW EXECUTE FUNCTION zee.freeze_source_refund();

CREATE FUNCTION zee.begin_source_refund(p_order uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE o zee.orders;q zee.quotes;d zee.deposits;c zee.runtime_control;
BEGIN
 SELECT * INTO STRICT c FROM zee.runtime_control WHERE singleton FOR UPDATE;
 IF c.accepting_orders OR c.dispatch_enabled OR c.reconciliation_required THEN RAISE EXCEPTION 'refund requires paused reconciled operator state'; END IF;
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

CREATE FUNCTION zee.check_source_refund_operator(p_order uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 PERFORM 1 FROM zee.runtime_control c JOIN zee.source_refunds a ON a.epoch=c.epoch JOIN zee.orders o ON o.id=a.order_id
 WHERE c.singleton AND NOT c.accepting_orders AND NOT c.dispatch_enabled AND NOT c.reconciliation_required
 AND a.order_id=p_order AND NOT a.confirmed AND o.state='REFUND_REQUIRED' FOR SHARE OF c;
 IF NOT FOUND THEN RAISE EXCEPTION 'refund operator epoch/state fenced'; END IF;
 IF EXISTS(SELECT 1 FROM zee.escrow_commits WHERE order_id=p_order) OR EXISTS(SELECT 1 FROM zee.reverse_payouts WHERE order_id=p_order)
 THEN RAISE EXCEPTION 'committed reverse refund forbidden'; END IF;
END $$;
CREATE FUNCTION zee.store_source_refund_base(p_order uuid,p_hash zee.digest,p_payload bytea,p_max zee.atomic) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE a zee.source_refunds;q zee.quotes;
BEGIN
 PERFORM zee.check_source_refund_operator(p_order);SELECT * INTO STRICT a FROM zee.source_refunds WHERE order_id=p_order FOR UPDATE;
 IF a.base_hash IS NOT NULL THEN IF (a.base_hash,a.base_max_cost) IS DISTINCT FROM(p_hash,p_max) THEN RAISE EXCEPTION 'conflicting source refund Base transaction'; END IF;RETURN;END IF;
 SELECT * INTO STRICT q FROM zee.quotes WHERE id=p_order;
 IF p_max>10000000000000 OR p_max<=0 OR p_max>(CASE WHEN a.base_phase='CANCEL' THEN q.payout_fee ELSE q.refund_fee END)
 THEN RAISE EXCEPTION 'source refund Base fee cap exceeded'; END IF;
 UPDATE zee.source_refunds SET base_hash=p_hash,base_payload=p_payload,base_max_cost=p_max WHERE order_id=p_order;
 INSERT INTO zee.order_events(order_id,event_type) VALUES(p_order,'SOURCE_REFUND_BASE_SIGNED');
END $$;

CREATE FUNCTION zee.discharge_source_refund(p_order uuid,p_height bigint,p_block text,p_receipt bytea) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE a zee.source_refunds;q zee.quotes;d zee.deposits;r record;spent numeric;base_spent numeric;event uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO STRICT a FROM zee.source_refunds WHERE order_id=p_order FOR UPDATE;
 SELECT * INTO STRICT q FROM zee.quotes WHERE id=p_order;SELECT * INTO STRICT d FROM zee.deposits WHERE id=a.deposit_id;
 IF a.confirmed THEN RETURN;END IF;
 -- Reverse refund gas was paid by the original payer, separately recorded in
 -- base_fee. It is not an operator inventory expense or a principal deduction.
 base_spent:=CASE WHEN a.base_phase='CANCEL' THEN a.base_fee+(SELECT COALESCE(sum(actual_fee),0) FROM zee.base_attempts WHERE order_id=p_order) ELSE 0 END;
 FOR r IN SELECT * FROM zee.reservations WHERE order_id=p_order AND released_at IS NULL ORDER BY asset,purpose LOOP
  spent:=CASE WHEN a.base_phase='CANCEL' AND r.asset='TAZ' AND r.purpose='fee' THEN a.zcash_fee
   WHEN a.base_phase='CANCEL' AND r.asset='baseETH' AND r.purpose='fee' THEN base_spent ELSE 0 END;
  IF spent IS NULL OR spent>r.amount THEN RAISE EXCEPTION 'refund fee reservation insufficient';END IF;
  UPDATE zee.inventory_accounts SET reserved=reserved-r.amount,balance=balance-spent WHERE asset=r.asset AND purpose=r.purpose;
  UPDATE zee.reservations SET released_at=clock_timestamp() WHERE order_id=p_order AND asset=r.asset AND purpose=r.purpose;
  INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount,order_id) VALUES(event,r.asset,r.purpose||':reserved',-r.amount,p_order);
  IF spent>0 THEN INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount,order_id) VALUES(event,r.asset,r.purpose||':spent',spent,p_order);END IF;
  IF r.amount>spent THEN INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount,order_id) VALUES(event,r.asset,r.purpose||':available',r.amount-spent,p_order);END IF;
 END LOOP;
 INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount,order_id) VALUES
  (event,q.source_asset,'customer:held',-d.amount,p_order),(event,q.source_asset,'customer:refunded',d.amount,p_order),
  (event,q.source_asset,'customer:liability',d.amount,p_order),(event,q.source_asset,'refund:source',-d.amount,p_order);
 UPDATE zee.obligations SET state='DISCHARGED' WHERE deposit_id=d.id;
 UPDATE zee.operations SET state='CONFIRMED' WHERE deposit_id=d.id AND kind='REFUND';
 UPDATE zee.orders SET state='REFUNDED' WHERE id=p_order;
 UPDATE zee.source_refunds SET confirmed=true,height=p_height,block_hash=p_block,receipt_payload=p_receipt WHERE order_id=p_order;
 INSERT INTO zee.order_events(order_id,event_type) VALUES(p_order,'SOURCE_REFUND_FINALIZED');
END $$;

CREATE FUNCTION zee.confirm_source_refund_base(p_order uuid,p_phase text,p_hash zee.digest,p_height bigint,p_block text,p_fee zee.atomic,p_receipt bytea)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE a zee.source_refunds;
BEGIN
 PERFORM 1 FROM zee.runtime_control WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT a FROM zee.source_refunds WHERE order_id=p_order FOR UPDATE;
 IF (a.base_phase,a.base_hash) IS DISTINCT FROM(p_phase,p_hash) THEN RAISE EXCEPTION 'refund Base receipt identity mismatch';END IF;
 IF a.base_confirmed THEN IF (a.base_height,a.base_block,a.base_fee) IS DISTINCT FROM(p_height,p_block,p_fee) THEN RAISE EXCEPTION 'refund Base receipt changed';END IF;RETURN false;END IF;
 IF NOT EXISTS(SELECT 1 FROM zee.scanner_checkpoints s JOIN zee.chain_observations b ON b.network=s.network
  WHERE s.network='base-sepolia' AND s.finalized_height>=p_height AND b.height=p_height AND b.block_hash=p_block
  AND s.observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds')
 THEN RAISE EXCEPTION 'source refund Base receipt lacks canonical finality';END IF;
 IF p_fee>a.base_max_cost THEN RAISE EXCEPTION 'refund Base fee cap exceeded';END IF;
 IF EXISTS(SELECT 1 FROM zee.escrow_commits WHERE order_id=p_order) OR EXISTS(SELECT 1 FROM zee.reverse_payouts WHERE order_id=p_order)
  OR EXISTS(SELECT 1 FROM zee.base_attempts WHERE order_id=p_order AND (NOT confirmed OR phase='PAY'))
 THEN RAISE EXCEPTION 'original payout attempt unresolved or paid; reconcile before refund';END IF;
 UPDATE zee.source_refunds SET base_confirmed=true,base_height=p_height,base_block=p_block,base_fee=p_fee,base_receipt=p_receipt WHERE order_id=p_order;
 IF p_phase='REFUND' THEN PERFORM zee.discharge_source_refund(p_order,p_height,p_block,p_receipt);END IF;
 INSERT INTO zee.order_events(order_id,event_type) VALUES(p_order,'SOURCE_REFUND_'||p_phase||'_FINALIZED');RETURN true;
END $$;
CREATE FUNCTION zee.check_source_refund_signing(p_order uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 PERFORM zee.check_source_refund_operator(p_order);
 IF NOT EXISTS(SELECT 1 FROM zee.source_refunds a JOIN zee.deposits d ON d.id=a.deposit_id
 JOIN zee.scanner_checkpoints z ON z.network='zcash-testnet' JOIN zee.chain_observations zb ON zb.network=z.network AND zb.height=d.block_height AND zb.block_hash=d.block_hash
 JOIN zee.scanner_checkpoints b ON b.network='base-sepolia' JOIN zee.chain_observations bb ON bb.network=b.network AND bb.height=a.base_height AND bb.block_hash=a.base_block
 WHERE a.order_id=p_order AND a.base_phase='CANCEL' AND a.base_confirmed AND d.confirmed_at IS NOT NULL AND z.scanned_height-d.block_height+1>=10
 AND b.finalized_height>=a.base_height AND z.observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds'
 AND b.observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds')
 THEN RAISE EXCEPTION 'fresh canonical source and permanent Base cancellation required';END IF;
END $$;
CREATE FUNCTION zee.store_source_refund_zcash(p_order uuid,p_hash zee.digest,p_payload bytea,p_fee zee.atomic,p_expiry bigint) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE a zee.source_refunds;
BEGIN
 PERFORM zee.check_source_refund_signing(p_order);SELECT * INTO STRICT a FROM zee.source_refunds WHERE order_id=p_order FOR UPDATE;
 IF a.zcash_hash IS NOT NULL THEN IF (a.zcash_hash,a.zcash_fee,a.expiry_height) IS DISTINCT FROM(p_hash,p_fee,p_expiry) THEN RAISE EXCEPTION 'conflicting signed source refund';END IF;RETURN;END IF;
 IF p_fee<=0 OR p_fee>(SELECT refund_fee FROM zee.quotes WHERE id=p_order) OR p_expiry<(SELECT scanned_height+20 FROM zee.scanner_checkpoints WHERE network='zcash-testnet') THEN RAISE EXCEPTION 'refund fee or expiry unsafe';END IF;
 UPDATE zee.source_refunds SET zcash_hash=p_hash,zcash_payload=p_payload,zcash_fee=p_fee,expiry_height=p_expiry WHERE order_id=p_order;
 UPDATE zee.operations SET state='SIGNED' WHERE order_id=p_order AND kind='REFUND';
END $$;
CREATE FUNCTION zee.confirm_source_refund_zcash(p_order uuid,p_hash zee.digest,p_height bigint,p_block text,p_fee zee.atomic,p_receipt bytea) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE a zee.source_refunds;
BEGIN
 PERFORM 1 FROM zee.runtime_control WHERE singleton FOR UPDATE;SELECT * INTO STRICT a FROM zee.source_refunds WHERE order_id=p_order FOR UPDATE;
 IF (a.zcash_hash,a.zcash_fee) IS DISTINCT FROM(p_hash,p_fee) OR p_height>a.expiry_height OR a.zcash_hash IS NULL THEN RAISE EXCEPTION 'refund Zcash identity/fee/expiry mismatch';END IF;
 IF a.confirmed THEN IF (a.height,a.block_hash) IS DISTINCT FROM(p_height,p_block) THEN RAISE EXCEPTION 'refund Zcash receipt changed';END IF;RETURN false;END IF;
 IF NOT EXISTS(SELECT 1 FROM zee.scanner_checkpoints s JOIN zee.chain_observations b ON b.network=s.network WHERE s.network='zcash-testnet'
  AND b.height=p_height AND b.block_hash=p_block AND s.scanned_height-p_height+1>=10
  AND s.observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds') THEN RAISE EXCEPTION 'source refund Zcash finality missing';END IF;
 IF NOT a.base_confirmed OR a.base_phase<>'CANCEL' THEN RAISE EXCEPTION 'permanent cancellation missing';END IF;
 PERFORM zee.discharge_source_refund(p_order,p_height,p_block,p_receipt);RETURN true;
END $$;
REVOKE ALL ON zee.source_refunds FROM PUBLIC;
GRANT SELECT ON zee.source_refunds TO zeeswap_worker,zeeswap_reader;
REVOKE EXECUTE ON FUNCTION zee.freeze_source_refund(),zee.begin_source_refund(uuid),zee.check_source_refund_operator(uuid),
 zee.store_source_refund_base(uuid,zee.digest,bytea,zee.atomic),zee.discharge_source_refund(uuid,bigint,text,bytea),
 zee.confirm_source_refund_base(uuid,text,zee.digest,bigint,text,zee.atomic,bytea),zee.check_source_refund_signing(uuid),
 zee.store_source_refund_zcash(uuid,zee.digest,bytea,zee.atomic,bigint),zee.confirm_source_refund_zcash(uuid,zee.digest,bigint,text,zee.atomic,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.begin_source_refund(uuid),zee.check_source_refund_operator(uuid),zee.store_source_refund_base(uuid,zee.digest,bytea,zee.atomic),
 zee.confirm_source_refund_base(uuid,text,zee.digest,bigint,text,zee.atomic,bytea),zee.check_source_refund_signing(uuid),
 zee.store_source_refund_zcash(uuid,zee.digest,bytea,zee.atomic,bigint),zee.confirm_source_refund_zcash(uuid,zee.digest,bigint,text,zee.atomic,bytea) TO zeeswap_worker;
