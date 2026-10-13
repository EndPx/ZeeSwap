CREATE FUNCTION zee.lock_observer_cycle() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN PERFORM 1 FROM zee.runtime_control WHERE singleton FOR UPDATE; END $$;
REVOKE EXECUTE ON FUNCTION zee.lock_observer_cycle() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.lock_observer_cycle() TO zeeswap_worker;
