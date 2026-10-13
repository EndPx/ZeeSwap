-- Existing demonstration quotes remain observation-only and cannot dispatch.
ALTER TABLE zee.quotes ADD COLUMN execution_mode text NOT NULL DEFAULT 'observe-only'
 CHECK(execution_mode IN ('observe-only','base-settlement-v1'));
ALTER TABLE zee.quotes ADD COLUMN base_contract text;
ALTER TABLE zee.quotes ADD CONSTRAINT quote_execution_binding CHECK(
 (execution_mode='observe-only' AND base_contract IS NULL) OR
 (execution_mode='base-settlement-v1' AND direction='ZCASH_TO_BASE' AND base_contract ~ '^0x[0-9a-fA-F]{40}$'));

CREATE TABLE zee.base_bindings (
 order_id uuid PRIMARY KEY REFERENCES zee.orders(id),
 terms_payload bytea NOT NULL CHECK(octet_length(terms_payload)>28),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_base_binding BEFORE UPDATE OR DELETE ON zee.base_bindings FOR EACH ROW EXECUTE FUNCTION zee.immutable();
CREATE TABLE zee.base_attempts (
 order_id uuid NOT NULL REFERENCES zee.base_bindings(order_id),
 phase text NOT NULL CHECK(phase IN ('RESERVE','PAY')),
 tx_hash zee.digest NOT NULL UNIQUE, signed_payload bytea NOT NULL CHECK(octet_length(signed_payload)>28),
 max_cost zee.atomic NOT NULL CHECK(max_cost>0),
 confirmed boolean NOT NULL DEFAULT false, block_height bigint, block_hash text,
 actual_fee zee.atomic, receipt_payload bytea,
 PRIMARY KEY(order_id,phase),
 CHECK(NOT confirmed OR (block_height IS NOT NULL AND block_hash ~ '^[0-9a-f]{64}$' AND actual_fee IS NOT NULL AND octet_length(receipt_payload)>28))
);
CREATE FUNCTION zee.freeze_base_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (NEW.order_id,NEW.phase,NEW.tx_hash,NEW.signed_payload,NEW.max_cost)
 IS DISTINCT FROM (OLD.order_id,OLD.phase,OLD.tx_hash,OLD.signed_payload,OLD.max_cost)
 OR OLD.confirmed THEN RAISE EXCEPTION 'immutable signed attempt'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_signed_base BEFORE UPDATE OR DELETE ON zee.base_attempts FOR EACH ROW EXECUTE FUNCTION zee.freeze_base_attempt();
REVOKE ALL ON zee.base_bindings,zee.base_attempts FROM PUBLIC;
GRANT SELECT ON zee.base_bindings,zee.base_attempts TO zeeswap_worker,zeeswap_reader;

CREATE FUNCTION zee.check_base_dispatch(p_order uuid,p_job uuid,p_owner uuid,p_fence bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 PERFORM 1 FROM zee.runtime_control WHERE singleton AND dispatch_enabled AND NOT reconciliation_required FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'dispatch paused'; END IF;
 IF NOT EXISTS(SELECT 1 FROM zee.outbox_jobs j JOIN zee.operations op ON op.id=j.operation_id
  JOIN zee.orders o ON o.id=op.order_id JOIN zee.quotes q ON q.id=o.id
  JOIN zee.deposits d ON d.id=op.deposit_id JOIN zee.scanner_checkpoints s ON s.network=d.network
  JOIN zee.chain_observations b ON b.network=d.network AND b.height=d.block_height AND b.block_hash=d.block_hash
  WHERE j.id=p_job AND j.lease_owner=p_owner AND j.fence=p_fence AND j.status='LEASED' AND j.lease_until>clock_timestamp()
  AND o.id=p_order AND o.state='READY' AND op.kind='PAYOUT' AND d.classification='EXACT' AND d.confirmed_at IS NOT NULL
  AND d.network='zcash-testnet' AND s.scanned_height-d.block_height+1>=10
  AND q.execution_mode='base-settlement-v1' AND q.direction='ZCASH_TO_BASE')
 THEN RAISE EXCEPTION 'ineligible order or stale lease'; END IF;
 IF (SELECT count(*) FROM zee.scanner_checkpoints WHERE observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds')<>2
 THEN RAISE EXCEPTION 'observers stale'; END IF;
END $$;

CREATE FUNCTION zee.claim_base_job(p_owner uuid) RETURNS SETOF zee.outbox_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 PERFORM 1 FROM zee.runtime_control WHERE singleton AND dispatch_enabled AND NOT reconciliation_required FOR SHARE;
 IF NOT FOUND THEN RETURN; END IF;
 IF (SELECT count(*) FROM zee.scanner_checkpoints WHERE observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds')<>2 THEN RETURN; END IF;
 RETURN QUERY UPDATE zee.outbox_jobs SET status='LEASED',lease_owner=p_owner,lease_until=clock_timestamp()+interval '30 seconds',fence=fence+1
 WHERE id=(SELECT j.id FROM zee.outbox_jobs j JOIN zee.operations op ON op.id=j.operation_id
  JOIN zee.quotes q ON q.id=op.order_id JOIN zee.orders o ON o.id=q.id
  WHERE (j.status='QUEUED' OR (j.status='LEASED' AND j.lease_until<=clock_timestamp()))
   AND q.execution_mode='base-settlement-v1' AND op.kind='PAYOUT' AND o.state='READY'
  ORDER BY j.created_at,j.id LIMIT 1 FOR UPDATE OF j SKIP LOCKED) RETURNING *;
END $$;

CREATE FUNCTION zee.pin_base_terms(p_order uuid,p_job uuid,p_owner uuid,p_fence bigint,p_payload bytea)
RETURNS bytea LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE result bytea;
BEGIN
 PERFORM zee.check_base_dispatch(p_order,p_job,p_owner,p_fence);
 INSERT INTO zee.base_bindings(order_id,terms_payload) VALUES(p_order,p_payload) ON CONFLICT DO NOTHING;
 SELECT terms_payload INTO STRICT result FROM zee.base_bindings WHERE order_id=p_order;
 RETURN result;
END $$;

CREATE FUNCTION zee.store_base_attempt(p_order uuid,p_job uuid,p_owner uuid,p_fence bigint,p_phase text,p_hash zee.digest,p_payload bytea,p_max zee.atomic)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE existing zee.base_attempts; q zee.quotes;
BEGIN
 PERFORM zee.check_base_dispatch(p_order,p_job,p_owner,p_fence);
 PERFORM 1 FROM zee.base_bindings WHERE order_id=p_order FOR UPDATE;
 SELECT * INTO existing FROM zee.base_attempts WHERE order_id=p_order AND phase=p_phase;
 IF FOUND THEN
  IF existing.tx_hash<>p_hash OR existing.max_cost<>p_max THEN RAISE EXCEPTION 'conflicting signed attempt'; END IF;
  RETURN;
 END IF;
 IF p_phase='PAY' AND NOT EXISTS(SELECT 1 FROM zee.base_attempts WHERE order_id=p_order AND phase='RESERVE' AND confirmed)
 THEN RAISE EXCEPTION 'reservation is not finalized'; END IF;
 SELECT * INTO STRICT q FROM zee.quotes WHERE id=p_order;
 IF p_max+(SELECT COALESCE(sum(COALESCE(actual_fee,max_cost)),0) FROM zee.base_attempts WHERE order_id=p_order)>q.payout_fee
 THEN RAISE EXCEPTION 'insufficient reserved gas'; END IF;
 INSERT INTO zee.base_attempts(order_id,phase,tx_hash,signed_payload,max_cost) VALUES(p_order,p_phase,p_hash,p_payload,p_max);
 UPDATE zee.operations SET state='SIGNED' WHERE order_id=p_order AND kind='PAYOUT';
 INSERT INTO zee.order_events(order_id,event_type) VALUES(p_order,'BASE_'||p_phase||'_SIGNED');
END $$;

ALTER TABLE zee.operations DROP CONSTRAINT operations_chain_authorization_verified_check;
CREATE FUNCTION zee.guard_chain_authorization() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,zee AS $$
BEGIN
 IF NEW.chain_authorization_verified AND NOT EXISTS(SELECT 1 FROM zee.base_attempts WHERE order_id=NEW.order_id AND phase='RESERVE' AND confirmed)
 THEN RAISE EXCEPTION 'check constraint chain_authorization_proof' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER chain_authorization_proof BEFORE INSERT OR UPDATE ON zee.operations FOR EACH ROW EXECUTE FUNCTION zee.guard_chain_authorization();

-- Only the trusted receipt observer calls this, after matching calldata/event/identity.
-- SQL also requires a fresh finalized canonical Base checkpoint.
CREATE FUNCTION zee.confirm_base_attempt(p_order uuid,p_phase text,p_hash zee.digest,p_height bigint,p_block text,p_fee zee.atomic,p_receipt bytea)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE a zee.base_attempts; q zee.quotes; o zee.orders; d zee.deposits; r record; spent numeric; fees numeric; event uuid:=gen_random_uuid();
BEGIN
 PERFORM 1 FROM zee.runtime_control WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT a FROM zee.base_attempts WHERE order_id=p_order AND phase=p_phase FOR UPDATE;
 IF a.tx_hash<>p_hash THEN RAISE EXCEPTION 'receipt identity mismatch'; END IF;
 IF a.confirmed THEN
  IF (a.block_height,a.block_hash,a.actual_fee) IS DISTINCT FROM (p_height,p_block,p_fee) THEN RAISE EXCEPTION 'receipt changed; reconciliation required'; END IF;
  RETURN false;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM zee.scanner_checkpoints s JOIN zee.chain_observations b ON b.network=s.network
  WHERE s.network='base-sepolia' AND s.finalized_height>=p_height AND b.height=p_height AND b.block_hash=p_block
   AND s.observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds')
 THEN RAISE EXCEPTION 'receipt is not finalized canonical'; END IF;
 IF p_fee>a.max_cost THEN RAISE EXCEPTION 'fee cap exceeded; reconcile'; END IF;
 SELECT * INTO STRICT o FROM zee.orders WHERE id=p_order FOR UPDATE;
 SELECT * INTO STRICT q FROM zee.quotes WHERE id=p_order;
 UPDATE zee.base_attempts SET confirmed=true,block_height=p_height,block_hash=p_block,actual_fee=p_fee,receipt_payload=p_receipt
 WHERE order_id=p_order AND phase=p_phase;
 IF p_phase='RESERVE' THEN
  UPDATE zee.operations SET chain_authorization_verified=true WHERE order_id=p_order AND kind='PAYOUT';
 ELSE
  IF NOT EXISTS(SELECT 1 FROM zee.base_attempts WHERE order_id=p_order AND phase='RESERVE' AND confirmed) THEN RAISE EXCEPTION 'reservation missing'; END IF;
  SELECT * INTO STRICT d FROM zee.deposits WHERE id=o.primary_deposit;
  SELECT sum(actual_fee) INTO fees FROM zee.base_attempts WHERE order_id=p_order;
  FOR r IN SELECT * FROM zee.reservations WHERE order_id=p_order AND released_at IS NULL ORDER BY asset,purpose LOOP
   spent:=CASE WHEN r.asset='mockUSDC' AND r.purpose='principal' THEN q.output_amount WHEN r.asset='baseETH' AND r.purpose='fee' THEN fees ELSE 0 END;
   IF spent>r.amount THEN RAISE EXCEPTION 'reservation insufficient'; END IF;
   UPDATE zee.inventory_accounts SET reserved=reserved-r.amount,balance=balance-spent WHERE asset=r.asset AND purpose=r.purpose;
   UPDATE zee.reservations SET released_at=clock_timestamp() WHERE order_id=p_order AND asset=r.asset AND purpose=r.purpose;
   INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount,order_id) VALUES(event,r.asset,r.purpose||':reserved',-r.amount,p_order);
   IF spent>0 THEN INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount,order_id) VALUES(event,r.asset,r.purpose||':spent',spent,p_order); END IF;
   IF r.amount>spent THEN INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount,order_id) VALUES(event,r.asset,r.purpose||':available',r.amount-spent,p_order); END IF;
  END LOOP;
  -- Discharge the customer liability. Proceeds remain a separate, non-spendable
  -- reconciliation bucket until operator-capital reconciliation credits inventory.
  INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount,order_id) VALUES
   (event,'TAZ','customer:held',-d.amount,p_order),(event,'TAZ','operator:unreconciled',d.amount,p_order),
   (event,'TAZ','customer:liability',d.amount,p_order),(event,'TAZ','conversion:source',-d.amount,p_order);
  UPDATE zee.obligations SET state='DISCHARGED' WHERE deposit_id=d.id;
  UPDATE zee.operations SET state='CONFIRMED' WHERE order_id=p_order AND kind='PAYOUT';
  UPDATE zee.outbox_jobs SET status='DONE' WHERE operation_id IN (SELECT id FROM zee.operations WHERE order_id=p_order AND kind='PAYOUT');
  UPDATE zee.orders SET state=CASE WHEN state IN ('REORGED','REVIEW_REQUIRED') THEN 'REVIEW_REQUIRED' ELSE 'SETTLED' END WHERE id=p_order;
 END IF;
 INSERT INTO zee.order_events(order_id,event_type) VALUES(p_order,'BASE_'||p_phase||'_FINALIZED');
 RETURN true;
END $$;

CREATE VIEW zee.base_order_status AS SELECT order_id,phase,confirmed,block_height,receipt_payload FROM zee.base_attempts;
GRANT SELECT ON zee.base_order_status TO zeeswap_api,zeeswap_reader;
REVOKE EXECUTE ON FUNCTION zee.check_base_dispatch(uuid,uuid,uuid,bigint),zee.claim_base_job(uuid),
 zee.pin_base_terms(uuid,uuid,uuid,bigint,bytea),zee.store_base_attempt(uuid,uuid,uuid,bigint,text,zee.digest,bytea,zee.atomic),
 zee.confirm_base_attempt(uuid,text,zee.digest,bigint,text,zee.atomic,bytea),zee.freeze_base_attempt(),zee.guard_chain_authorization() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.check_base_dispatch(uuid,uuid,uuid,bigint),zee.claim_base_job(uuid),
 zee.pin_base_terms(uuid,uuid,uuid,bigint,bytea),zee.store_base_attempt(uuid,uuid,uuid,bigint,text,zee.digest,bytea,zee.atomic),
 zee.confirm_base_attempt(uuid,text,zee.digest,bigint,text,zee.atomic,bytea) TO zeeswap_worker;
