-- Network signing/scanning may outlast the initial 30-second job lease. Renewal
-- extends only a currently live fence; paused, expired and replaced owners fail.
CREATE FUNCTION zee.renew_base_lease(p_job uuid,p_owner uuid,p_fence bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 PERFORM 1 FROM zee.runtime_control WHERE singleton AND dispatch_enabled AND NOT reconciliation_required FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'dispatch paused'; END IF;
 UPDATE zee.outbox_jobs SET lease_until=clock_timestamp()+interval '30 seconds'
 WHERE id=p_job AND lease_owner=p_owner AND fence=p_fence AND status='LEASED' AND lease_until>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'stale lease'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION zee.renew_base_lease(uuid,uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.renew_base_lease(uuid,uuid,bigint) TO zeeswap_worker;
