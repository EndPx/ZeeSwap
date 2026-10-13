-- Confirmed customer funds remain separate from operator spendable inventory.
CREATE OR REPLACE FUNCTION zee.confirm_deposit(p_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE d zee.deposits; c zee.runtime_control; s zee.scanner_checkpoints; op uuid; source_asset text;
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
 source_asset:=CASE WHEN d.network='zcash-testnet' THEN 'TAZ' ELSE 'mockUSDC' END;
 INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount,order_id) VALUES
  (d.id,source_asset,'customer:held',d.amount,d.order_id),
  (d.id,source_asset,'customer:liability',-d.amount,d.order_id);
 INSERT INTO zee.outbox_jobs(operation_id) VALUES(op);
 IF d.classification='EXACT' THEN UPDATE zee.orders SET state='READY' WHERE id=d.order_id; END IF;
 INSERT INTO zee.order_events(order_id,event_type) VALUES(d.order_id,'OPERATION_PLANNED');
 RETURN op;
END $$;

