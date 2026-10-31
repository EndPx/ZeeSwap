-- L2 inclusion is dispatch evidence only. Existing final confirmation/accounting is unchanged.
CREATE TABLE zee.base_inclusions (
 order_id uuid NOT NULL, phase text NOT NULL, tx_hash zee.digest NOT NULL,
 block_height bigint NOT NULL CHECK(block_height>=0), block_hash text NOT NULL CHECK(block_hash ~ '^[0-9a-f]{64}$'),
 fee zee.atomic NOT NULL, receipt_payload bytea NOT NULL CHECK(octet_length(receipt_payload)>28),
 observed_at timestamptz NOT NULL, valid boolean NOT NULL DEFAULT true,
 PRIMARY KEY(order_id,phase), FOREIGN KEY(order_id,phase) REFERENCES zee.base_attempts(order_id,phase)
);
REVOKE ALL ON zee.base_inclusions FROM PUBLIC;
GRANT SELECT ON zee.base_inclusions TO zeeswap_worker,zeeswap_reader;
CREATE FUNCTION zee.base_reserve_dispatch_ready(p_order uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
 SELECT EXISTS(SELECT 1 FROM zee.base_attempts a LEFT JOIN zee.base_inclusions i USING(order_id,phase)
 WHERE a.order_id=p_order AND a.phase='RESERVE' AND (a.confirmed OR
 (i.valid AND i.tx_hash=a.tx_hash AND i.observed_at BETWEEN clock_timestamp()-interval '15 seconds' AND clock_timestamp()+interval '5 seconds')))
$$;
-- Trusted observer validates exact signed transaction, event, state and canonical block immediately before publication.
CREATE FUNCTION zee.observe_base_inclusion(p_order uuid,p_phase text,p_hash zee.digest,p_height bigint,p_block text,p_fee zee.atomic,p_receipt bytea)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE a zee.base_attempts; previous zee.base_inclusions;
BEGIN
 PERFORM 1 FROM zee.runtime_control WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT a FROM zee.base_attempts WHERE order_id=p_order AND phase=p_phase FOR UPDATE;
 IF a.tx_hash<>p_hash OR p_fee>a.max_cost THEN RAISE EXCEPTION 'included receipt identity or fee mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM zee.chain_observations WHERE network='base-sepolia' AND height=p_height AND block_hash=p_block) THEN RAISE EXCEPTION 'included receipt is not canonical'; END IF;
 IF NOT EXISTS(SELECT 1 FROM zee.quotes WHERE id=p_order AND direction='ZCASH_TO_BASE' AND execution_mode='base-settlement-v1') THEN RAISE EXCEPTION 'included receipt order mismatch'; END IF;
 SELECT * INTO previous FROM zee.base_inclusions WHERE order_id=p_order AND phase=p_phase;
 IF FOUND AND (NOT previous.valid OR (previous.tx_hash,previous.block_height,previous.block_hash,previous.fee) IS DISTINCT FROM (p_hash,p_height,p_block,p_fee)) THEN
  RAISE EXCEPTION 'included receipt changed; reconciliation required';
 END IF;
 INSERT INTO zee.base_inclusions VALUES(p_order,p_phase,p_hash,p_height,p_block,p_fee,p_receipt,clock_timestamp(),true)
 ON CONFLICT(order_id,phase) DO UPDATE SET observed_at=EXCLUDED.observed_at;
END $$;
CREATE FUNCTION zee.invalidate_base_inclusion(p_order uuid,p_phase text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 UPDATE zee.base_inclusions SET valid=false WHERE order_id=p_order AND phase=p_phase;
 IF FOUND THEN PERFORM zee.enter_reconciliation(); END IF;
END $$;
CREATE OR REPLACE FUNCTION zee.store_base_attempt(p_order uuid,p_job uuid,p_owner uuid,p_fence bigint,p_phase text,p_hash zee.digest,p_payload bytea,p_max zee.atomic)
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
 IF p_phase='PAY' AND NOT zee.base_reserve_dispatch_ready(p_order)
 THEN RAISE EXCEPTION 'reservation has no fresh canonical inclusion'; END IF;
 SELECT * INTO STRICT q FROM zee.quotes WHERE id=p_order;
 IF p_max+(SELECT COALESCE(sum(COALESCE(actual_fee,max_cost)),0) FROM zee.base_attempts WHERE order_id=p_order)>q.payout_fee
 THEN RAISE EXCEPTION 'insufficient reserved gas'; END IF;
 INSERT INTO zee.base_attempts(order_id,phase,tx_hash,signed_payload,max_cost) VALUES(p_order,p_phase,p_hash,p_payload,p_max);
 UPDATE zee.operations SET state='SIGNED' WHERE order_id=p_order AND kind='PAYOUT';
 INSERT INTO zee.order_events(order_id,event_type) VALUES(p_order,'BASE_'||p_phase||'_SIGNED');
END $$;

-- Recheck the fresh inclusion again at the actual broadcast fence for a persisted PAY.
CREATE OR REPLACE FUNCTION zee.check_base_dispatch(p_order uuid,p_job uuid,p_owner uuid,p_fence bigint)
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
 IF EXISTS(SELECT 1 FROM zee.base_attempts WHERE order_id=p_order AND phase='PAY') AND NOT zee.base_reserve_dispatch_ready(p_order) THEN RAISE EXCEPTION 'reservation has no fresh canonical inclusion'; END IF;
END $$;

REVOKE ALL ON FUNCTION zee.base_reserve_dispatch_ready(uuid),zee.observe_base_inclusion(uuid,text,zee.digest,bigint,text,zee.atomic,bytea),zee.invalidate_base_inclusion(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.base_reserve_dispatch_ready(uuid),zee.observe_base_inclusion(uuid,text,zee.digest,bigint,text,zee.atomic,bytea),zee.invalidate_base_inclusion(uuid,text) TO zeeswap_worker;

CREATE VIEW zee.base_inclusion_status AS SELECT order_id,phase,block_height,receipt_payload,valid FROM zee.base_inclusions;
GRANT SELECT ON zee.base_inclusion_status TO zeeswap_api,zeeswap_reader;
