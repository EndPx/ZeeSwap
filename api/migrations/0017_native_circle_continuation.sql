-- Explicit Root-selected application only. Never run the migration directory:
-- local-only SourceExposure migrations 0015/0016 are outside this milestone.
-- Existing accept_quote and every previously accepted term remain unchanged.
CREATE FUNCTION zee.accept_post_refund_circle(p_id uuid,p_refunded_order uuid,p_epoch bigint,p_owner zee.digest)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE q zee.quotes;c zee.runtime_control;s zee.scanner_checkpoints;r record;stamp timestamptz;nf bigint;nr bigint;
BEGIN
 -- The shipped observer publication lock and accept_quote serialize on this row.
 PERFORM zee.lock_observer_cycle();
 SELECT * INTO STRICT c FROM zee.runtime_control WHERE singleton FOR UPDATE;
 IF c.epoch IS DISTINCT FROM p_epoch OR p_epoch IS DISTINCT FROM 6::bigint OR c.reconciliation_required OR NOT c.accepting_orders OR NOT c.dispatch_enabled
 THEN RAISE EXCEPTION 'continuation runtime fenced';END IF;
 SELECT * INTO STRICT q FROM zee.quotes WHERE id=p_id;
 IF q.access_hash IS DISTINCT FROM p_owner OR q.input_amount<>100000 OR q.output_amount<>100000
 OR q.payout_fee<>(CASE WHEN q.direction='ZCASH_TO_BASE' THEN 100000000000000 ELSE 10000 END)
 OR q.refund_fee<>(CASE WHEN q.direction='ZCASH_TO_BASE' THEN 10000 ELSE 100000000000000 END)
 OR q.execution_mode<>(CASE WHEN q.direction='ZCASH_TO_BASE' THEN 'base-settlement-v1' ELSE 'base-escrow-v1' END)
 THEN RAISE EXCEPTION 'continuation quote scope';END IF;
 IF EXISTS(SELECT 1 FROM zee.orders WHERE id=p_id) THEN RETURN p_id;END IF;
 IF NOT EXISTS(SELECT 1 FROM zee.orders o JOIN zee.quotes oq ON oq.id=o.id
 JOIN zee.deposits d ON d.id=o.primary_deposit JOIN zee.source_refunds f ON f.order_id=o.id AND f.deposit_id=d.id
 JOIN zee.obligations l ON l.deposit_id=d.id
 JOIN zee.scanner_checkpoints zs ON zs.network='zcash-testnet'
 JOIN zee.scanner_checkpoints bs ON bs.network='base-sepolia'
 JOIN zee.chain_observations db ON db.network=zs.network AND db.height=d.block_height AND db.block_hash=d.block_hash
 JOIN zee.chain_observations rb ON rb.network=zs.network AND rb.height=f.height AND rb.block_hash=f.block_hash
 JOIN zee.chain_observations cb ON cb.network=bs.network AND cb.height=f.base_height AND cb.block_hash=f.base_block
 WHERE o.id=p_refunded_order AND o.state='REFUNDED' AND oq.direction='ZCASH_TO_BASE'
 AND oq.input_amount=100000 AND d.amount=100000 AND d.classification='LATE' AND d.confirmed_at IS NOT NULL
 AND f.base_phase='CANCEL' AND f.base_confirmed AND f.confirmed AND f.zcash_fee=10000
 AND zs.scanned_height-d.block_height+1>=10 AND zs.scanned_height-f.height+1>=10 AND bs.finalized_height>=f.base_height
 AND l.state='DISCHARGED')
 OR EXISTS(SELECT 1 FROM zee.reservations WHERE order_id=p_refunded_order AND released_at IS NULL)
 OR (SELECT count(*) FROM zee.operations WHERE order_id=p_refunded_order)<>1
 OR NOT EXISTS(SELECT 1 FROM zee.operations op JOIN zee.source_refunds f ON f.order_id=op.order_id AND f.deposit_id=op.deposit_id
   WHERE op.order_id=p_refunded_order AND op.kind='REFUND' AND op.state='CONFIRMED')
 OR (SELECT count(*) FROM zee.outbox_jobs j JOIN zee.operations op ON op.id=j.operation_id WHERE op.order_id=p_refunded_order)<>1
 OR EXISTS(SELECT 1 FROM zee.outbox_jobs j JOIN zee.operations op ON op.id=j.operation_id WHERE op.order_id=p_refunded_order AND j.status<>'DONE')
 OR EXISTS(SELECT 1 FROM zee.base_attempts WHERE order_id=p_refunded_order)
 OR EXISTS(SELECT 1 FROM zee.reverse_payouts WHERE order_id=p_refunded_order)
 OR EXISTS(SELECT 1 FROM zee.escrow_commits WHERE order_id=p_refunded_order)
 THEN RAISE EXCEPTION 'original refund not completely closed';END IF;
 IF (SELECT count(*) FROM zee.assets WHERE id IN('TAZ','mockUSDC') AND live_enabled)<>2
 OR EXISTS(SELECT 1 FROM zee.assets WHERE id='baseETH' AND live_enabled)
 THEN RAISE EXCEPTION 'continuation route assets changed';END IF;
 IF EXISTS(SELECT 1 FROM zee.outbox_jobs WHERE status='LEASED' AND lease_until>clock_timestamp())
 THEN RAISE EXCEPTION 'continuation active lease';END IF;
 IF EXISTS(SELECT 1 FROM zee.obligations WHERE state<>'DISCHARGED')
 THEN RAISE EXCEPTION 'continuation unresolved customer liability';END IF;
 SELECT count(*) FILTER(WHERE direction='ZCASH_TO_BASE'),count(*) FILTER(WHERE direction='BASE_TO_ZCASH')
 INTO nf,nr FROM zee.orders o JOIN zee.quotes z ON z.id=o.id;
 IF q.direction='ZCASH_TO_BASE' THEN
  IF nf<>1 OR nr<>0 OR EXISTS(SELECT 1 FROM zee.orders WHERE id<>p_refunded_order)
  THEN RAISE EXCEPTION 'continuation all-history forward cap';END IF;
 ELSE
  IF nf<>2 OR nr<>0 OR (SELECT count(*) FROM zee.orders o JOIN zee.quotes z ON z.id=o.id
    WHERE o.id<>p_refunded_order AND z.direction='ZCASH_TO_BASE' AND o.state='SETTLED')<>1
   OR EXISTS(SELECT 1 FROM zee.reservations WHERE released_at IS NULL)
  THEN RAISE EXCEPTION 'continuation reverse requires settled forward';END IF;
 END IF;
 stamp:=clock_timestamp();
 IF stamp>=q.expires_at THEN RAISE EXCEPTION 'quote expired';END IF;
 IF (SELECT count(*) FROM zee.orders WHERE state NOT IN('SETTLED','REFUNDED','EXPIRED_UNFUNDED'))>=5
 THEN RAISE EXCEPTION 'unresolved order capacity';END IF;
 IF (SELECT count(*) FROM zee.scanner_checkpoints WHERE observed_at BETWEEN stamp-interval '60 seconds' AND stamp+interval '5 seconds')<>2
 THEN RAISE EXCEPTION 'observers stale';END IF;
 SELECT * INTO STRICT s FROM zee.scanner_checkpoints WHERE network=CASE WHEN q.direction='ZCASH_TO_BASE' THEN 'zcash-testnet' ELSE 'base-sepolia' END;
 INSERT INTO zee.orders(id,accepted_at,funding_cutoff_height,funding_cutoff_time,cancellation_available_at)
 VALUES(p_id,stamp,CASE WHEN q.direction='ZCASH_TO_BASE' THEN s.scanned_height+40 END,
 CASE WHEN q.direction='BASE_TO_ZCASH' THEN date_trunc('second',stamp)+interval '900 seconds' END,
 CASE WHEN q.direction='BASE_TO_ZCASH' THEN date_trunc('second',stamp)+interval '8100 seconds' END);
 FOR r IN SELECT asset,purpose,sum(amount) AS amount FROM (VALUES
 (q.destination_asset,'principal',q.output_amount::numeric),(q.payout_fee_asset,'fee',q.payout_fee::numeric),
 (q.refund_fee_asset,'fee',q.refund_fee::numeric)) x(asset,purpose,amount) GROUP BY asset,purpose ORDER BY asset,purpose LOOP
  UPDATE zee.inventory_accounts SET reserved=reserved+r.amount WHERE asset=r.asset AND purpose=r.purpose AND balance-reserved>=r.amount;
  IF NOT FOUND THEN RAISE EXCEPTION 'insufficient inventory or fee budget';END IF;
  INSERT INTO zee.reservations VALUES(p_id,r.asset,r.purpose,r.amount,NULL);
  INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount,order_id) VALUES
  (p_id,r.asset,r.purpose||':available',-r.amount,p_id),(p_id,r.asset,r.purpose||':reserved',r.amount,p_id);
 END LOOP;
 INSERT INTO zee.order_events(order_id,event_type) VALUES(p_id,'ACCEPTED');RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION zee.accept_post_refund_circle(uuid,uuid,bigint,zee.digest) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.accept_post_refund_circle(uuid,uuid,bigint,zee.digest) TO zeeswap_api;
