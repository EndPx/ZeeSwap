-- Apply ONLY this Root-reviewed migration. SourceExposure0015/0016 remain unapplied.
-- Immutable admission permits are minted only by the local admin in the same
-- transaction as an exact audited runtime CAS. Services cannot mint or edit them.
CREATE TABLE zee.root_native_circle_authorizations (
 authority_sha256 zee.digest PRIMARY KEY,
 active_epoch bigint NOT NULL UNIQUE CHECK(active_epoch>0),
 refunded_order_id uuid NOT NULL REFERENCES zee.orders(id),
 expired_order_id uuid NOT NULL REFERENCES zee.orders(id),
 forward_owner_hash zee.digest NOT NULL,
 reverse_owner_hash zee.digest NOT NULL,
 forward_cap smallint NOT NULL CHECK(forward_cap=3),
 reverse_cap smallint NOT NULL CHECK(reverse_cap=1),
 amount_atomic zee.atomic NOT NULL CHECK(amount_atomic=100000),
 forward_cutoff_blocks integer NOT NULL CHECK(forward_cutoff_blocks=40),
 min_lead_blocks integer NOT NULL CHECK(min_lead_blocks=12),
 expires_at timestamptz NOT NULL,
 created_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(refunded_order_id<>expired_order_id),
 CHECK(forward_owner_hash<>reverse_owner_hash),
 CHECK(expires_at>created_at)
);
CREATE TRIGGER root_native_circle_authorization_immutable BEFORE UPDATE OR DELETE ON zee.root_native_circle_authorizations
 FOR EACH ROW EXECUTE FUNCTION zee.immutable();
REVOKE ALL ON zee.root_native_circle_authorizations FROM PUBLIC,zeeswap_api,zeeswap_worker,zeeswap_reader;
REVOKE ALL ON zee.root_native_circle_authorizations FROM CURRENT_USER;
GRANT SELECT,INSERT ON zee.root_native_circle_authorizations TO CURRENT_USER;
GRANT SELECT ON zee.root_native_circle_authorizations TO zeeswap_worker,zeeswap_reader;
CREATE FUNCTION zee.accept_root_authorized_replacement(p_id uuid,p_authority_sha256 zee.digest)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE permit_row zee.root_native_circle_authorizations;q zee.quotes;c zee.runtime_control;s zee.scanner_checkpoints;budget_row record;stamp timestamptz;nf bigint;nr bigint;
BEGIN
 -- The shipped observer publication lock and accept_quote serialize on this row.
 PERFORM zee.lock_observer_cycle();
 SELECT * INTO STRICT permit_row FROM zee.root_native_circle_authorizations WHERE authority_sha256=p_authority_sha256;
 IF permit_row.active_epoch<=0 OR permit_row.expires_at<=clock_timestamp()
 OR permit_row.forward_cap<>3 OR permit_row.reverse_cap<>1 OR permit_row.amount_atomic<>100000
 OR permit_row.forward_cutoff_blocks<>40 OR permit_row.min_lead_blocks<>12
 THEN RAISE EXCEPTION 'Root admission authorization expired or out of scope';END IF;
 SELECT * INTO STRICT c FROM zee.runtime_control WHERE singleton FOR UPDATE;
 IF c.epoch IS DISTINCT FROM permit_row.active_epoch OR c.reconciliation_required OR NOT c.accepting_orders OR NOT c.dispatch_enabled
 THEN RAISE EXCEPTION 'continuation runtime fenced';END IF;
 SELECT * INTO STRICT q FROM zee.quotes WHERE id=p_id;
 IF q.access_hash IS DISTINCT FROM (CASE WHEN q.direction='ZCASH_TO_BASE' THEN permit_row.forward_owner_hash ELSE permit_row.reverse_owner_hash END) OR q.input_amount<>100000 OR q.output_amount<>100000
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
 WHERE o.id=permit_row.refunded_order_id AND o.state='REFUNDED' AND oq.direction='ZCASH_TO_BASE'
 AND oq.input_amount=100000 AND d.amount=100000 AND d.classification='LATE' AND d.confirmed_at IS NOT NULL
 AND f.base_phase='CANCEL' AND f.base_confirmed AND f.confirmed AND f.zcash_fee=10000
 AND zs.scanned_height-d.block_height+1>=10 AND zs.scanned_height-f.height+1>=10 AND bs.finalized_height>=f.base_height
 AND l.state='DISCHARGED')
 OR EXISTS(SELECT 1 FROM zee.reservations WHERE order_id=permit_row.refunded_order_id AND released_at IS NULL)
 OR (SELECT count(*) FROM zee.operations WHERE order_id=permit_row.refunded_order_id)<>1
 OR NOT EXISTS(SELECT 1 FROM zee.operations op JOIN zee.source_refunds f ON f.order_id=op.order_id AND f.deposit_id=op.deposit_id
   WHERE op.order_id=permit_row.refunded_order_id AND op.kind='REFUND' AND op.state='CONFIRMED')
 OR (SELECT count(*) FROM zee.outbox_jobs j JOIN zee.operations op ON op.id=j.operation_id WHERE op.order_id=permit_row.refunded_order_id)<>1
 OR EXISTS(SELECT 1 FROM zee.outbox_jobs j JOIN zee.operations op ON op.id=j.operation_id WHERE op.order_id=permit_row.refunded_order_id AND j.status<>'DONE')
 OR EXISTS(SELECT 1 FROM zee.base_attempts WHERE order_id=permit_row.refunded_order_id)
 OR EXISTS(SELECT 1 FROM zee.reverse_payouts WHERE order_id=permit_row.refunded_order_id)
 OR EXISTS(SELECT 1 FROM zee.escrow_commits WHERE order_id=permit_row.refunded_order_id)
 THEN RAISE EXCEPTION 'original refund not completely closed';END IF;
 IF permit_row.refunded_order_id IS NULL OR permit_row.expired_order_id IS NULL OR permit_row.refunded_order_id=permit_row.expired_order_id
 OR NOT EXISTS(SELECT 1 FROM zee.orders eo JOIN zee.quotes eq ON eq.id=eo.id
   JOIN zee.scanner_checkpoints zs ON zs.network='zcash-testnet'
   WHERE eo.id=permit_row.expired_order_id AND eo.state='EXPIRED_UNFUNDED' AND eo.primary_deposit IS NULL
   AND eq.direction='ZCASH_TO_BASE' AND eq.input_amount=100000 AND eq.output_amount=100000
   AND eq.source_asset='TAZ' AND eq.destination_asset='mockUSDC' AND eq.payout_fee_asset='baseETH' AND eq.refund_fee_asset='TAZ'
   AND eq.execution_mode='base-settlement-v1' AND eq.payout_fee=100000000000000 AND eq.refund_fee=10000
   AND eo.funding_cutoff_height=4537231 AND eo.funding_cutoff_time IS NULL AND eo.cancellation_available_at IS NULL
   AND zs.scanned_height>=eo.funding_cutoff_height+9)
 OR EXISTS(SELECT 1 FROM zee.deposits WHERE order_id=permit_row.expired_order_id)
 OR EXISTS(SELECT 1 FROM zee.obligations WHERE order_id=permit_row.expired_order_id)
 OR EXISTS(SELECT 1 FROM zee.operations WHERE order_id=permit_row.expired_order_id)
 OR EXISTS(SELECT 1 FROM zee.chain_transactions t JOIN zee.operations op ON op.id=t.operation_id WHERE op.order_id=permit_row.expired_order_id)
 OR EXISTS(SELECT 1 FROM zee.outbox_jobs j JOIN zee.operations op ON op.id=j.operation_id WHERE op.order_id=permit_row.expired_order_id)
 OR EXISTS(SELECT 1 FROM zee.base_bindings WHERE order_id=permit_row.expired_order_id)
 OR EXISTS(SELECT 1 FROM zee.base_attempts WHERE order_id=permit_row.expired_order_id)
 OR EXISTS(SELECT 1 FROM zee.escrow_bindings WHERE order_id=permit_row.expired_order_id)
 OR EXISTS(SELECT 1 FROM zee.escrow_commits WHERE order_id=permit_row.expired_order_id)
 OR EXISTS(SELECT 1 FROM zee.reverse_payouts WHERE order_id=permit_row.expired_order_id)
 OR EXISTS(SELECT 1 FROM zee.escrow_settlements WHERE order_id=permit_row.expired_order_id)
 OR EXISTS(SELECT 1 FROM zee.source_refunds WHERE order_id=permit_row.expired_order_id)
 OR (SELECT count(*) FROM zee.reservations WHERE order_id=permit_row.expired_order_id)<>3
 OR EXISTS(SELECT 1 FROM zee.reservations r WHERE r.order_id=permit_row.expired_order_id AND
    (r.released_at IS NULL OR (r.asset,r.purpose,r.amount) NOT IN(('mockUSDC','principal',100000),('TAZ','fee',10000),('baseETH','fee',100000000000000))))
 OR (SELECT count(*) FROM zee.ledger_entries WHERE order_id=permit_row.expired_order_id)<>12
 OR EXISTS(SELECT 1 FROM zee.ledger_entries l LEFT JOIN zee.reservations r ON r.order_id=l.order_id AND r.asset=l.asset
   WHERE l.order_id=permit_row.expired_order_id AND (r.order_id IS NULL OR l.bucket NOT IN(r.purpose||':available',r.purpose||':reserved') OR abs(l.amount)<>r.amount))
 OR EXISTS(SELECT 1 FROM zee.ledger_entries WHERE order_id=permit_row.expired_order_id GROUP BY asset,bucket HAVING count(*)<>2 OR sum(amount)<>0)
 OR (SELECT count(*) FROM zee.order_events WHERE order_id=permit_row.expired_order_id AND event_type IN('ACCEPTED','EXPIRED_UNFUNDED'))<>2
 OR EXISTS(SELECT 1 FROM zee.order_events WHERE order_id=permit_row.expired_order_id AND event_type NOT IN('ACCEPTED','EXPIRED_UNFUNDED'))
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
  IF nf<>2 OR nr<>0 OR EXISTS(SELECT 1 FROM zee.orders WHERE id NOT IN(permit_row.refunded_order_id,permit_row.expired_order_id))
  THEN RAISE EXCEPTION 'continuation all-history forward cap';END IF;
 ELSE
  IF nf<>3 OR nr<>0 OR (SELECT count(*) FROM zee.orders o JOIN zee.quotes z ON z.id=o.id
    WHERE o.id NOT IN(permit_row.refunded_order_id,permit_row.expired_order_id) AND z.direction='ZCASH_TO_BASE' AND o.state='SETTLED')<>1
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
REVOKE ALL ON FUNCTION zee.accept_root_authorized_replacement(uuid,zee.digest) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.accept_root_authorized_replacement(uuid,zee.digest) TO zeeswap_api;
