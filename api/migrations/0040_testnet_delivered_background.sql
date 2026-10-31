-- Delivery releases only the foreground admission slot. Final accounting keeps
-- the original READY order, signed attempts, liabilities and inventory reserves.
DO $$ BEGIN
 IF current_user<>'zee_app_admin_20261023' OR to_regprocedure('zee.testnet_continuous_demo_enabled(zee.digest)') IS NULL
 THEN RAISE EXCEPTION 'DELIVERED_BACKGROUND_BASELINE';END IF;
END $$;
CREATE FUNCTION zee.testnet_order_delivery_included(p_order uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
 SELECT EXISTS(
 SELECT 1 FROM zee.orders o JOIN zee.quotes q ON q.id=o.id
 JOIN zee.testnet_policy_admissions a ON a.order_id=o.id
 JOIN zee.root_testnet_service_policies p ON p.policy_sha256=a.policy_sha256
 JOIN zee.deposits d ON d.id=o.primary_deposit
 JOIN zee.chain_observations b ON b.network=d.network AND b.height=d.block_height AND b.block_hash=d.block_hash
 JOIN zee.scanner_checkpoints s ON s.network=d.network
 WHERE o.id=p_order AND o.state='READY' AND q.direction='ZCASH_TO_BASE' AND q.execution_mode='base-settlement-v1'
 AND a.direction=q.direction AND a.amount_atomic=100000 AND a.accepted_epoch=p.active_epoch
 AND zee.testnet_continuous_demo_enabled(a.policy_sha256)
 AND d.order_id=o.id AND d.network='zcash-testnet' AND d.classification='EXACT' AND d.amount=q.input_amount
 AND d.confirmed_at IS NOT NULL AND s.scanned_height-d.block_height+1>=10
 AND (SELECT count(*) FROM zee.scanner_checkpoints WHERE network IN('base-sepolia','zcash-testnet')
   AND observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds')=2
 AND (SELECT count(*) FROM zee.base_attempts t JOIN zee.base_inclusions i USING(order_id,phase)
   JOIN zee.chain_observations c ON c.network='base-sepolia' AND c.height=i.block_height AND c.block_hash=i.block_hash
   WHERE t.order_id=o.id AND t.phase IN('RESERVE','PAY') AND i.valid AND i.tx_hash=t.tx_hash AND i.fee<=t.max_cost
   AND octet_length(t.signed_payload)>28 AND octet_length(i.receipt_payload)>28)=2
 AND EXISTS(SELECT 1 FROM zee.operations op JOIN zee.outbox_jobs j ON j.operation_id=op.id
   WHERE op.order_id=o.id AND op.kind='PAYOUT' AND op.deposit_id=d.id AND op.state IN('SIGNED','SUBMITTED'))
 AND EXISTS(SELECT 1 FROM zee.obligations ob WHERE ob.order_id=o.id AND ob.deposit_id=d.id AND ob.state='HELD' AND ob.source_amount=d.amount)
 AND (SELECT count(*) FROM zee.reservations r WHERE r.order_id=o.id AND r.released_at IS NULL)=3
 AND NOT EXISTS(SELECT 1 FROM zee.reservations r WHERE r.order_id=o.id AND (r.released_at IS NOT NULL OR r.amount<>
   CASE WHEN r.asset=q.destination_asset AND r.purpose='principal' THEN q.output_amount
        WHEN r.asset=q.payout_fee_asset AND r.purpose='fee' THEN q.payout_fee
        WHEN r.asset=q.refund_fee_asset AND r.purpose='fee' THEN q.refund_fee ELSE -1 END))
 AND NOT EXISTS(SELECT 1 FROM zee.operations op WHERE op.order_id=o.id AND (op.kind<>'PAYOUT' OR op.deposit_id<>d.id))
 AND NOT EXISTS(SELECT 1 FROM zee.obligations ob WHERE ob.order_id=o.id AND (ob.deposit_id<>d.id OR ob.state<>'HELD' OR ob.source_amount<>d.amount))
 AND NOT EXISTS(SELECT 1 FROM zee.chain_transactions tx JOIN zee.operations op ON op.id=tx.operation_id WHERE op.order_id=o.id)
 AND NOT EXISTS(SELECT 1 FROM zee.source_refunds WHERE order_id=o.id)
 AND NOT EXISTS(SELECT 1 FROM zee.escrow_commits WHERE order_id=o.id)
 AND NOT EXISTS(SELECT 1 FROM zee.reverse_payouts WHERE order_id=o.id)
 AND NOT EXISTS(SELECT 1 FROM zee.escrow_settlements WHERE order_id=o.id))
$$;
REVOKE ALL ON FUNCTION zee.testnet_order_delivery_included(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.testnet_order_delivery_included(uuid) TO zeeswap_worker,zeeswap_reader;

CREATE OR REPLACE FUNCTION zee.testnet_global_slot_busy() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
 SELECT EXISTS(SELECT 1 FROM zee.orders WHERE state NOT IN('SETTLED','REFUNDED','EXPIRED_UNFUNDED') AND NOT zee.testnet_order_delivery_included(id))
 OR EXISTS(SELECT 1 FROM zee.obligations WHERE state<>'DISCHARGED' AND NOT zee.testnet_order_delivery_included(order_id))
 OR EXISTS(SELECT 1 FROM zee.reservations WHERE released_at IS NULL AND NOT zee.testnet_order_delivery_included(order_id))
 OR EXISTS(SELECT 1 FROM zee.operations WHERE state<>'CONFIRMED' AND NOT zee.testnet_order_delivery_included(order_id))
 OR EXISTS(SELECT 1 FROM zee.outbox_jobs j LEFT JOIN zee.operations op ON op.id=j.operation_id WHERE j.status<>'DONE' AND NOT zee.testnet_order_delivery_included(op.order_id))
 OR EXISTS(SELECT 1 FROM zee.chain_transactions WHERE state NOT IN('CONFIRMED','REVERTED','EXPIRED'))
 OR EXISTS(SELECT 1 FROM zee.base_attempts WHERE NOT confirmed AND NOT zee.testnet_order_delivery_included(order_id))
 OR EXISTS(SELECT 1 FROM zee.escrow_commits WHERE NOT confirmed)
 OR EXISTS(SELECT 1 FROM zee.reverse_payouts WHERE NOT confirmed)
 OR EXISTS(SELECT 1 FROM zee.escrow_settlements WHERE NOT confirmed)
 OR EXISTS(SELECT 1 FROM zee.source_refunds WHERE NOT base_confirmed OR NOT confirmed)
$$;

-- Availability reports the same foreground count enforced by admission.
DO $$ DECLARE body text;old text;BEGIN
 body:=pg_get_functiondef('zee.testnet_policy_availability(zee.digest)'::regprocedure);
 old:='SELECT count(*) INTO na FROM zee.orders WHERE state NOT IN(''SETTLED'',''REFUNDED'',''EXPIRED_UNFUNDED'');';
 IF (length(body)-length(replace(body,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'DELIVERED_BACKGROUND_AVAILABILITY_BASELINE';END IF;
 EXECUTE replace(body,old,'SELECT count(*) INTO na FROM zee.orders WHERE state NOT IN(''SETTLED'',''REFUNDED'',''EXPIRED_UNFUNDED'') AND NOT zee.testnet_order_delivery_included(id);');
END $$;
