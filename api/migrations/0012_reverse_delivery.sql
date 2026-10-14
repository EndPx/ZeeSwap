-- Durable private reverse payout and finalized Base acknowledgement.
-- HTTP remains disabled; these functions are restricted observer/signer boundaries.
CREATE TABLE zee.reverse_payouts (
 order_id uuid PRIMARY KEY REFERENCES zee.escrow_commits(order_id),
 tx_hash zee.digest NOT NULL UNIQUE, signed_payload bytea NOT NULL CHECK(octet_length(signed_payload)>28),
 fee zee.atomic NOT NULL CHECK(fee>0), expiry_height bigint NOT NULL CHECK(expiry_height>0),
 phase text NOT NULL DEFAULT 'ZCASH' CHECK(phase='ZCASH'), max_cost zee.atomic NOT NULL CHECK(max_cost>0),
 confirmed boolean NOT NULL DEFAULT false,block_height bigint,block_hash text,actual_fee zee.atomic,receipt_payload bytea,
 CHECK(NOT confirmed OR (block_height>0 AND block_hash ~ '^[0-9a-f]{64}$' AND actual_fee=fee AND octet_length(receipt_payload)>28))
);
CREATE FUNCTION zee.freeze_reverse_payout() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,zee AS $$
BEGIN
 IF TG_OP='DELETE' OR (NEW.order_id,NEW.phase,NEW.tx_hash,NEW.signed_payload,NEW.max_cost,NEW.fee,NEW.expiry_height)
 IS DISTINCT FROM (OLD.order_id,OLD.phase,OLD.tx_hash,OLD.signed_payload,OLD.max_cost,OLD.fee,OLD.expiry_height)
 OR OLD.confirmed THEN RAISE EXCEPTION 'immutable signed reverse payout'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_reverse_payout BEFORE UPDATE OR DELETE ON zee.reverse_payouts FOR EACH ROW EXECUTE FUNCTION zee.freeze_reverse_payout();
CREATE TABLE zee.escrow_settlements (
 order_id uuid PRIMARY KEY REFERENCES zee.reverse_payouts(order_id),
 tx_hash zee.digest NOT NULL UNIQUE,signed_payload bytea NOT NULL CHECK(octet_length(signed_payload)>28),
 phase text NOT NULL DEFAULT 'SETTLE' CHECK(phase='SETTLE'),max_cost zee.atomic NOT NULL CHECK(max_cost>0),
 confirmed boolean NOT NULL DEFAULT false,block_height bigint,block_hash text,actual_fee zee.atomic,receipt_payload bytea,
 CHECK(NOT confirmed OR (block_height>0 AND block_hash ~ '^[0-9a-f]{64}$' AND actual_fee IS NOT NULL AND octet_length(receipt_payload)>28))
);
CREATE TRIGGER immutable_escrow_settlement BEFORE UPDATE OR DELETE ON zee.escrow_settlements FOR EACH ROW EXECUTE FUNCTION zee.freeze_base_attempt();
REVOKE ALL ON zee.reverse_payouts,zee.escrow_settlements FROM PUBLIC;
GRANT SELECT ON zee.reverse_payouts,zee.escrow_settlements TO zeeswap_worker,zeeswap_reader;

CREATE FUNCTION zee.store_reverse_payout(p_order uuid,p_job uuid,p_owner uuid,p_fence bigint,p_hash zee.digest,p_payload bytea,p_fee zee.atomic,p_expiry bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE a zee.reverse_payouts;
BEGIN
 PERFORM zee.check_reverse_signing(p_order,p_job,p_owner,p_fence);
 PERFORM 1 FROM zee.orders WHERE id=p_order FOR UPDATE;
 SELECT * INTO a FROM zee.reverse_payouts WHERE order_id=p_order;
 IF FOUND THEN
  IF (a.tx_hash,a.fee,a.expiry_height) IS DISTINCT FROM (p_hash,p_fee,p_expiry) THEN RAISE EXCEPTION 'conflicting signed Zcash payout'; END IF;
  RETURN;
 END IF;
 IF p_fee>(SELECT payout_fee FROM zee.quotes WHERE id=p_order) THEN RAISE EXCEPTION 'Zcash fee reserve exceeded'; END IF;
 IF p_expiry<=(SELECT scanned_height FROM zee.scanner_checkpoints WHERE network='zcash-testnet') THEN RAISE EXCEPTION 'signed transaction expired'; END IF;
 INSERT INTO zee.reverse_payouts(order_id,tx_hash,signed_payload,fee,max_cost,expiry_height) VALUES(p_order,p_hash,p_payload,p_fee,p_fee,p_expiry);
 UPDATE zee.operations SET state='SIGNED' WHERE order_id=p_order AND kind='PAYOUT';
 INSERT INTO zee.order_events(order_id,event_type) VALUES(p_order,'ZCASH_PAYOUT_SIGNED');
END $$;

CREATE FUNCTION zee.confirm_reverse_payout(p_order uuid,p_hash zee.digest,p_height bigint,p_block text,p_fee zee.atomic,p_receipt bytea)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE a zee.reverse_payouts;
BEGIN
 PERFORM 1 FROM zee.runtime_control WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT a FROM zee.reverse_payouts WHERE order_id=p_order FOR UPDATE;
 IF a.tx_hash<>p_hash OR a.fee<>p_fee OR p_height>a.expiry_height THEN RAISE EXCEPTION 'Zcash receipt identity/fee/expiry mismatch'; END IF;
 IF a.confirmed THEN
  IF (a.block_height,a.block_hash,a.actual_fee) IS DISTINCT FROM (p_height,p_block,p_fee) THEN RAISE EXCEPTION 'Zcash receipt changed; reconciliation required'; END IF;
  RETURN false;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM zee.scanner_checkpoints s JOIN zee.chain_observations b ON b.network=s.network
 WHERE s.network='zcash-testnet' AND b.height=p_height AND b.block_hash=p_block AND s.scanned_height-p_height+1>=10
 AND s.observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds')
 THEN RAISE EXCEPTION 'Zcash receipt lacks fresh canonical finality'; END IF;
 UPDATE zee.reverse_payouts SET confirmed=true,block_height=p_height,block_hash=p_block,actual_fee=p_fee,receipt_payload=p_receipt WHERE order_id=p_order;
 INSERT INTO zee.order_events(order_id,event_type) VALUES(p_order,'ZCASH_PAYOUT_FINALIZED');
 -- Escrow liability, principal and fee reservations remain held until Base SETTLE.
 RETURN true;
END $$;

CREATE FUNCTION zee.check_reverse_delivery(p_order uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM zee.reverse_payouts a JOIN zee.chain_observations b ON b.network='zcash-testnet'
 AND b.height=a.block_height AND b.block_hash=a.block_hash JOIN zee.scanner_checkpoints s ON s.network=b.network
 WHERE a.order_id=p_order AND a.confirmed AND s.scanned_height-a.block_height+1>=10
 AND s.observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds')
 THEN RAISE EXCEPTION 'confirmed canonical Zcash delivery missing'; END IF;
END $$;

CREATE FUNCTION zee.store_escrow_settlement(p_order uuid,p_job uuid,p_owner uuid,p_fence bigint,p_hash zee.digest,p_payload bytea,p_max zee.atomic)
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
 IF p_max+(SELECT actual_fee FROM zee.escrow_commits WHERE order_id=p_order)>(SELECT refund_fee FROM zee.quotes WHERE id=p_order)
 THEN RAISE EXCEPTION 'total Base gas reserve exceeded'; END IF;
 INSERT INTO zee.escrow_settlements(order_id,tx_hash,signed_payload,max_cost) VALUES(p_order,p_hash,p_payload,p_max);
 INSERT INTO zee.order_events(order_id,event_type) VALUES(p_order,'BASE_SETTLE_SIGNED');
END $$;

CREATE FUNCTION zee.confirm_escrow_settlement(p_order uuid,p_hash zee.digest,p_height bigint,p_block text,p_fee zee.atomic,p_receipt bytea)
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
REVOKE EXECUTE ON FUNCTION zee.store_reverse_payout(uuid,uuid,uuid,bigint,zee.digest,bytea,zee.atomic,bigint),
 zee.confirm_reverse_payout(uuid,zee.digest,bigint,text,zee.atomic,bytea),zee.check_reverse_delivery(uuid),
 zee.store_escrow_settlement(uuid,uuid,uuid,bigint,zee.digest,bytea,zee.atomic),
 zee.confirm_escrow_settlement(uuid,zee.digest,bigint,text,zee.atomic,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.store_reverse_payout(uuid,uuid,uuid,bigint,zee.digest,bytea,zee.atomic,bigint),
 zee.confirm_reverse_payout(uuid,zee.digest,bigint,text,zee.atomic,bytea),zee.check_reverse_delivery(uuid),
 zee.store_escrow_settlement(uuid,uuid,uuid,bigint,zee.digest,bytea,zee.atomic),
 zee.confirm_escrow_settlement(uuid,zee.digest,bigint,text,zee.atomic,bytea) TO zeeswap_worker;
