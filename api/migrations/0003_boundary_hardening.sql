-- EVM deadlines use whole seconds; preserve every previously accepted quote.
CREATE OR REPLACE FUNCTION zee.accept_quote(p_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
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
   CASE WHEN q.direction='BASE_TO_ZCASH' THEN date_trunc('second',stamp)+interval '900 seconds' END,
   CASE WHEN q.direction='BASE_TO_ZCASH' THEN date_trunc('second',stamp)+interval '8100 seconds' END);
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

CREATE OR REPLACE FUNCTION zee.observe_deposit(p_id uuid,p_identity zee.digest,p_network text,p_reference zee.digest,p_receiver zee.digest,
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
   IF (d.block_height,d.block_hash,d.block_time) IS DISTINCT FROM (p_height,p_hash,p_time) THEN
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
   ELSIF o.state='EXPIRED_UNFUNDED' THEN class:='QUARANTINED';
   ELSIF p_amount<q.input_amount THEN class:='UNDER';
   ELSIF p_amount>q.input_amount THEN class:='OVER';
   ELSE class:='EXACT'; END IF;
 END IF;
 INSERT INTO zee.deposits VALUES(p_id,p_identity,p_network,bound,p_amount,p_height,p_hash,p_time,p_reference,p_receiver,p_shielded,p_payload,class,NULL,clock_timestamp());
 INSERT INTO zee.obligations VALUES(p_id,bound,p_amount,CASE WHEN class='EXACT' THEN 'HELD'
   WHEN class IN ('QUARANTINED','PRIVACY_VIOLATION') THEN 'UNALLOCATED' ELSE 'REFUND_REQUIRED' END);
 IF bound IS NOT NULL AND o.primary_deposit IS NULL THEN
   UPDATE zee.orders SET primary_deposit=p_id,state=CASE WHEN class='EXACT' THEN 'CONFIRMING'
     WHEN class IN ('QUARANTINED','PRIVACY_VIOLATION') THEN 'REVIEW_REQUIRED' ELSE 'REFUND_REQUIRED' END WHERE id=bound;
 END IF;
 IF bound IS NOT NULL THEN INSERT INTO zee.order_events(order_id,event_type) VALUES(bound,'DEPOSIT_'||class); END IF;
 RETURN p_id;
END $$;


GRANT zeeswap_api, zeeswap_worker, zeeswap_reader TO CURRENT_USER;
