CREATE FUNCTION zee.guard_quote_issuance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE r record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM zee.runtime_control WHERE singleton AND accepting_orders AND NOT reconciliation_required)
 THEN RAISE EXCEPTION 'quote issuance paused'; END IF;
 IF (SELECT count(*) FROM zee.scanner_checkpoints WHERE observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds')<>2
 THEN RAISE EXCEPTION 'observers stale'; END IF;
 FOR r IN SELECT asset,purpose,sum(amount) AS amount FROM (VALUES
   (NEW.destination_asset,'principal',NEW.output_amount::numeric),
   (NEW.payout_fee_asset,'fee',NEW.payout_fee::numeric),
   (NEW.refund_fee_asset,'fee',NEW.refund_fee::numeric)) x(asset,purpose,amount) GROUP BY asset,purpose
 LOOP
  IF NOT EXISTS(SELECT 1 FROM zee.inventory_accounts WHERE asset=r.asset AND purpose=r.purpose AND balance-reserved>=r.amount)
  THEN RAISE EXCEPTION 'insufficient inventory or fee budget'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER quote_readiness BEFORE INSERT ON zee.quotes FOR EACH ROW EXECUTE FUNCTION zee.guard_quote_issuance();

CREATE FUNCTION zee.guard_inventory_range() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,zee AS $$
BEGIN
 IF NEW.balance>(SELECT max_atomic FROM zee.assets WHERE id=NEW.asset) THEN RAISE EXCEPTION 'asset range exceeded' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER inventory_range BEFORE INSERT OR UPDATE ON zee.inventory_accounts FOR EACH ROW EXECUTE FUNCTION zee.guard_inventory_range();

CREATE FUNCTION zee.guard_observer_rewind() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 IF (TG_TABLE_NAME='scanner_checkpoints' AND
   ((to_jsonb(NEW)->>'scanned_height')::bigint<(to_jsonb(OLD)->>'scanned_height')::bigint OR
    ((to_jsonb(NEW)->>'scanned_height')=(to_jsonb(OLD)->>'scanned_height') AND (to_jsonb(NEW)->>'tip_hash')<>(to_jsonb(OLD)->>'tip_hash'))))
 OR (TG_TABLE_NAME='chain_observations' AND (to_jsonb(NEW)->>'block_hash')<>(to_jsonb(OLD)->>'block_hash'))
 THEN
  PERFORM zee.enter_reconciliation();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER observer_rewind AFTER UPDATE ON zee.scanner_checkpoints FOR EACH ROW EXECUTE FUNCTION zee.guard_observer_rewind();
CREATE TRIGGER canonical_reorg AFTER UPDATE ON zee.chain_observations FOR EACH ROW EXECUTE FUNCTION zee.guard_observer_rewind();

CREATE OR REPLACE FUNCTION zee.claim_job(p_owner uuid) RETURNS SETOF zee.outbox_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 PERFORM 1 FROM zee.runtime_control WHERE singleton AND dispatch_enabled AND NOT reconciliation_required FOR SHARE;
 IF NOT FOUND THEN RETURN; END IF;
 IF (SELECT count(*) FROM zee.scanner_checkpoints WHERE observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds')<>2 THEN RETURN; END IF;
 RETURN QUERY UPDATE zee.outbox_jobs SET status='LEASED',lease_owner=p_owner,lease_until=clock_timestamp()+interval '30 seconds',fence=fence+1
 WHERE id=(SELECT id FROM zee.outbox_jobs WHERE status='QUEUED' OR (status='LEASED' AND lease_until<=clock_timestamp())
   ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *;
END $$;
REVOKE EXECUTE ON FUNCTION zee.guard_quote_issuance(),zee.guard_inventory_range(),zee.guard_observer_rewind() FROM PUBLIC;
