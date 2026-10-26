-- Independent of unapplied0015/0016 and bridge0022. Existing quote rows/columns
-- and all earlier function bodies remain unchanged. New mode is explicit only.
-- PostgreSQL names the two-column equality CHECK independently of its column
-- declaration. Resolve its actual name only after verifying the shipped shape;
-- an absent or changed legacy fence must fail before either CHECK is removed.
DO $$
DECLARE output_check text;pricing_check text;matches integer;input_att smallint;output_att smallint;pricing_att smallint;
BEGIN
 SELECT attnum INTO STRICT input_att FROM pg_attribute WHERE attrelid='zee.quotes'::regclass AND attname='input_amount' AND NOT attisdropped;
 SELECT attnum INTO STRICT output_att FROM pg_attribute WHERE attrelid='zee.quotes'::regclass AND attname='output_amount' AND NOT attisdropped;
 SELECT attnum INTO STRICT pricing_att FROM pg_attribute WHERE attrelid='zee.quotes'::regclass AND attname='pricing_mode' AND NOT attisdropped;
 SELECT count(*),min(conname::text) INTO matches,output_check FROM pg_constraint
 WHERE conrelid='zee.quotes'::regclass AND contype='c' AND convalidated
 AND cardinality(conkey)=2 AND conkey @> ARRAY[input_att,output_att]::smallint[]
 AND pg_get_constraintdef(oid,false)=ANY(ARRAY['CHECK ((output_amount = input_amount))','CHECK (((output_amount)::numeric = (input_amount)::numeric))']);
 IF matches<>1 THEN RAISE EXCEPTION 'MARKET_LEGACY_OUTPUT_CONSTRAINT_SHAPE';END IF;
 SELECT count(*),min(conname::text) INTO matches,pricing_check FROM pg_constraint
 WHERE conrelid='zee.quotes'::regclass AND contype='c' AND convalidated
 AND conname='quotes_pricing_mode_check' AND conkey=ARRAY[pricing_att]::smallint[]
 AND pg_get_constraintdef(oid,false)=ANY(ARRAY['CHECK ((pricing_mode = ''fixture''::text))','CHECK ((pricing_mode = ''fixture''))']);
 IF matches<>1 THEN RAISE EXCEPTION 'MARKET_LEGACY_PRICING_CONSTRAINT_SHAPE';END IF;
 EXECUTE format('ALTER TABLE zee.quotes DROP CONSTRAINT %I',pricing_check);
 EXECUTE format('ALTER TABLE zee.quotes DROP CONSTRAINT %I',output_check);
END $$;
ALTER TABLE zee.quotes ADD CONSTRAINT quote_pricing_modes CHECK(pricing_mode IN('fixture','market-reference'));
ALTER TABLE zee.quotes ADD CONSTRAINT quote_mode_output CHECK((pricing_mode='fixture' AND output_amount=input_amount) OR
 (pricing_mode='market-reference' AND ((direction='ZCASH_TO_BASE' AND output_amount BETWEEN 100000 AND 10000000) OR(direction='BASE_TO_ZCASH' AND output_amount BETWEEN 10000 AND 10000000))));

CREATE TABLE zee.market_price_snapshots(id uuid PRIMARY KEY,snapshot_sha256 zee.digest NOT NULL UNIQUE,snapshot jsonb NOT NULL,
 retrieved_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,zec_bid zee.atomic NOT NULL,zec_ask zee.atomic NOT NULL,usdc_bid zee.atomic NOT NULL,usdc_ask zee.atomic NOT NULL,
 bid_scaled12 zee.atomic NOT NULL,ask_scaled12 zee.atomic NOT NULL,published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(expires_at>retrieved_at AND expires_at<=retrieved_at+interval '30 seconds'),CHECK(zec_bid>0 AND zec_ask>=zec_bid AND usdc_bid>0 AND usdc_ask>=usdc_bid AND bid_scaled12>0 AND ask_scaled12>=bid_scaled12));
CREATE TABLE zee.root_market_service_policies(
 policy_sha256 zee.digest PRIMARY KEY,policy_id uuid NOT NULL UNIQUE,active_epoch bigint NOT NULL UNIQUE CHECK(active_epoch>0),
 profile_sha256 zee.digest NOT NULL,source_identity_digest zee.digest NOT NULL,canonical_audit_sha256 zee.digest NOT NULL,capital_allocation_sha256 zee.digest NOT NULL,initial_books_sha256 zee.digest NOT NULL,
 public_commit text NOT NULL CHECK(public_commit~'^[a-f0-9]{40}$'),settlement_contract text NOT NULL CHECK(settlement_contract~'^0x[a-f0-9]{40}$'),token_contract text NOT NULL CHECK(token_contract~'^0x[a-f0-9]{40}$'),
 native_principal_budget zee.atomic NOT NULL CHECK(native_principal_budget>0 AND native_principal_budget<=20000000),base_principal_budget zee.atomic NOT NULL CHECK(base_principal_budget>0 AND base_principal_budget<=20000000),
 native_fee_budget zee.atomic NOT NULL CHECK(native_fee_budget=40000),base_fee_budget zee.atomic NOT NULL CHECK(base_fee_budget=400000000000000),
 created_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '24 hours'));
CREATE TABLE zee.market_quote_prices(quote_id uuid PRIMARY KEY REFERENCES zee.quotes(id) DEFERRABLE INITIALLY DEFERRED,
 snapshot_id uuid NOT NULL REFERENCES zee.market_price_snapshots(id),policy_sha256 zee.digest NOT NULL REFERENCES zee.root_market_service_policies(policy_sha256),owner_hash zee.digest NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE zee.market_policy_admissions(order_id uuid PRIMARY KEY REFERENCES zee.orders(id),policy_sha256 zee.digest NOT NULL REFERENCES zee.root_market_service_policies(policy_sha256),owner_hash zee.digest NOT NULL,
 direction text NOT NULL CHECK(direction IN('ZCASH_TO_BASE','BASE_TO_ZCASH')),accepted_epoch bigint NOT NULL,input_amount zee.atomic NOT NULL,output_amount zee.atomic NOT NULL,snapshot_sha256 zee.digest NOT NULL,
 accepted_at timestamptz NOT NULL);
CREATE TABLE zee.market_service_runtime(policy_sha256 zee.digest PRIMARY KEY REFERENCES zee.root_market_service_policies(policy_sha256),control_epoch bigint NOT NULL,worker_backend_pid integer NOT NULL,worker_ready_at timestamptz NOT NULL,capital_observed_at timestamptz NOT NULL,capital_proof_digest zee.digest NOT NULL);
CREATE TRIGGER market_snapshot_immutable BEFORE UPDATE OR DELETE ON zee.market_price_snapshots FOR EACH ROW EXECUTE FUNCTION zee.immutable();
CREATE TRIGGER market_policy_immutable BEFORE UPDATE OR DELETE ON zee.root_market_service_policies FOR EACH ROW EXECUTE FUNCTION zee.immutable();
CREATE TRIGGER market_quote_price_immutable BEFORE UPDATE OR DELETE ON zee.market_quote_prices FOR EACH ROW EXECUTE FUNCTION zee.immutable();
CREATE TRIGGER market_admission_immutable BEFORE UPDATE OR DELETE ON zee.market_policy_admissions FOR EACH ROW EXECUTE FUNCTION zee.immutable();
REVOKE ALL ON zee.market_price_snapshots,zee.root_market_service_policies,zee.market_quote_prices,zee.market_policy_admissions,zee.market_service_runtime FROM PUBLIC,zeeswap_api,zeeswap_worker,zeeswap_reader;
REVOKE ALL ON zee.root_market_service_policies FROM CURRENT_USER;
GRANT SELECT,INSERT ON zee.root_market_service_policies TO CURRENT_USER;
GRANT SELECT ON zee.market_price_snapshots,zee.market_quote_prices TO zeeswap_api;
GRANT SELECT ON zee.market_price_snapshots,zee.root_market_service_policies,zee.market_quote_prices,zee.market_policy_admissions,zee.market_service_runtime TO zeeswap_worker,zeeswap_reader;

CREATE FUNCTION zee.market_scaled_price(p text) RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,zee AS $$
DECLARE n numeric;BEGIN IF p IS NULL OR p!~'^(0|[1-9][0-9]{0,17})(\.[0-9]{1,18})?$' THEN RAISE EXCEPTION 'MARKET_PRICE_INVALID';END IF;n:=p::numeric*1e18;IF n<=0 OR n<>trunc(n) THEN RAISE EXCEPTION 'MARKET_PRICE_INVALID';END IF;RETURN n;END $$;
CREATE FUNCTION zee.publish_market_snapshot(p_id uuid,p_snapshot jsonb,p_digest zee.digest) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE s jsonb:=p_snapshot;z jsonb;u jsonb;start_at timestamptz;end_at timestamptz;zb numeric;za numeric;ub numeric;ua numeric;bid numeric;ask numeric;preimage text;old zee.market_price_snapshots;stamp timestamptz:=clock_timestamp();
BEGIN
 IF p_id IS NULL OR p_digest IS NULL OR jsonb_typeof(s) IS DISTINCT FROM 'object' OR NOT(s ?& ARRAY['version','snapshotId','snapshotSha256','source','pair','retrievedAt','expiresAt','sourcePairs']) OR (SELECT count(*) FROM jsonb_object_keys(s))<>8 OR jsonb_typeof(s->'version') IS DISTINCT FROM 'number' OR jsonb_typeof(s->'sourcePairs') IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM unnest(ARRAY['snapshotId','snapshotSha256','source','pair','retrievedAt','expiresAt']) names(field) WHERE jsonb_typeof(s->field) IS DISTINCT FROM 'string') THEN RAISE EXCEPTION 'MARKET_SNAPSHOT_SCHEMA';END IF;
 IF p_id::text !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR s->>'retrievedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' OR s->>'expiresAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' THEN RAISE EXCEPTION 'MARKET_SNAPSHOT_SCHEMA';END IF;
 IF s->>'version'<>'1' OR s->>'snapshotId'<>p_id::text OR s->>'source'<>'Kraken' OR s->>'pair'<>'ZEC/USDC' OR s->>'snapshotSha256'<>encode(p_digest,'hex') OR jsonb_array_length(s->'sourcePairs')<>2 THEN RAISE EXCEPTION 'MARKET_SNAPSHOT_IDENTITY';END IF;
 z:=s->'sourcePairs'->0;u:=s->'sourcePairs'->1;
 IF jsonb_typeof(z) IS DISTINCT FROM 'object' OR jsonb_typeof(u) IS DISTINCT FROM 'object' OR NOT(z ?& ARRAY['pair','providerPair','bid','ask','mid']) OR NOT(u ?& ARRAY['pair','providerPair','bid','ask','mid']) OR (SELECT count(*) FROM jsonb_object_keys(z))<>5 OR (SELECT count(*) FROM jsonb_object_keys(u))<>5 OR EXISTS(SELECT 1 FROM(VALUES(z),(u)) legs(leg) CROSS JOIN unnest(ARRAY['pair','providerPair','bid','ask','mid']) names(field) WHERE jsonb_typeof(leg->field) IS DISTINCT FROM 'string') THEN RAISE EXCEPTION 'MARKET_SOURCE_SCHEMA';END IF;
 IF z->>'providerPair'<>'XZECZUSD' OR z->>'pair'<>'ZEC/USD' OR u->>'providerPair'<>'USDCUSD' OR u->>'pair'<>'USDC/USD' THEN RAISE EXCEPTION 'MARKET_SOURCE_IDENTITY';END IF;
 start_at:=(s->>'retrievedAt')::timestamptz;end_at:=(s->>'expiresAt')::timestamptz;
 IF start_at IS NULL OR end_at IS NULL OR start_at>stamp OR start_at<stamp-interval '30 seconds' OR end_at<=stamp OR end_at<=start_at OR end_at>start_at+interval '30 seconds' THEN RAISE EXCEPTION 'MARKET_SNAPSHOT_EXPIRED';END IF;
 zb:=zee.market_scaled_price(z->>'bid');za:=zee.market_scaled_price(z->>'ask');ub:=zee.market_scaled_price(u->>'bid');ua:=zee.market_scaled_price(u->>'ask');
 IF zb>za OR ub>ua OR zee.market_scaled_price(z->>'mid')<>floor((zb+za)*1e12/(2*1e18))*1e6 OR zee.market_scaled_price(u->>'mid')<>floor((ub+ua)*1e12/(2*1e18))*1e6 THEN RAISE EXCEPTION 'MARKET_SOURCE_SPREAD';END IF;
 bid:=floor(zb*1e12/ua);ask:=ceil(za*1e12/ub);IF bid<=0 OR ask<bid THEN RAISE EXCEPTION 'MARKET_RATE_INVALID';END IF;
 preimage:=replace(jsonb_build_array('zeeswap-market-price-v1',p_id::text,'Kraken','ZEC/USDC',s->>'retrievedAt',s->>'expiresAt','XZECZUSD',z->>'bid',z->>'ask','USDCUSD',u->>'bid',u->>'ask')::text,' ','');
 IF sha256(convert_to(preimage,'UTF8'))<>p_digest THEN RAISE EXCEPTION 'MARKET_SNAPSHOT_DIGEST';END IF;
 SELECT * INTO old FROM zee.market_price_snapshots WHERE id=p_id;IF FOUND THEN IF old.snapshot_sha256<>p_digest OR old.snapshot<>s THEN RAISE EXCEPTION 'MARKET_SNAPSHOT_CONFLICT';END IF;RETURN p_id;END IF;
 INSERT INTO zee.market_price_snapshots VALUES(p_id,p_digest,s,start_at,end_at,zb,za,ub,ua,bid,ask,stamp);RETURN p_id;
END $$;
CREATE FUNCTION zee.market_output(p_input zee.atomic,p_direction text,p_snapshot uuid) RETURNS zee.atomic LANGUAGE plpgsql STABLE SET search_path=pg_catalog,zee AS $$
DECLARE s zee.market_price_snapshots;n numeric;BEGIN SELECT * INTO STRICT s FROM zee.market_price_snapshots WHERE id=p_snapshot;
 IF p_input<100000 OR p_input>10000000 THEN RAISE EXCEPTION 'MARKET_INPUT_BOUNDS';END IF;
 IF p_direction='ZCASH_TO_BASE' THEN n:=floor(p_input*s.bid_scaled12*1e6/(1e12*1e8));IF n<100000 OR n>10000000 THEN RAISE EXCEPTION 'MARKET_OUTPUT_BOUNDS';END IF;
 ELSIF p_direction='BASE_TO_ZCASH' THEN n:=floor(p_input*1e12*1e8/(s.ask_scaled12*1e6));IF n<10000 OR n>10000000 THEN RAISE EXCEPTION 'MARKET_OUTPUT_BOUNDS';END IF;ELSE RAISE EXCEPTION 'MARKET_DIRECTION';END IF;RETURN n;END $$;
CREATE FUNCTION zee.guard_market_quote() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE m zee.market_quote_prices;s zee.market_price_snapshots;BEGIN
 IF NEW.pricing_mode='fixture' THEN IF EXISTS(SELECT 1 FROM zee.market_quote_prices WHERE quote_id=NEW.id) THEN RAISE EXCEPTION 'MARKET_LEGACY_QUOTE';END IF;RETURN NEW;END IF;
 SELECT * INTO STRICT m FROM zee.market_quote_prices WHERE quote_id=NEW.id;SELECT * INTO STRICT s FROM zee.market_price_snapshots WHERE id=m.snapshot_id;
 IF NEW.output_amount<>zee.market_output(NEW.input_amount,NEW.direction,s.id) OR NEW.created_at<s.retrieved_at OR NEW.created_at>=s.expires_at OR NEW.expires_at>least(s.expires_at,NEW.created_at+interval '120 seconds') OR m.owner_hash<>NEW.access_hash THEN RAISE EXCEPTION 'MARKET_QUOTE_BINDING';END IF;RETURN NEW;
END $$;
CREATE TRIGGER market_quote_guard BEFORE INSERT ON zee.quotes FOR EACH ROW EXECUTE FUNCTION zee.guard_market_quote();

CREATE FUNCTION zee.market_policy_gate(p_policy zee.digest) RETURNS zee.root_market_service_policies LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE p zee.root_market_service_policies;c zee.runtime_control;r zee.market_service_runtime;stamp timestamptz;
BEGIN PERFORM zee.lock_observer_cycle();stamp:=clock_timestamp();SELECT * INTO STRICT p FROM zee.root_market_service_policies WHERE policy_sha256=p_policy;SELECT * INTO STRICT c FROM zee.runtime_control WHERE singleton;
 IF p.expires_at<=stamp THEN RAISE EXCEPTION 'MARKET_POLICY_EXPIRED';END IF;IF stamp<p.created_at THEN RAISE EXCEPTION 'MARKET_POLICY_NOT_STARTED';END IF;
 IF c.epoch<>p.active_epoch OR c.reconciliation_required OR NOT c.accepting_orders OR NOT c.dispatch_enabled THEN RAISE EXCEPTION 'MARKET_RUNTIME_PAUSED';END IF;
 IF NOT EXISTS(SELECT 1 FROM zee.assets WHERE id='TAZ' AND decimals=8 AND network='zcash-testnet' AND contract_address IS NULL AND live_enabled) OR NOT EXISTS(SELECT 1 FROM zee.assets WHERE id='mockUSDC' AND decimals=6 AND network='base-sepolia' AND lower(contract_address)=p.token_contract AND live_enabled) OR EXISTS(SELECT 1 FROM zee.assets WHERE id='baseETH' AND live_enabled) THEN RAISE EXCEPTION 'MARKET_ASSET_SCOPE';END IF;
 IF (SELECT count(*) FROM zee.scanner_checkpoints WHERE network IN('zcash-testnet','base-sepolia') AND observed_at BETWEEN stamp-interval '60 seconds' AND stamp+interval '5 seconds')<>2 THEN RAISE EXCEPTION 'MARKET_SOURCE_STALE';END IF;
 SELECT * INTO r FROM zee.market_service_runtime WHERE policy_sha256=p_policy;
 IF NOT FOUND OR r.control_epoch<>c.epoch OR NOT zee.testnet_worker_lease_owned(r.worker_backend_pid) OR r.worker_ready_at NOT BETWEEN stamp-interval '60 seconds' AND stamp+interval '5 seconds' OR r.capital_observed_at NOT BETWEEN stamp-interval '60 seconds' AND stamp+interval '5 seconds' THEN RAISE EXCEPTION 'MARKET_WORKER_OR_CAPITAL_STALE';END IF;
 RETURN p;END $$;
CREATE FUNCTION zee.issue_market_quote(p_id uuid,p_direction text,p_input zee.atomic,p_payout_fee zee.atomic,p_refund_fee zee.atomic,p_payload bytea,p_reference zee.digest,p_receiver zee.digest,p_owner zee.digest,p_settlement uuid,p_execution text,p_contract text,p_snapshot uuid,p_policy zee.digest) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE p zee.root_market_service_policies;s zee.market_price_snapshots;stamp timestamptz;out_amount numeric;forward boolean:=p_direction='ZCASH_TO_BASE';
BEGIN p:=zee.market_policy_gate(p_policy);stamp:=clock_timestamp();SELECT * INTO STRICT s FROM zee.market_price_snapshots WHERE id=p_snapshot;
 IF s.expires_at<=stamp OR s.retrieved_at>stamp OR s.retrieved_at<stamp-interval '30 seconds' THEN RAISE EXCEPTION 'MARKET_SNAPSHOT_EXPIRED';END IF;
 IF (SELECT count(*) FROM zee.market_quote_prices WHERE policy_sha256=p_policy)>=32 THEN RAISE EXCEPTION 'MARKET_QUOTE_LIMIT';END IF;
 IF p_payout_fee<>(CASE WHEN forward THEN 100000000000000 ELSE 10000 END) OR p_refund_fee<>(CASE WHEN forward THEN 10000 ELSE 100000000000000 END) OR p_execution<>(CASE WHEN forward THEN 'base-settlement-v1' ELSE 'base-escrow-v1' END) OR lower(p_contract) IS DISTINCT FROM p.settlement_contract THEN RAISE EXCEPTION 'MARKET_QUOTE_SCOPE';END IF;
 out_amount:=zee.market_output(p_input,p_direction,p_snapshot);
 INSERT INTO zee.market_quote_prices VALUES(p_id,p_snapshot,p_policy,p_owner,stamp);
 INSERT INTO zee.quotes(id,direction,source_asset,destination_asset,input_amount,output_amount,payout_fee_asset,payout_fee,refund_fee_asset,refund_fee,private_payload,deposit_reference_hash,receiver_hash,access_hash,settlement_id,execution_mode,base_contract,pricing_mode,created_at,expires_at)
 VALUES(p_id,p_direction,CASE WHEN forward THEN 'TAZ' ELSE 'mockUSDC' END,CASE WHEN forward THEN 'mockUSDC' ELSE 'TAZ' END,p_input,out_amount,CASE WHEN forward THEN 'baseETH' ELSE 'TAZ' END,p_payout_fee,CASE WHEN forward THEN 'TAZ' ELSE 'baseETH' END,p_refund_fee,p_payload,p_reference,p_receiver,p_owner,p_settlement,p_execution,p_contract,'market-reference',stamp,least(stamp+interval '120 seconds',s.expires_at));RETURN p_id;END $$;
CREATE FUNCTION zee.accept_market_quote(p_id uuid,p_policy zee.digest,p_owner zee.digest) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE p zee.root_market_service_policies;q zee.quotes;m zee.market_quote_prices;s zee.market_price_snapshots;a zee.market_policy_admissions;source zee.scanner_checkpoints;r record;stamp timestamptz;nf bigint;nr bigint;n bigint;native_used numeric;base_used numeric;
BEGIN PERFORM zee.lock_observer_cycle();SELECT * INTO STRICT q FROM zee.quotes WHERE id=p_id;SELECT * INTO STRICT m FROM zee.market_quote_prices WHERE quote_id=p_id;SELECT * INTO STRICT s FROM zee.market_price_snapshots WHERE id=m.snapshot_id;
 IF q.pricing_mode<>'market-reference' OR q.access_hash<>p_owner OR m.owner_hash<>p_owner OR m.policy_sha256<>p_policy OR q.output_amount<>zee.market_output(q.input_amount,q.direction,s.id) THEN RAISE EXCEPTION 'MARKET_QUOTE_BINDING';END IF;
 SELECT * INTO a FROM zee.market_policy_admissions WHERE order_id=p_id;IF FOUND THEN IF a.policy_sha256<>p_policy OR a.owner_hash<>p_owner OR a.snapshot_sha256<>s.snapshot_sha256 OR a.input_amount<>q.input_amount OR a.output_amount<>q.output_amount THEN RAISE EXCEPTION 'MARKET_ADMISSION_CONFLICT';END IF;RETURN p_id;END IF;
 IF EXISTS(SELECT 1 FROM zee.orders WHERE id=p_id) THEN RAISE EXCEPTION 'MARKET_LEGACY_ORDER';END IF;p:=zee.market_policy_gate(p_policy);stamp:=clock_timestamp();
 IF q.expires_at<=stamp OR s.expires_at<=stamp OR s.retrieved_at>stamp OR s.retrieved_at<stamp-interval '30 seconds' THEN RAISE EXCEPTION 'MARKET_SNAPSHOT_EXPIRED';END IF;
 SELECT count(*) FILTER(WHERE direction='ZCASH_TO_BASE'),count(*) FILTER(WHERE direction='BASE_TO_ZCASH'),count(*),coalesce(sum(output_amount) FILTER(WHERE direction='BASE_TO_ZCASH'),0),coalesce(sum(output_amount) FILTER(WHERE direction='ZCASH_TO_BASE'),0) INTO nf,nr,n,native_used,base_used FROM zee.market_policy_admissions WHERE policy_sha256=p_policy;
 IF (q.direction='ZCASH_TO_BASE' AND nf>=2) OR(q.direction='BASE_TO_ZCASH' AND nr>=2) OR(n+1)*10000>p.native_fee_budget OR(n+1)*100000000000000>p.base_fee_budget OR (native_used+(CASE WHEN q.direction='BASE_TO_ZCASH' THEN q.output_amount ELSE 0 END))>p.native_principal_budget OR (base_used+(CASE WHEN q.direction='ZCASH_TO_BASE' THEN q.output_amount ELSE 0 END))>p.base_principal_budget THEN RAISE EXCEPTION 'MARKET_POLICY_LIMIT';END IF;
 IF zee.testnet_global_slot_busy() THEN RAISE EXCEPTION 'MARKET_GLOBAL_SLOT_BUSY';END IF;
 SELECT * INTO STRICT source FROM zee.scanner_checkpoints WHERE network=CASE WHEN q.direction='ZCASH_TO_BASE' THEN 'zcash-testnet' ELSE 'base-sepolia' END;
 INSERT INTO zee.orders(id,accepted_at,funding_cutoff_height,funding_cutoff_time,cancellation_available_at) VALUES(p_id,stamp,CASE WHEN q.direction='ZCASH_TO_BASE' THEN source.scanned_height+40 END,CASE WHEN q.direction='BASE_TO_ZCASH' THEN date_trunc('second',stamp)+interval '900 seconds' END,CASE WHEN q.direction='BASE_TO_ZCASH' THEN date_trunc('second',stamp)+interval '8100 seconds' END);
 FOR r IN SELECT asset,purpose,sum(amount) amount FROM(VALUES(q.destination_asset,'principal',q.output_amount::numeric),(q.payout_fee_asset,'fee',q.payout_fee::numeric),(q.refund_fee_asset,'fee',q.refund_fee::numeric)) x(asset,purpose,amount) GROUP BY asset,purpose ORDER BY asset,purpose LOOP
 UPDATE zee.inventory_accounts SET reserved=reserved+r.amount WHERE asset=r.asset AND purpose=r.purpose AND balance-reserved>=r.amount;IF NOT FOUND THEN RAISE EXCEPTION 'MARKET_INSUFFICIENT_INVENTORY';END IF;
 INSERT INTO zee.reservations VALUES(p_id,r.asset,r.purpose,r.amount,NULL);INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount,order_id) VALUES(p_id,r.asset,r.purpose||':available',-r.amount,p_id),(p_id,r.asset,r.purpose||':reserved',r.amount,p_id);END LOOP;
 INSERT INTO zee.market_policy_admissions VALUES(p_id,p_policy,p_owner,q.direction,p.active_epoch,q.input_amount,q.output_amount,s.snapshot_sha256,stamp);INSERT INTO zee.order_events(order_id,event_type) VALUES(p_id,'ACCEPTED');RETURN p_id;END $$;

CREATE FUNCTION zee.record_market_worker_readiness(p_policy zee.digest,p_observed timestamptz,p_proof zee.digest) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE p zee.root_market_service_policies;c zee.runtime_control;old zee.market_service_runtime;stamp timestamptz;BEGIN
 IF NOT zee.testnet_worker_lease_owned(pg_backend_pid()) THEN RAISE EXCEPTION 'MARKET_WORKER_LEASE_REQUIRED';END IF;PERFORM zee.lock_observer_cycle();stamp:=clock_timestamp();SELECT * INTO STRICT p FROM zee.root_market_service_policies WHERE policy_sha256=p_policy;SELECT * INTO STRICT c FROM zee.runtime_control WHERE singleton;
 IF c.epoch<>p.active_epoch OR c.reconciliation_required OR NOT c.dispatch_enabled THEN RAISE EXCEPTION 'MARKET_RUNTIME_FENCED';END IF;
 SELECT * INTO old FROM zee.market_service_runtime WHERE policy_sha256=p_policy FOR UPDATE;
 IF p_observed IS NULL OR p_observed>stamp+interval '5 seconds' OR((NOT FOUND OR p_observed>old.capital_observed_at) AND p_observed<stamp-interval '60 seconds') OR(FOUND AND(p_observed<old.capital_observed_at OR(p_observed=old.capital_observed_at AND p_proof<>old.capital_proof_digest))) THEN RAISE EXCEPTION 'MARKET_CAPITAL_STALE_OR_REGRESSED';END IF;
 INSERT INTO zee.market_service_runtime VALUES(p_policy,c.epoch,pg_backend_pid(),stamp,p_observed,p_proof) ON CONFLICT(policy_sha256) DO UPDATE SET control_epoch=excluded.control_epoch,worker_backend_pid=excluded.worker_backend_pid,worker_ready_at=excluded.worker_ready_at,capital_observed_at=excluded.capital_observed_at,capital_proof_digest=excluded.capital_proof_digest;
END $$;
CREATE FUNCTION zee.check_market_policy_worker(p_policy zee.digest,p_order uuid) RETURNS TABLE(order_id uuid,direction text,state text,accepted_epoch bigint,worker_backend_pid integer,snapshot_sha256 text,input_amount text,output_amount text,accepted_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE p zee.root_market_service_policies;c zee.runtime_control;a zee.market_policy_admissions;q zee.quotes;r zee.market_service_runtime;s zee.market_price_snapshots;m zee.market_quote_prices;stamp timestamptz;
BEGIN PERFORM zee.lock_observer_cycle();stamp:=clock_timestamp();SELECT * INTO STRICT p FROM zee.root_market_service_policies WHERE policy_sha256=p_policy;SELECT * INTO STRICT a FROM zee.market_policy_admissions WHERE zee.market_policy_admissions.order_id=p_order;SELECT * INTO STRICT q FROM zee.quotes WHERE id=p_order;SELECT * INTO STRICT m FROM zee.market_quote_prices WHERE quote_id=p_order;SELECT * INTO STRICT s FROM zee.market_price_snapshots WHERE id=m.snapshot_id;SELECT * INTO STRICT c FROM zee.runtime_control WHERE singleton;SELECT * INTO STRICT r FROM zee.market_service_runtime WHERE policy_sha256=p_policy;
 -- A bounded SDK operation can outlast the admission heartbeat. Accepted drain
 -- retains the actual session lease, epoch and fresh-source fences; it cannot
 -- turn an old capital observation into new admission readiness.
 IF a.policy_sha256<>p_policy OR m.policy_sha256<>p_policy OR a.accepted_epoch<>p.active_epoch OR c.epoch<>p.active_epoch OR c.reconciliation_required OR NOT c.dispatch_enabled OR r.control_epoch<>c.epoch OR NOT zee.testnet_worker_lease_owned(r.worker_backend_pid) THEN RAISE EXCEPTION 'MARKET_ACCEPTED_WORKER_FENCED';END IF;
 IF q.pricing_mode<>'market-reference' OR a.snapshot_sha256<>s.snapshot_sha256 OR a.input_amount<>q.input_amount OR a.output_amount<>q.output_amount OR q.output_amount<>zee.market_output(q.input_amount,q.direction,s.id) OR a.accepted_at<p.created_at OR a.accepted_at>=p.expires_at OR a.accepted_at>=q.expires_at OR a.accepted_at>=s.expires_at THEN RAISE EXCEPTION 'MARKET_ACCEPTED_PRICE_BINDING';END IF;
 IF (SELECT count(*) FROM zee.scanner_checkpoints WHERE network IN('zcash-testnet','base-sepolia') AND observed_at BETWEEN stamp-interval '60 seconds' AND stamp+interval '5 seconds')<>2 THEN RAISE EXCEPTION 'MARKET_SOURCE_STALE';END IF;
 RETURN QUERY SELECT a.order_id,q.direction,o.state,a.accepted_epoch,r.worker_backend_pid,encode(s.snapshot_sha256,'hex'),q.input_amount::text,q.output_amount::text,a.accepted_at FROM zee.orders o WHERE o.id=p_order;
END $$;
-- Explicit privileges: API cannot publish snapshots, mint policy, forge mappings
-- or admissions. Earlier fixture INSERT/worker function grants are untouched.
REVOKE ALL ON FUNCTION zee.market_scaled_price(text),zee.publish_market_snapshot(uuid,jsonb,zee.digest),zee.market_output(zee.atomic,text,uuid),zee.guard_market_quote(),zee.market_policy_gate(zee.digest),zee.issue_market_quote(uuid,text,zee.atomic,zee.atomic,zee.atomic,bytea,zee.digest,zee.digest,zee.digest,uuid,text,text,uuid,zee.digest),zee.accept_market_quote(uuid,zee.digest,zee.digest),zee.record_market_worker_readiness(zee.digest,timestamptz,zee.digest),zee.check_market_policy_worker(zee.digest,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.publish_market_snapshot(uuid,jsonb,zee.digest),zee.record_market_worker_readiness(zee.digest,timestamptz,zee.digest),zee.check_market_policy_worker(zee.digest,uuid) TO zeeswap_worker;
GRANT EXECUTE ON FUNCTION zee.issue_market_quote(uuid,text,zee.atomic,zee.atomic,zee.atomic,bytea,zee.digest,zee.digest,zee.digest,uuid,text,text,uuid,zee.digest),zee.accept_market_quote(uuid,zee.digest,zee.digest) TO zeeswap_api;

CREATE FUNCTION zee.market_policy_availability(p_policy zee.digest) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE p zee.root_market_service_policies;nf integer;nr integer;nq integer;na integer;reason text;status text;f boolean;v boolean;stamp timestamptz:=clock_timestamp();native_used numeric;base_used numeric;n integer;
BEGIN SELECT * INTO p FROM zee.root_market_service_policies WHERE policy_sha256=p_policy;
 IF NOT FOUND THEN RETURN jsonb_build_object('version',2,'pricingMode','market-reference','status','disabled','checkedAt',stamp,'policy',NULL);END IF;
 SELECT count(*) FILTER(WHERE direction='ZCASH_TO_BASE'),count(*) FILTER(WHERE direction='BASE_TO_ZCASH'),count(*),coalesce(sum(output_amount) FILTER(WHERE direction='BASE_TO_ZCASH'),0),coalesce(sum(output_amount) FILTER(WHERE direction='ZCASH_TO_BASE'),0) INTO nf,nr,n,native_used,base_used FROM zee.market_policy_admissions WHERE policy_sha256=p_policy;
 SELECT count(*) INTO nq FROM zee.market_quote_prices WHERE policy_sha256=p_policy;SELECT count(*) INTO na FROM zee.orders WHERE state NOT IN('SETTLED','REFUNDED','EXPIRED_UNFUNDED');
 BEGIN PERFORM zee.market_policy_gate(p_policy);EXCEPTION WHEN OTHERS THEN reason:=SQLERRM;END;
 IF reason IS NULL AND nf>=2 AND nr>=2 THEN reason:='MARKET_POLICY_LIMIT';END IF;
 IF reason IS NULL AND nq>=32 THEN reason:='MARKET_QUOTE_LIMIT';END IF;
 IF reason IS NULL AND zee.testnet_global_slot_busy() THEN reason:='MARKET_GLOBAL_SLOT_BUSY';END IF;
 f:=nf<2 AND base_used+100000<=p.base_principal_budget;v:=nr<2 AND native_used+10000<=p.native_principal_budget;
 IF(n+1)*10000>p.native_fee_budget OR(n+1)*100000000000000>p.base_fee_budget THEN f:=false;v:=false;END IF;
 IF NOT EXISTS(SELECT 1 FROM zee.inventory_accounts WHERE asset='mockUSDC' AND purpose='principal' AND balance-reserved>=100000) THEN f:=false;END IF;
 IF NOT EXISTS(SELECT 1 FROM zee.inventory_accounts WHERE asset='TAZ' AND purpose='principal' AND balance-reserved>=10000) THEN v:=false;END IF;
 IF NOT EXISTS(SELECT 1 FROM zee.inventory_accounts WHERE asset='TAZ' AND purpose='fee' AND balance-reserved>=10000) OR NOT EXISTS(SELECT 1 FROM zee.inventory_accounts WHERE asset='baseETH' AND purpose='fee' AND balance-reserved>=100000000000000) THEN f:=false;v:=false;END IF;
 IF reason IS NULL AND NOT f AND NOT v THEN reason:='MARKET_INSUFFICIENT_INVENTORY';END IF;
 status:=CASE WHEN reason IS NULL THEN 'ready' WHEN reason='MARKET_POLICY_EXPIRED' THEN 'policy_expired' WHEN reason IN('MARKET_POLICY_LIMIT','MARKET_QUOTE_LIMIT') THEN 'policy_exhausted' WHEN reason='MARKET_GLOBAL_SLOT_BUSY' THEN 'busy' WHEN reason='MARKET_SOURCE_STALE' THEN 'source_unavailable' WHEN reason='MARKET_WORKER_OR_CAPITAL_STALE' THEN 'worker_unavailable' WHEN reason='MARKET_INSUFFICIENT_INVENTORY' THEN 'capital_unavailable' ELSE 'paused' END;
 RETURN jsonb_build_object('version',2,'pricingMode','market-reference','status',status,'checkedAt',stamp,'policy',jsonb_build_object('id',p.policy_id,'sha256',encode(p_policy,'hex'),'expiresAt',p.expires_at,'pricingMode','market-reference','maxAcceptedByDirection',jsonb_build_object('ZCASH_TO_BASE',2,'BASE_TO_ZCASH',2),'remainingByDirection',jsonb_build_object('ZCASH_TO_BASE',greatest(0,2-nf),'BASE_TO_ZCASH',greatest(0,2-nr)),'maxConcurrent',1,'activeOrders',na,'remainingQuotes',greatest(0,32-nq),'availableByDirection',jsonb_build_object('ZCASH_TO_BASE',reason IS NULL AND f,'BASE_TO_ZCASH',reason IS NULL AND v),
 'inputBoundsByDirection',jsonb_build_object('ZCASH_TO_BASE',jsonb_build_object('min','100000','max','10000000','decimals',8,'default','100000'),'BASE_TO_ZCASH',jsonb_build_object('min','100000','max','10000000','decimals',6,'default','1000000')),
 'outputBoundsByDirection',jsonb_build_object('ZCASH_TO_BASE',jsonb_build_object('min','100000','max','10000000','decimals',6),'BASE_TO_ZCASH',jsonb_build_object('min','10000','max','10000000','decimals',8))));
END $$;
REVOKE ALL ON FUNCTION zee.market_policy_availability(zee.digest) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zee.market_policy_availability(zee.digest) TO zeeswap_api,zeeswap_worker,zeeswap_reader;

-- Separate market accepted-liability drain; legacy0013/0021 unchanged.
-- Opt-in accepted policy liability drain. Legacy 0013 remains unchanged.
-- All routines lock the current control row through the existing policy gate.
CREATE FUNCTION zee.check_market_source_refund_liability(p_order uuid,p_policy zee.digest) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE d zee.deposits;o zee.orders;
BEGIN
 PERFORM zee.check_market_policy_worker(p_policy,p_order);
 SELECT * INTO STRICT o FROM zee.orders WHERE id=p_order FOR UPDATE;
 SELECT * INTO STRICT d FROM zee.deposits WHERE id=o.primary_deposit;
 IF d.confirmed_at IS NULL OR d.amount<=0 OR d.amount>10000000 OR d.classification NOT IN('EXACT','UNDER','OVER','LATE')
  OR (SELECT count(*) FROM zee.deposits WHERE order_id=p_order)<>1
  OR (SELECT count(*) FROM zee.obligations WHERE order_id=p_order AND deposit_id=d.id AND source_amount=d.amount AND state IN('HELD','REFUND_REQUIRED'))<>1
  OR EXISTS(SELECT 1 FROM zee.obligations WHERE order_id=p_order AND deposit_id<>d.id AND state<>'DISCHARGED')
 THEN RAISE EXCEPTION 'policy refund requires sole allocated confirmed primary liability'; END IF;
 IF NOT EXISTS(SELECT 1 FROM zee.scanner_checkpoints s JOIN zee.chain_observations b ON b.network=s.network AND b.height=d.block_height AND b.block_hash=d.block_hash WHERE s.network=d.network AND ((d.network='zcash-testnet' AND s.scanned_height-d.block_height+1>=10) OR (d.network='base-sepolia' AND s.finalized_height>=d.block_height))) THEN RAISE EXCEPTION 'policy refund canonical confirmed source required';END IF;
 IF EXISTS(SELECT 1 FROM zee.operations WHERE order_id=p_order AND state='CONFIRMED')
  OR EXISTS(SELECT 1 FROM zee.base_attempts WHERE order_id=p_order AND (phase='PAY' OR NOT confirmed))
  OR EXISTS(SELECT 1 FROM zee.escrow_commits WHERE order_id=p_order)
  OR EXISTS(SELECT 1 FROM zee.reverse_payouts WHERE order_id=p_order)
  OR EXISTS(SELECT 1 FROM zee.chain_transactions t JOIN zee.operations op ON op.id=t.operation_id WHERE op.order_id=p_order AND op.kind<>'REFUND' AND t.state NOT IN('REVERTED','EXPIRED'))
 THEN RAISE EXCEPTION 'policy refund paid committed or unresolved original attempt'; END IF;
END $$;

CREATE FUNCTION zee.begin_market_source_refund(p_order uuid,p_policy zee.digest) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE o zee.orders;q zee.quotes;d zee.deposits;c zee.runtime_control;
BEGIN
 SELECT * INTO STRICT c FROM zee.runtime_control WHERE singleton FOR UPDATE;
 PERFORM zee.check_market_source_refund_liability(p_order,p_policy);
 SELECT * INTO STRICT o FROM zee.orders WHERE id=p_order FOR UPDATE;
 SELECT * INTO STRICT q FROM zee.quotes WHERE id=p_order;
 IF EXISTS(SELECT 1 FROM zee.source_refunds WHERE order_id=p_order) THEN RETURN; END IF;
 IF o.state NOT IN('READY','REFUND_REQUIRED') OR q.execution_mode NOT IN('base-settlement-v1','base-escrow-v1') THEN RAISE EXCEPTION 'order not refundable'; END IF;
 SELECT * INTO STRICT d FROM zee.deposits WHERE id=o.primary_deposit;
 IF d.confirmed_at IS NULL OR d.classification NOT IN('EXACT','UNDER','OVER','LATE') OR
  EXISTS(SELECT 1 FROM zee.obligations WHERE order_id=p_order AND deposit_id<>d.id AND state<>'DISCHARGED')
 THEN RAISE EXCEPTION 'confirmed sole primary liability required; extra deposits require separately budgeted recovery'; END IF;
 IF EXISTS(SELECT 1 FROM zee.operations WHERE order_id=p_order AND state='CONFIRMED') OR
  EXISTS(SELECT 1 FROM zee.base_attempts WHERE order_id=p_order AND phase='PAY' AND confirmed) OR
  EXISTS(SELECT 1 FROM zee.escrow_commits WHERE order_id=p_order) OR
  EXISTS(SELECT 1 FROM zee.reverse_payouts WHERE order_id=p_order)
 THEN RAISE EXCEPTION 'paid or committed order cannot refund'; END IF;
 INSERT INTO zee.source_refunds(order_id,deposit_id,epoch,base_phase)
 VALUES(p_order,d.id,c.epoch,CASE WHEN q.direction='ZCASH_TO_BASE' THEN 'CANCEL' ELSE 'REFUND' END);
 UPDATE zee.orders SET state='REFUND_REQUIRED' WHERE id=p_order;
 -- Retire any ordinary payout job before cancellation/refund. Previously signed
 -- Base bytes remain in their independent journal and onchain CANCEL excludes them.
 UPDATE zee.outbox_jobs SET status='DONE',fence=fence+1 WHERE operation_id IN(SELECT id FROM zee.operations WHERE order_id=p_order);
 UPDATE zee.operations SET kind='REFUND',chain_authorization_verified=false WHERE order_id=p_order;
 INSERT INTO zee.order_events(order_id,event_type) VALUES(p_order,'SOURCE_REFUND_PLANNED');
END $$;

CREATE FUNCTION zee.check_market_source_refund_operator(p_order uuid,p_policy zee.digest) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 PERFORM zee.check_market_source_refund_liability(p_order,p_policy);
 PERFORM 1 FROM zee.runtime_control c JOIN zee.source_refunds a ON a.epoch=c.epoch JOIN zee.orders o ON o.id=a.order_id
 WHERE c.singleton AND c.dispatch_enabled AND NOT c.reconciliation_required
 AND a.order_id=p_order AND NOT a.confirmed AND o.state='REFUND_REQUIRED' FOR SHARE OF c;
 IF NOT FOUND THEN RAISE EXCEPTION 'refund operator epoch/state fenced'; END IF;
 IF EXISTS(SELECT 1 FROM zee.escrow_commits WHERE order_id=p_order) OR EXISTS(SELECT 1 FROM zee.reverse_payouts WHERE order_id=p_order)
 THEN RAISE EXCEPTION 'committed reverse refund forbidden'; END IF;
END $$;

CREATE FUNCTION zee.store_market_source_refund_base(p_order uuid,p_policy zee.digest,p_hash zee.digest,p_payload bytea,p_max zee.atomic) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE a zee.source_refunds;q zee.quotes;
BEGIN
 PERFORM zee.check_market_source_refund_operator(p_order,p_policy);SELECT * INTO STRICT a FROM zee.source_refunds WHERE order_id=p_order FOR UPDATE;
 IF a.base_hash IS NOT NULL THEN IF (a.base_hash,a.base_max_cost) IS DISTINCT FROM(p_hash,p_max) THEN RAISE EXCEPTION 'conflicting source refund Base transaction'; END IF;RETURN;END IF;
 SELECT * INTO STRICT q FROM zee.quotes WHERE id=p_order;
 IF p_max>10000000000000 OR p_max<=0 OR p_max>(CASE WHEN a.base_phase='CANCEL' THEN q.payout_fee ELSE q.refund_fee END)
 THEN RAISE EXCEPTION 'source refund Base fee cap exceeded'; END IF;
 UPDATE zee.source_refunds SET base_hash=p_hash,base_payload=p_payload,base_max_cost=p_max WHERE order_id=p_order;
 INSERT INTO zee.order_events(order_id,event_type) VALUES(p_order,'SOURCE_REFUND_BASE_SIGNED');
END $$;

CREATE FUNCTION zee.check_market_source_refund_signing(p_order uuid,p_policy zee.digest) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 PERFORM zee.check_market_source_refund_operator(p_order,p_policy);
 IF NOT EXISTS(SELECT 1 FROM zee.source_refunds a JOIN zee.deposits d ON d.id=a.deposit_id
 JOIN zee.scanner_checkpoints z ON z.network='zcash-testnet' JOIN zee.chain_observations zb ON zb.network=z.network AND zb.height=d.block_height AND zb.block_hash=d.block_hash
 JOIN zee.scanner_checkpoints b ON b.network='base-sepolia' JOIN zee.chain_observations bb ON bb.network=b.network AND bb.height=a.base_height AND bb.block_hash=a.base_block
 WHERE a.order_id=p_order AND a.base_phase='CANCEL' AND a.base_confirmed AND d.confirmed_at IS NOT NULL AND z.scanned_height-d.block_height+1>=10
 AND b.finalized_height>=a.base_height AND z.observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds'
 AND b.observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds')
 THEN RAISE EXCEPTION 'fresh canonical source and permanent Base cancellation required';END IF;
END $$;

CREATE FUNCTION zee.store_market_source_refund_zcash(p_order uuid,p_policy zee.digest,p_hash zee.digest,p_payload bytea,p_fee zee.atomic,p_expiry bigint) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE a zee.source_refunds;
BEGIN
 PERFORM zee.check_market_source_refund_signing(p_order,p_policy);SELECT * INTO STRICT a FROM zee.source_refunds WHERE order_id=p_order FOR UPDATE;
 IF a.zcash_hash IS NOT NULL THEN IF (a.zcash_hash,a.zcash_fee,a.expiry_height) IS DISTINCT FROM(p_hash,p_fee,p_expiry) THEN RAISE EXCEPTION 'conflicting signed source refund';END IF;RETURN;END IF;
 IF p_fee>10000 OR p_fee<=0 OR p_fee>(SELECT refund_fee FROM zee.quotes WHERE id=p_order) OR p_expiry<(SELECT scanned_height+20 FROM zee.scanner_checkpoints WHERE network='zcash-testnet') THEN RAISE EXCEPTION 'refund fee or expiry unsafe';END IF;
 UPDATE zee.source_refunds SET zcash_hash=p_hash,zcash_payload=p_payload,zcash_fee=p_fee,expiry_height=p_expiry WHERE order_id=p_order;
 UPDATE zee.operations SET state='SIGNED' WHERE order_id=p_order AND kind='REFUND';
END $$;

CREATE FUNCTION zee.confirm_market_source_refund_base(p_order uuid,p_policy zee.digest,p_phase text,p_hash zee.digest,p_height bigint,p_block text,p_fee zee.atomic,p_receipt bytea) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 PERFORM zee.check_market_policy_worker(p_policy,p_order);
 IF EXISTS(SELECT 1 FROM zee.source_refunds WHERE order_id=p_order AND NOT confirmed) THEN PERFORM zee.check_market_source_refund_liability(p_order,p_policy);END IF;
 IF NOT EXISTS(SELECT 1 FROM zee.source_refunds a JOIN zee.runtime_control c ON c.epoch=a.epoch WHERE c.singleton AND a.order_id=p_order) THEN RAISE EXCEPTION 'policy refund receipt epoch fenced';END IF;
 RETURN zee.confirm_source_refund_base(p_order,p_phase,p_hash,p_height,p_block,p_fee,p_receipt);
END $$;

CREATE FUNCTION zee.confirm_market_source_refund_zcash(p_order uuid,p_policy zee.digest,p_hash zee.digest,p_height bigint,p_block text,p_fee zee.atomic,p_receipt bytea) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
BEGIN
 PERFORM zee.check_market_policy_worker(p_policy,p_order);
 IF EXISTS(SELECT 1 FROM zee.source_refunds WHERE order_id=p_order AND NOT confirmed) THEN PERFORM zee.check_market_source_refund_liability(p_order,p_policy);END IF;
 IF NOT EXISTS(SELECT 1 FROM zee.source_refunds a JOIN zee.runtime_control c ON c.epoch=a.epoch WHERE c.singleton AND a.order_id=p_order) THEN RAISE EXCEPTION 'policy refund receipt epoch fenced';END IF;
 RETURN zee.confirm_source_refund_zcash(p_order,p_hash,p_height,p_block,p_fee,p_receipt);
END $$;

REVOKE ALL ON FUNCTION zee.check_market_source_refund_liability(uuid,zee.digest) FROM PUBLIC;

REVOKE ALL ON FUNCTION zee.begin_market_source_refund(uuid,zee.digest) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION zee.begin_market_source_refund(uuid,zee.digest) TO zeeswap_worker;

REVOKE ALL ON FUNCTION zee.check_market_source_refund_operator(uuid,zee.digest) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION zee.check_market_source_refund_operator(uuid,zee.digest) TO zeeswap_worker;

REVOKE ALL ON FUNCTION zee.store_market_source_refund_base(uuid,zee.digest,zee.digest,bytea,zee.atomic) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION zee.store_market_source_refund_base(uuid,zee.digest,zee.digest,bytea,zee.atomic) TO zeeswap_worker;

REVOKE ALL ON FUNCTION zee.check_market_source_refund_signing(uuid,zee.digest) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION zee.check_market_source_refund_signing(uuid,zee.digest) TO zeeswap_worker;

REVOKE ALL ON FUNCTION zee.store_market_source_refund_zcash(uuid,zee.digest,zee.digest,bytea,zee.atomic,bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION zee.store_market_source_refund_zcash(uuid,zee.digest,zee.digest,bytea,zee.atomic,bigint) TO zeeswap_worker;

REVOKE ALL ON FUNCTION zee.confirm_market_source_refund_base(uuid,zee.digest,text,zee.digest,bigint,text,zee.atomic,bytea) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION zee.confirm_market_source_refund_base(uuid,zee.digest,text,zee.digest,bigint,text,zee.atomic,bytea) TO zeeswap_worker;

REVOKE ALL ON FUNCTION zee.confirm_market_source_refund_zcash(uuid,zee.digest,zee.digest,bigint,text,zee.atomic,bytea) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION zee.confirm_market_source_refund_zcash(uuid,zee.digest,zee.digest,bigint,text,zee.atomic,bytea) TO zeeswap_worker;
