CREATE FUNCTION zee.accept_quote(p_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE q zee.quotes; c zee.runtime_control; s zee.scanner_checkpoints; r record; stamp timestamptz;
BEGIN
 SELECT * INTO c FROM zee.runtime_control WHERE singleton FOR UPDATE;
 IF c.reconciliation_required OR NOT c.accepting_orders THEN RAISE EXCEPTION 'acceptance paused'; END IF;
 SELECT * INTO STRICT q FROM zee.quotes WHERE id=p_id;
 IF EXISTS(SELECT 1 FROM zee.orders WHERE id=p_id) THEN RETURN p_id; END IF;
 stamp := clock_timestamp();
 IF stamp>=q.expires_at THEN RAISE EXCEPTION 'quote expired'; END IF;
 IF (SELECT count(*) FROM zee.orders WHERE state NOT IN ('SETTLED','REFUNDED','EXPIRED_UNFUNDED'))>=5
 THEN RAISE EXCEPTION 'unresolved order capacity'; END IF;
 IF (SELECT count(*) FROM zee.scanner_checkpoints WHERE observed_at BETWEEN stamp-interval '60 seconds' AND stamp+interval '5 seconds')<>2
 THEN RAISE EXCEPTION 'observers stale'; END IF;
 SELECT * INTO STRICT s FROM zee.scanner_checkpoints WHERE network=CASE WHEN q.direction='ZCASH_TO_BASE' THEN 'zcash-testnet' ELSE 'base-sepolia' END;
 INSERT INTO zee.orders(id,accepted_at,funding_cutoff_height,funding_cutoff_time,cancellation_available_at)
 VALUES(p_id,stamp,CASE WHEN q.direction='ZCASH_TO_BASE' THEN s.scanned_height+12 END,
   CASE WHEN q.direction='BASE_TO_ZCASH' THEN stamp+interval '900 seconds' END,
   CASE WHEN q.direction='BASE_TO_ZCASH' THEN stamp+interval '8100 seconds' END);
 FOR r IN SELECT asset,purpose,sum(amount) AS amount FROM (VALUES
   (q.destination_asset,'principal',q.output_amount::numeric),
   (q.payout_fee_asset,'fee',q.payout_fee::numeric),
   (q.refund_fee_asset,'fee',q.refund_fee::numeric)) x(asset,purpose,amount) GROUP BY asset,purpose ORDER BY asset,purpose
 LOOP
   UPDATE zee.inventory_accounts SET reserved=reserved+r.amount WHERE asset=r.asset AND purpose=r.purpose AND balance-reserved>=r.amount;
   IF NOT FOUND THEN RAISE EXCEPTION 'insufficient inventory or fee budget'; END IF;
   INSERT INTO zee.reservations VALUES(p_id,r.asset,r.purpose,r.amount,NULL);
   INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount,order_id) VALUES
     (p_id,r.asset,r.purpose||':available',-r.amount,p_id),(p_id,r.asset,r.purpose||':reserved',r.amount,p_id);
 END LOOP;
 INSERT INTO zee.order_events(order_id,event_type) VALUES(p_id,'ACCEPTED');
 RETURN p_id;
END $$;

CREATE FUNCTION zee.observe_deposit(p_id uuid,p_identity zee.digest,p_network text,p_reference zee.digest,p_receiver zee.digest,
 p_amount zee.atomic,p_height bigint,p_hash text,p_time timestamptz,p_shielded boolean,p_payload bytea)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE d zee.deposits; q zee.quotes; o zee.orders; class text; bound uuid;
BEGIN
 -- Serialize ingestion decisions; never wait on external I/O in this transaction.
 PERFORM 1 FROM zee.runtime_control WHERE singleton FOR UPDATE;
 SELECT * INTO d FROM zee.deposits WHERE identity_hash=p_identity;
 IF FOUND THEN
   IF (d.network,d.amount,d.reference_hash,d.receiver_hash,d.shielded) IS DISTINCT FROM (p_network,p_amount,p_reference,p_receiver,p_shielded)
   THEN RAISE EXCEPTION 'conflicting deposit identity'; END IF;
   IF (d.block_height,d.block_hash) IS DISTINCT FROM (p_height,p_hash) THEN
     UPDATE zee.runtime_control SET accepting_orders=false,dispatch_enabled=false,reconciliation_required=true,epoch=epoch+1;
     IF d.order_id IS NOT NULL THEN
       UPDATE zee.orders SET state=CASE WHEN state IN ('SETTLED','REFUNDED') THEN 'REVIEW_REQUIRED' ELSE 'REORGED' END WHERE id=d.order_id;
       INSERT INTO zee.order_events(order_id,event_type) VALUES(d.order_id,'CHAIN_RECONCILIATION_REQUIRED');
     END IF;
   END IF;
   RETURN d.id;
 END IF;
 IF p_amount>(SELECT max_atomic FROM zee.assets WHERE id=CASE WHEN p_network='zcash-testnet' THEN 'TAZ' ELSE 'mockUSDC' END)
 THEN RAISE EXCEPTION 'asset amount out of range'; END IF;
 SELECT * INTO q FROM zee.quotes WHERE deposit_reference_hash=p_reference AND receiver_hash=p_receiver;
 SELECT * INTO o FROM zee.orders WHERE id=q.id FOR UPDATE;
 class := 'QUARANTINED'; bound := NULL;
 IF o.id IS NOT NULL AND p_network=(CASE WHEN q.direction='ZCASH_TO_BASE' THEN 'zcash-testnet' ELSE 'base-sepolia' END) THEN
   bound := o.id;
   IF p_network='zcash-testnet' AND NOT p_shielded THEN class:='PRIVACY_VIOLATION';
   ELSIF o.primary_deposit IS NOT NULL THEN class:='EXTRA';
   ELSIF (o.funding_cutoff_height IS NOT NULL AND p_height>o.funding_cutoff_height)
      OR (o.funding_cutoff_time IS NOT NULL AND p_time>=o.funding_cutoff_time) THEN class:='LATE';
   ELSIF p_amount<q.input_amount THEN class:='UNDER';
   ELSIF p_amount>q.input_amount THEN class:='OVER';
   ELSE class:='EXACT'; END IF;
 END IF;
 INSERT INTO zee.deposits VALUES(p_id,p_identity,p_network,bound,p_amount,p_height,p_hash,p_time,p_reference,p_receiver,p_shielded,p_payload,class,NULL,clock_timestamp());
 INSERT INTO zee.obligations VALUES(p_id,bound,p_amount,CASE WHEN class='EXACT' THEN 'HELD'
   WHEN class IN ('QUARANTINED','PRIVACY_VIOLATION') THEN 'UNALLOCATED' ELSE 'REFUND_REQUIRED' END);
 IF bound IS NOT NULL AND o.primary_deposit IS NULL THEN
   UPDATE zee.orders SET primary_deposit=p_id,state=CASE WHEN class='EXACT' THEN 'CONFIRMING'
     WHEN class='PRIVACY_VIOLATION' THEN 'REVIEW_REQUIRED' ELSE 'REFUND_REQUIRED' END WHERE id=bound;
 END IF;
 IF bound IS NOT NULL THEN INSERT INTO zee.order_events(order_id,event_type) VALUES(bound,'DEPOSIT_'||class); END IF;
 RETURN p_id;
END $$;

CREATE FUNCTION zee.confirm_deposit(p_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE d zee.deposits; c zee.runtime_control; s zee.scanner_checkpoints; op uuid;
BEGIN
 SELECT * INTO c FROM zee.runtime_control WHERE singleton FOR UPDATE;
 IF c.reconciliation_required THEN RAISE EXCEPTION 'reconciliation required'; END IF;
 SELECT * INTO STRICT d FROM zee.deposits WHERE id=p_id FOR UPDATE;
 IF d.order_id IS NULL OR d.classification IN ('QUARANTINED','PRIVACY_VIOLATION') THEN RAISE EXCEPTION 'manual recovery required'; END IF;
 IF EXISTS(SELECT 1 FROM zee.orders WHERE id=d.order_id AND state IN ('REORGED','REVIEW_REQUIRED')) THEN RAISE EXCEPTION 'order under review'; END IF;
 SELECT * INTO STRICT s FROM zee.scanner_checkpoints WHERE network=d.network;
 IF s.observed_at<clock_timestamp()-interval '60 seconds' OR s.observed_at>clock_timestamp()+interval '5 seconds' THEN RAISE EXCEPTION 'observer stale'; END IF;
 IF NOT EXISTS(SELECT 1 FROM zee.chain_observations WHERE network=d.network AND height=d.block_height AND block_hash=d.block_hash)
 THEN RAISE EXCEPTION 'canonical inclusion missing'; END IF;
 IF (d.network='zcash-testnet' AND s.scanned_height-d.block_height+1<10)
   OR (d.network='base-sepolia' AND s.finalized_height<d.block_height) THEN RAISE EXCEPTION 'insufficient finality'; END IF;
 UPDATE zee.deposits SET confirmed_at=COALESCE(confirmed_at,clock_timestamp()) WHERE id=p_id;
 INSERT INTO zee.operations(order_id,deposit_id,kind) VALUES(d.order_id,p_id,CASE WHEN d.classification='EXACT' THEN 'PAYOUT' ELSE 'REFUND' END)
   ON CONFLICT(deposit_id) DO NOTHING RETURNING id INTO op;
 IF op IS NULL THEN SELECT id INTO op FROM zee.operations WHERE deposit_id=p_id; RETURN op; END IF;
 INSERT INTO zee.outbox_jobs(operation_id) VALUES(op);
 IF d.classification='EXACT' THEN UPDATE zee.orders SET state='READY' WHERE id=d.order_id; END IF;
 INSERT INTO zee.order_events(order_id,event_type) VALUES(d.order_id,'OPERATION_PLANNED');
 RETURN op;
END $$;

CREATE FUNCTION zee.expire_unfunded(p_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE o zee.orders; q zee.quotes; s zee.scanner_checkpoints; r record; event uuid:=gen_random_uuid();
BEGIN
 PERFORM 1 FROM zee.runtime_control WHERE singleton AND NOT reconciliation_required FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'reconciliation required'; END IF;
 SELECT * INTO STRICT o FROM zee.orders WHERE id=p_id FOR UPDATE;
 IF o.state='EXPIRED_UNFUNDED' THEN RETURN false; END IF;
 IF o.primary_deposit IS NOT NULL THEN RAISE EXCEPTION 'funded obligation cannot expire'; END IF;
 SELECT * INTO STRICT q FROM zee.quotes WHERE id=p_id;
 SELECT * INTO STRICT s FROM zee.scanner_checkpoints WHERE network=CASE WHEN q.direction='ZCASH_TO_BASE' THEN 'zcash-testnet' ELSE 'base-sepolia' END;
 IF s.observed_at NOT BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds' THEN RAISE EXCEPTION 'observer stale'; END IF;
 IF (o.funding_cutoff_height IS NOT NULL AND s.scanned_height<o.funding_cutoff_height+9)
 OR (o.funding_cutoff_time IS NOT NULL AND s.finalized_time<o.funding_cutoff_time) THEN RAISE EXCEPTION 'funding window not reconciled'; END IF;
 FOR r IN SELECT * FROM zee.reservations WHERE order_id=p_id AND released_at IS NULL ORDER BY asset,purpose LOOP
   UPDATE zee.inventory_accounts SET reserved=reserved-r.amount WHERE asset=r.asset AND purpose=r.purpose;
   UPDATE zee.reservations SET released_at=clock_timestamp() WHERE order_id=p_id AND asset=r.asset AND purpose=r.purpose;
   INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount,order_id) VALUES
    (event,r.asset,r.purpose||':reserved',-r.amount,p_id),(event,r.asset,r.purpose||':available',r.amount,p_id);
 END LOOP;
 UPDATE zee.orders SET state='EXPIRED_UNFUNDED' WHERE id=p_id;
 INSERT INTO zee.order_events(order_id,event_type) VALUES(p_id,'EXPIRED_UNFUNDED');
 RETURN true;
END $$;

CREATE FUNCTION zee.claim_job(p_owner uuid) RETURNS SETOF zee.outbox_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 PERFORM 1 FROM zee.runtime_control WHERE singleton AND dispatch_enabled AND NOT reconciliation_required FOR SHARE;
 IF NOT FOUND THEN RETURN; END IF;
 RETURN QUERY UPDATE zee.outbox_jobs SET status='LEASED',lease_owner=p_owner,lease_until=clock_timestamp()+interval '30 seconds',fence=fence+1
 WHERE id=(SELECT id FROM zee.outbox_jobs WHERE status='QUEUED' OR (status='LEASED' AND lease_until<=clock_timestamp())
   ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *;
END $$;
CREATE FUNCTION zee.complete_job(p_id uuid,p_owner uuid,p_fence bigint) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 PERFORM 1 FROM zee.runtime_control WHERE singleton AND dispatch_enabled AND NOT reconciliation_required FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'dispatch paused'; END IF;
 UPDATE zee.outbox_jobs SET status='DONE' WHERE id=p_id AND lease_owner=p_owner AND fence=p_fence
   AND status='LEASED' AND lease_until>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'stale lease'; END IF;
 RETURN true;
END $$;
CREATE FUNCTION zee.enter_reconciliation() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 UPDATE zee.runtime_control SET reconciliation_required=true,accepting_orders=false,dispatch_enabled=false,epoch=epoch+1;
 UPDATE zee.outbox_jobs SET status='QUEUED',fence=fence+1,lease_owner=NULL,lease_until=NULL WHERE status='LEASED';
END $$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA zee FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.accept_quote(uuid) TO zeeswap_api;
GRANT EXECUTE ON FUNCTION zee.observe_deposit(uuid,zee.digest,text,zee.digest,zee.digest,zee.atomic,bigint,text,timestamptz,boolean,bytea),
 zee.confirm_deposit(uuid),zee.expire_unfunded(uuid),zee.claim_job(uuid),zee.complete_job(uuid,uuid,bigint),zee.enter_reconciliation() TO zeeswap_worker;
