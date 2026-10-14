-- Reverse dependency only. HTTP and Zcash signing remain closed.
ALTER TABLE zee.quotes DROP CONSTRAINT quotes_execution_mode_check;
ALTER TABLE zee.quotes ADD CONSTRAINT quotes_execution_mode_check CHECK(execution_mode IN ('observe-only','base-settlement-v1','base-escrow-v1'));
ALTER TABLE zee.quotes DROP CONSTRAINT quote_execution_binding;
ALTER TABLE zee.quotes ADD CONSTRAINT quote_execution_binding CHECK(
 (execution_mode='observe-only' AND base_contract IS NULL) OR
 (execution_mode='base-settlement-v1' AND direction='ZCASH_TO_BASE' AND base_contract ~ '^0x[0-9a-fA-F]{40}$') OR
 (execution_mode='base-escrow-v1' AND direction='BASE_TO_ZCASH' AND base_contract ~ '^0x[0-9a-fA-F]{40}$'));
CREATE TABLE zee.escrow_bindings (
 order_id uuid PRIMARY KEY REFERENCES zee.orders(id), terms_payload bytea NOT NULL CHECK(octet_length(terms_payload)>28)
);
CREATE TRIGGER immutable_escrow_binding BEFORE UPDATE OR DELETE ON zee.escrow_bindings FOR EACH ROW EXECUTE FUNCTION zee.immutable();
CREATE TABLE zee.escrow_commits (
 order_id uuid PRIMARY KEY REFERENCES zee.escrow_bindings(order_id),
 tx_hash zee.digest NOT NULL UNIQUE,signed_payload bytea NOT NULL CHECK(octet_length(signed_payload)>28),
 max_cost zee.atomic NOT NULL CHECK(max_cost>0),confirmed boolean NOT NULL DEFAULT false,
 block_height bigint,block_hash text,actual_fee zee.atomic,receipt_payload bytea,
 CHECK(NOT confirmed OR (block_height IS NOT NULL AND block_hash ~ '^[0-9a-f]{64}$' AND actual_fee IS NOT NULL AND octet_length(receipt_payload)>28))
);
CREATE TRIGGER immutable_escrow_commit BEFORE UPDATE OR DELETE ON zee.escrow_commits FOR EACH ROW EXECUTE FUNCTION zee.freeze_base_attempt();
-- The shared attempt guard expects a phase column; reverse has one immutable COMMIT phase.
ALTER TABLE zee.escrow_commits ADD COLUMN phase text NOT NULL DEFAULT 'COMMIT' CHECK(phase='COMMIT');
REVOKE ALL ON zee.escrow_bindings,zee.escrow_commits FROM PUBLIC;
GRANT SELECT ON zee.escrow_bindings,zee.escrow_commits TO zeeswap_worker,zeeswap_reader;

CREATE FUNCTION zee.pin_escrow_terms(p_order uuid,p_payload bytea) RETURNS bytea
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE result bytea;
BEGIN
 PERFORM 1 FROM zee.runtime_control WHERE singleton AND accepting_orders AND NOT reconciliation_required FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'acceptance paused'; END IF;
 IF NOT EXISTS(SELECT 1 FROM zee.orders o JOIN zee.quotes q USING(id) WHERE o.id=p_order
  AND q.execution_mode='base-escrow-v1' AND o.state='AWAITING_FUNDS' AND clock_timestamp()<o.funding_cutoff_time)
 THEN RAISE EXCEPTION 'escrow authorization unavailable'; END IF;
 INSERT INTO zee.escrow_bindings VALUES(p_order,p_payload) ON CONFLICT DO NOTHING;
 SELECT terms_payload INTO STRICT result FROM zee.escrow_bindings WHERE order_id=p_order;
 RETURN result;
END $$;

CREATE FUNCTION zee.check_escrow_dispatch(p_order uuid,p_job uuid,p_owner uuid,p_fence bigint) RETURNS void
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
 AND d.network='base-sepolia' AND d.classification='EXACT' AND d.confirmed_at IS NOT NULL AND s.finalized_height>=d.block_height)
 THEN RAISE EXCEPTION 'stale lease or invalid source'; END IF;
END $$;
CREATE FUNCTION zee.claim_escrow_job(p_owner uuid) RETURNS SETOF zee.outbox_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 PERFORM 1 FROM zee.runtime_control WHERE singleton AND dispatch_enabled AND NOT reconciliation_required FOR SHARE;
 IF NOT FOUND THEN RETURN; END IF;
 IF (SELECT count(*) FROM zee.scanner_checkpoints WHERE observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds')<>2 THEN RETURN; END IF;
 RETURN QUERY UPDATE zee.outbox_jobs SET status='LEASED',lease_owner=p_owner,lease_until=clock_timestamp()+interval '30 seconds',fence=fence+1
 WHERE id=(SELECT j.id FROM zee.outbox_jobs j JOIN zee.operations op ON op.id=j.operation_id JOIN zee.quotes q ON q.id=op.order_id
 JOIN zee.orders o ON o.id=q.id WHERE (j.status='QUEUED' OR (j.status='LEASED' AND j.lease_until<=clock_timestamp()))
 AND q.execution_mode='base-escrow-v1' AND op.kind='PAYOUT' AND o.state='READY'
 ORDER BY j.created_at,j.id LIMIT 1 FOR UPDATE OF j SKIP LOCKED) RETURNING *;
END $$;
CREATE FUNCTION zee.store_escrow_commit(p_order uuid,p_job uuid,p_owner uuid,p_fence bigint,p_hash zee.digest,p_payload bytea,p_max zee.atomic)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE existing zee.escrow_commits;
BEGIN
 PERFORM zee.check_escrow_dispatch(p_order,p_job,p_owner,p_fence);
 PERFORM 1 FROM zee.escrow_bindings WHERE order_id=p_order FOR UPDATE;
 SELECT * INTO existing FROM zee.escrow_commits WHERE order_id=p_order;
 IF FOUND THEN
  IF (existing.tx_hash,existing.max_cost) IS DISTINCT FROM (p_hash,p_max)
  THEN RAISE EXCEPTION 'conflicting signed commitment'; END IF;
  RETURN;
 END IF;
 -- Existing reverse Base fee reserve is the total Base execution/recovery cap.
 -- COMMIT spends part; no reservation is released and future SETTLE must count it.
 IF p_max>(SELECT refund_fee FROM zee.quotes WHERE id=p_order) THEN RAISE EXCEPTION 'insufficient reserved Base gas'; END IF;
 INSERT INTO zee.escrow_commits(order_id,tx_hash,signed_payload,max_cost) VALUES(p_order,p_hash,p_payload,p_max);
 INSERT INTO zee.order_events(order_id,event_type) VALUES(p_order,'BASE_COMMIT_SIGNED');
END $$;
CREATE FUNCTION zee.confirm_escrow_commit(p_order uuid,p_hash zee.digest,p_height bigint,p_block text,p_fee zee.atomic,p_receipt bytea)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE a zee.escrow_commits;
BEGIN
 PERFORM 1 FROM zee.runtime_control WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT a FROM zee.escrow_commits WHERE order_id=p_order FOR UPDATE;
 IF a.tx_hash<>p_hash THEN RAISE EXCEPTION 'receipt identity mismatch'; END IF;
 IF a.confirmed THEN
  IF (a.block_height,a.block_hash,a.actual_fee) IS DISTINCT FROM (p_height,p_block,p_fee) THEN RAISE EXCEPTION 'receipt changed; reconciliation required'; END IF;
  RETURN false;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM zee.scanner_checkpoints s JOIN zee.chain_observations b ON b.network=s.network
 WHERE s.network='base-sepolia' AND s.finalized_height>=p_height AND b.height=p_height AND b.block_hash=p_block
 AND s.observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds')
 THEN RAISE EXCEPTION 'commitment is not finalized canonical'; END IF;
 IF p_fee>a.max_cost THEN RAISE EXCEPTION 'fee cap exceeded; reconcile'; END IF;
 UPDATE zee.escrow_commits SET confirmed=true,block_height=p_height,block_hash=p_block,actual_fee=p_fee,receipt_payload=p_receipt WHERE order_id=p_order;
 UPDATE zee.operations SET chain_authorization_verified=true WHERE order_id=p_order AND kind='PAYOUT';
 INSERT INTO zee.order_events(order_id,event_type) VALUES(p_order,'BASE_COMMIT_FINALIZED');
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION zee.guard_chain_authorization() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,zee AS $$
BEGIN
 IF NEW.chain_authorization_verified AND NOT (
 EXISTS(SELECT 1 FROM zee.quotes q JOIN zee.base_attempts a ON a.order_id=q.id WHERE q.id=NEW.order_id
 AND q.execution_mode='base-settlement-v1' AND a.phase='RESERVE' AND a.confirmed) OR
 EXISTS(SELECT 1 FROM zee.quotes q JOIN zee.escrow_commits a ON a.order_id=q.id WHERE q.id=NEW.order_id
 AND q.execution_mode='base-escrow-v1' AND a.confirmed))
 THEN RAISE EXCEPTION 'check constraint chain_authorization_proof' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION zee.check_reverse_signing(p_order uuid,p_job uuid,p_owner uuid,p_fence bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 PERFORM zee.check_escrow_dispatch(p_order,p_job,p_owner,p_fence);
 IF NOT EXISTS(SELECT 1 FROM zee.escrow_commits a JOIN zee.chain_observations b ON b.network='base-sepolia'
 AND b.height=a.block_height AND b.block_hash=a.block_hash JOIN zee.scanner_checkpoints s ON s.network=b.network
 WHERE a.order_id=p_order AND a.confirmed AND s.finalized_height>=a.block_height)
 THEN RAISE EXCEPTION 'finalized commitment missing'; END IF;
END $$;
-- Generic fixture APIs cannot consume executable settlement jobs.
CREATE OR REPLACE FUNCTION zee.claim_job(p_owner uuid) RETURNS SETOF zee.outbox_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 PERFORM 1 FROM zee.runtime_control WHERE singleton AND dispatch_enabled AND NOT reconciliation_required FOR SHARE;
 IF NOT FOUND THEN RETURN; END IF;
 IF (SELECT count(*) FROM zee.scanner_checkpoints WHERE observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds')<>2 THEN RETURN; END IF;
 RETURN QUERY UPDATE zee.outbox_jobs SET status='LEASED',lease_owner=p_owner,lease_until=clock_timestamp()+interval '30 seconds',fence=fence+1
 WHERE id=(SELECT j.id FROM zee.outbox_jobs j JOIN zee.operations op ON op.id=j.operation_id JOIN zee.quotes q ON q.id=op.order_id
 WHERE q.execution_mode='observe-only' AND (j.status='QUEUED' OR (j.status='LEASED' AND j.lease_until<=clock_timestamp()))
 ORDER BY j.created_at,j.id LIMIT 1 FOR UPDATE OF j SKIP LOCKED) RETURNING *;
END $$;
CREATE OR REPLACE FUNCTION zee.complete_job(p_id uuid,p_owner uuid,p_fence bigint) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 PERFORM 1 FROM zee.runtime_control WHERE singleton AND dispatch_enabled AND NOT reconciliation_required FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'dispatch paused'; END IF;
 IF EXISTS(SELECT 1 FROM zee.outbox_jobs j JOIN zee.operations op ON op.id=j.operation_id JOIN zee.quotes q ON q.id=op.order_id WHERE j.id=p_id AND q.execution_mode<>'observe-only')
 THEN RAISE EXCEPTION 'settlement job requires finalized delivery'; END IF;
 UPDATE zee.outbox_jobs SET status='DONE' WHERE id=p_id AND lease_owner=p_owner AND fence=p_fence AND status='LEASED' AND lease_until>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'stale lease'; END IF;
 RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION zee.pin_escrow_terms(uuid,bytea),zee.check_escrow_dispatch(uuid,uuid,uuid,bigint),zee.claim_escrow_job(uuid),
 zee.store_escrow_commit(uuid,uuid,uuid,bigint,zee.digest,bytea,zee.atomic),zee.confirm_escrow_commit(uuid,zee.digest,bigint,text,zee.atomic,bytea),
 zee.check_reverse_signing(uuid,uuid,uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.pin_escrow_terms(uuid,bytea),zee.check_escrow_dispatch(uuid,uuid,uuid,bigint),zee.claim_escrow_job(uuid),
 zee.store_escrow_commit(uuid,uuid,uuid,bigint,zee.digest,bytea,zee.atomic),zee.confirm_escrow_commit(uuid,zee.digest,bigint,text,zee.atomic,bytea),
 zee.check_reverse_signing(uuid,uuid,uuid,bigint) TO zeeswap_worker;
