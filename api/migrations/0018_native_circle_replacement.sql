-- Separate V2 unfunded replacement. Apply this file explicitly; never run migration directory.
-- Explicit Root-selected application only. Never run the migration directory:
-- local-only SourceExposure migrations 0015/0016 are outside this milestone.
-- Existing accept_quote and every previously accepted term remain unchanged.
CREATE FUNCTION zee.accept_post_refund_replacement(p_id uuid,p_refunded_order uuid,p_expired_order uuid,p_epoch bigint,p_owner zee.digest)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE q zee.quotes;c zee.runtime_control;s zee.scanner_checkpoints;budget_row record;stamp timestamptz;nf bigint;nr bigint;
BEGIN
 -- The shipped observer publication lock and accept_quote serialize on this row.
 PERFORM zee.lock_observer_cycle();
 SELECT * INTO STRICT c FROM zee.runtime_control WHERE singleton FOR UPDATE;
 IF c.epoch IS DISTINCT FROM p_epoch OR p_epoch IS DISTINCT FROM 7::bigint OR c.reconciliation_required OR NOT c.accepting_orders OR NOT c.dispatch_enabled
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
 IF p_refunded_order IS NULL OR p_expired_order IS NULL OR p_refunded_order=p_expired_order
 OR NOT EXISTS(SELECT 1 FROM zee.orders eo JOIN zee.quotes eq ON eq.id=eo.id
   JOIN zee.scanner_checkpoints zs ON zs.network='zcash-testnet'
   WHERE eo.id=p_expired_order AND eo.state='EXPIRED_UNFUNDED' AND eo.primary_deposit IS NULL
   AND eq.direction='ZCASH_TO_BASE' AND eq.input_amount=100000 AND eq.output_amount=100000
   AND eq.source_asset='TAZ' AND eq.destination_asset='mockUSDC' AND eq.payout_fee_asset='baseETH' AND eq.refund_fee_asset='TAZ'
   AND eq.execution_mode='base-settlement-v1' AND eq.payout_fee=100000000000000 AND eq.refund_fee=10000
   AND eo.funding_cutoff_height=4537231 AND eo.funding_cutoff_time IS NULL AND eo.cancellation_available_at IS NULL
   AND zs.scanned_height>=eo.funding_cutoff_height+9)
 OR EXISTS(SELECT 1 FROM zee.deposits WHERE order_id=p_expired_order)
 OR EXISTS(SELECT 1 FROM zee.obligations WHERE order_id=p_expired_order)
 OR EXISTS(SELECT 1 FROM zee.operations WHERE order_id=p_expired_order)
 OR EXISTS(SELECT 1 FROM zee.chain_transactions t JOIN zee.operations op ON op.id=t.operation_id WHERE op.order_id=p_expired_order)
 OR EXISTS(SELECT 1 FROM zee.outbox_jobs j JOIN zee.operations op ON op.id=j.operation_id WHERE op.order_id=p_expired_order)
 OR EXISTS(SELECT 1 FROM zee.base_bindings WHERE order_id=p_expired_order)
 OR EXISTS(SELECT 1 FROM zee.base_attempts WHERE order_id=p_expired_order)
 OR EXISTS(SELECT 1 FROM zee.escrow_bindings WHERE order_id=p_expired_order)
 OR EXISTS(SELECT 1 FROM zee.escrow_commits WHERE order_id=p_expired_order)
 OR EXISTS(SELECT 1 FROM zee.reverse_payouts WHERE order_id=p_expired_order)
 OR EXISTS(SELECT 1 FROM zee.escrow_settlements WHERE order_id=p_expired_order)
 OR EXISTS(SELECT 1 FROM zee.source_refunds WHERE order_id=p_expired_order)
 OR (SELECT count(*) FROM zee.reservations WHERE order_id=p_expired_order)<>3
 OR EXISTS(SELECT 1 FROM zee.reservations r WHERE r.order_id=p_expired_order AND
    (r.released_at IS NULL OR (r.asset,r.purpose,r.amount) NOT IN(('mockUSDC','principal',100000),('TAZ','fee',10000),('baseETH','fee',100000000000000))))
 OR (SELECT count(*) FROM zee.ledger_entries WHERE order_id=p_expired_order)<>12
 OR EXISTS(SELECT 1 FROM zee.ledger_entries l LEFT JOIN zee.reservations r ON r.order_id=l.order_id AND r.asset=l.asset
   WHERE l.order_id=p_expired_order AND (r.order_id IS NULL OR l.bucket NOT IN(r.purpose||':available',r.purpose||':reserved') OR abs(l.amount)<>r.amount))
 OR EXISTS(SELECT 1 FROM zee.ledger_entries WHERE order_id=p_expired_order GROUP BY asset,bucket HAVING count(*)<>2 OR sum(amount)<>0)
 OR (SELECT count(*) FROM zee.order_events WHERE order_id=p_expired_order AND event_type IN('ACCEPTED','EXPIRED_UNFUNDED'))<>2
 OR EXISTS(SELECT 1 FROM zee.order_events WHERE order_id=p_expired_order AND event_type NOT IN('ACCEPTED','EXPIRED_UNFUNDED'))
 THEN RAISE EXCEPTION 'unfunded predecessor not exactly expired and unwound';END IF;
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
  IF nf<>2 OR nr<>0 OR EXISTS(SELECT 1 FROM zee.orders WHERE id NOT IN(p_refunded_order,p_expired_order))
  THEN RAISE EXCEPTION 'continuation all-history forward cap';END IF;
 ELSE
  IF nf<>3 OR nr<>0 OR (SELECT count(*) FROM zee.orders o JOIN zee.quotes z ON z.id=o.id
    WHERE o.id NOT IN(p_refunded_order,p_expired_order) AND z.direction='ZCASH_TO_BASE' AND o.state='SETTLED')<>1
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
 FOR budget_row IN SELECT asset,purpose,sum(amount) AS amount FROM (VALUES
 (q.destination_asset,'principal',q.output_amount::numeric),(q.payout_fee_asset,'fee',q.payout_fee::numeric),
 (q.refund_fee_asset,'fee',q.refund_fee::numeric)) x(asset,purpose,amount) GROUP BY asset,purpose ORDER BY asset,purpose LOOP
  UPDATE zee.inventory_accounts SET reserved=reserved+budget_row.amount WHERE asset=budget_row.asset AND purpose=budget_row.purpose AND balance-reserved>=budget_row.amount;
  IF NOT FOUND THEN RAISE EXCEPTION 'insufficient inventory or fee budget';END IF;
  INSERT INTO zee.reservations VALUES(p_id,budget_row.asset,budget_row.purpose,budget_row.amount,NULL);
  INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount,order_id) VALUES
  (p_id,budget_row.asset,budget_row.purpose||':available',-budget_row.amount,p_id),(p_id,budget_row.asset,budget_row.purpose||':reserved',budget_row.amount,p_id);
 END LOOP;
 INSERT INTO zee.order_events(order_id,event_type) VALUES(p_id,'ACCEPTED');RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION zee.accept_post_refund_replacement(uuid,uuid,uuid,bigint,zee.digest) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.accept_post_refund_replacement(uuid,uuid,uuid,bigint,zee.digest) TO zeeswap_api;
