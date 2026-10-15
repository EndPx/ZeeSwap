-- Explicit order selection for the bounded G5 batch operator. Existing FIFO
-- claim functions and all dispatch/lease/signing fences remain unchanged.
CREATE FUNCTION zee.claim_base_job_for_order(p_owner uuid,p_order uuid) RETURNS SETOF zee.outbox_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 PERFORM 1 FROM zee.runtime_control WHERE singleton AND dispatch_enabled AND NOT reconciliation_required FOR SHARE;
 IF NOT FOUND THEN RETURN; END IF;
 IF (SELECT count(*) FROM zee.scanner_checkpoints WHERE observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds')<>2 THEN RETURN; END IF;
 RETURN QUERY UPDATE zee.outbox_jobs SET status='LEASED',lease_owner=p_owner,lease_until=clock_timestamp()+interval '30 seconds',fence=fence+1
 WHERE id=(SELECT j.id FROM zee.outbox_jobs j JOIN zee.operations op ON op.id=j.operation_id
  JOIN zee.quotes q ON q.id=op.order_id JOIN zee.orders o ON o.id=q.id
  WHERE op.order_id=p_order AND (j.status='QUEUED' OR (j.status='LEASED' AND j.lease_until<=clock_timestamp()))
   AND q.execution_mode='base-settlement-v1' AND op.kind='PAYOUT' AND o.state='READY'
  ORDER BY j.created_at,j.id LIMIT 1 FOR UPDATE OF j SKIP LOCKED) RETURNING *;
END $$;
CREATE FUNCTION zee.claim_escrow_job_for_order(p_owner uuid,p_order uuid) RETURNS SETOF zee.outbox_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 PERFORM 1 FROM zee.runtime_control WHERE singleton AND dispatch_enabled AND NOT reconciliation_required FOR SHARE;
 IF NOT FOUND THEN RETURN; END IF;
 IF (SELECT count(*) FROM zee.scanner_checkpoints WHERE observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds')<>2 THEN RETURN; END IF;
 RETURN QUERY UPDATE zee.outbox_jobs SET status='LEASED',lease_owner=p_owner,lease_until=clock_timestamp()+interval '30 seconds',fence=fence+1
 WHERE id=(SELECT j.id FROM zee.outbox_jobs j JOIN zee.operations op ON op.id=j.operation_id
  JOIN zee.quotes q ON q.id=op.order_id JOIN zee.orders o ON o.id=q.id
  WHERE op.order_id=p_order AND (j.status='QUEUED' OR (j.status='LEASED' AND j.lease_until<=clock_timestamp()))
   AND q.execution_mode='base-escrow-v1' AND op.kind='PAYOUT' AND o.state='READY'
  ORDER BY j.created_at,j.id LIMIT 1 FOR UPDATE OF j SKIP LOCKED) RETURNING *;
END $$;
REVOKE ALL ON FUNCTION zee.claim_base_job_for_order(uuid,uuid),zee.claim_escrow_job_for_order(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.claim_base_job_for_order(uuid,uuid),zee.claim_escrow_job_for_order(uuid,uuid) TO zeeswap_worker;
