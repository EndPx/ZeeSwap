CREATE SCHEMA zee;
REVOKE ALL ON SCHEMA zee FROM PUBLIC;
CREATE ROLE zeeswap_api NOLOGIN;
CREATE ROLE zeeswap_worker NOLOGIN;
CREATE ROLE zeeswap_reader NOLOGIN;
GRANT USAGE ON SCHEMA zee TO zeeswap_api, zeeswap_worker, zeeswap_reader;

-- Unconstrained numeric + scale check rejects fractional input instead of
-- silently rounding it on assignment to NUMERIC(78,0).
CREATE DOMAIN zee.atomic AS numeric CHECK (VALUE >= 0 AND VALUE = trunc(VALUE) AND VALUE < 1e78);
CREATE DOMAIN zee.digest AS bytea CHECK (octet_length(VALUE) = 32);

CREATE TABLE zee.assets (
  id text PRIMARY KEY, decimals smallint NOT NULL CHECK(decimals BETWEEN 0 AND 18),
  max_atomic zee.atomic NOT NULL, network text NOT NULL CHECK(network IN ('zcash-testnet','base-sepolia')),
  contract_address text, live_enabled boolean NOT NULL DEFAULT false
);
INSERT INTO zee.assets VALUES
 ('TAZ',8,2100000000000000,'zcash-testnet',NULL,false),
 ('mockUSDC',6,1e77,'base-sepolia',NULL,false),
 ('baseETH',18,1e77,'base-sepolia',NULL,false);

CREATE TABLE zee.runtime_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  accepting_orders boolean NOT NULL DEFAULT false,
  dispatch_enabled boolean NOT NULL DEFAULT false,
  reconciliation_required boolean NOT NULL DEFAULT true,
  epoch bigint NOT NULL DEFAULT 0 CHECK(epoch >= 0)
);
INSERT INTO zee.runtime_control DEFAULT VALUES;

CREATE TABLE zee.scanner_checkpoints (
  network text PRIMARY KEY CHECK(network IN ('zcash-testnet','base-sepolia')),
  scanned_height bigint NOT NULL CHECK(scanned_height>=0),
  tip_hash text NOT NULL CHECK(tip_hash ~ '^[0-9a-f]{64}$'),
  finalized_height bigint NOT NULL CHECK(finalized_height BETWEEN 0 AND scanned_height),
  finalized_time timestamptz NOT NULL, observed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE zee.chain_observations (
  network text NOT NULL REFERENCES zee.scanner_checkpoints(network),
  height bigint NOT NULL CHECK(height>=0), block_hash text NOT NULL CHECK(block_hash ~ '^[0-9a-f]{64}$'),
  block_time timestamptz NOT NULL, PRIMARY KEY(network,height)
);

CREATE TABLE zee.inventory_accounts (
  asset text NOT NULL REFERENCES zee.assets(id), purpose text NOT NULL CHECK(purpose IN ('principal','fee')),
  balance zee.atomic NOT NULL DEFAULT 0, reserved zee.atomic NOT NULL DEFAULT 0,
  CHECK(reserved<=balance), PRIMARY KEY(asset,purpose)
);

CREATE TABLE zee.quotes (
  id uuid PRIMARY KEY, direction text NOT NULL CHECK(direction IN ('ZCASH_TO_BASE','BASE_TO_ZCASH')),
  source_asset text NOT NULL REFERENCES zee.assets(id), destination_asset text NOT NULL REFERENCES zee.assets(id),
  input_amount zee.atomic NOT NULL CHECK(input_amount BETWEEN 100000 AND 10000000),
  output_amount zee.atomic NOT NULL CHECK(output_amount=input_amount),
  payout_fee_asset text NOT NULL REFERENCES zee.assets(id), payout_fee zee.atomic NOT NULL CHECK(payout_fee>0),
  refund_fee_asset text NOT NULL REFERENCES zee.assets(id), refund_fee zee.atomic NOT NULL CHECK(refund_fee>0),
  private_payload bytea NOT NULL CHECK(octet_length(private_payload)>28), key_version smallint NOT NULL DEFAULT 1,
  deposit_reference_hash zee.digest NOT NULL UNIQUE, receiver_hash zee.digest NOT NULL UNIQUE,
  access_hash zee.digest NOT NULL, settlement_id uuid NOT NULL UNIQUE,
  finality_policy text NOT NULL DEFAULT 'g1-v1' CHECK(finality_policy='g1-v1'),
  pricing_mode text NOT NULL DEFAULT 'fixture' CHECK(pricing_mode='fixture'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL,
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '120 seconds'),
  CHECK((direction='ZCASH_TO_BASE' AND source_asset='TAZ' AND destination_asset='mockUSDC'
     AND payout_fee_asset='baseETH' AND refund_fee_asset='TAZ') OR
    (direction='BASE_TO_ZCASH' AND source_asset='mockUSDC' AND destination_asset='TAZ'
     AND payout_fee_asset='TAZ' AND refund_fee_asset='baseETH'))
);

CREATE TABLE zee.orders (
  id uuid PRIMARY KEY REFERENCES zee.quotes(id),
  state text NOT NULL DEFAULT 'AWAITING_FUNDS' CHECK(state IN
    ('AWAITING_FUNDS','CONFIRMING','READY','REFUND_REQUIRED','REVIEW_REQUIRED','EXPIRED_UNFUNDED','REORGED','SETTLED','REFUNDED')),
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  funding_cutoff_height bigint, funding_cutoff_time timestamptz, cancellation_available_at timestamptz,
  primary_deposit uuid,
  CHECK((funding_cutoff_height IS NOT NULL AND funding_cutoff_time IS NULL AND cancellation_available_at IS NULL)
     OR (funding_cutoff_height IS NULL AND funding_cutoff_time IS NOT NULL
       AND cancellation_available_at=funding_cutoff_time+interval '7200 seconds'))
);
CREATE TABLE zee.reservations (
  order_id uuid NOT NULL REFERENCES zee.orders(id), asset text NOT NULL, purpose text NOT NULL,
  amount zee.atomic NOT NULL CHECK(amount>0), released_at timestamptz,
  PRIMARY KEY(order_id,asset,purpose), FOREIGN KEY(asset,purpose) REFERENCES zee.inventory_accounts(asset,purpose)
);
CREATE TABLE zee.ledger_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, event_id uuid NOT NULL,
  asset text NOT NULL REFERENCES zee.assets(id), bucket text NOT NULL,
  amount numeric NOT NULL CHECK(amount=trunc(amount) AND abs(amount)<1e78 AND amount<>0),
  order_id uuid REFERENCES zee.orders(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(event_id,asset,bucket)
);
CREATE INDEX ledger_order ON zee.ledger_entries(order_id);
CREATE FUNCTION zee.check_balanced() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,zee AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM zee.ledger_entries WHERE event_id=NEW.event_id GROUP BY asset HAVING sum(amount)<>0 OR count(*)<2)
 THEN RAISE EXCEPTION 'unbalanced ledger event' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER balanced_event AFTER INSERT ON zee.ledger_entries
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION zee.check_balanced();

CREATE TABLE zee.deposits (
  id uuid PRIMARY KEY, identity_hash zee.digest NOT NULL UNIQUE,
  network text NOT NULL CHECK(network IN ('zcash-testnet','base-sepolia')),
  order_id uuid REFERENCES zee.orders(id), amount zee.atomic NOT NULL CHECK(amount>0),
  block_height bigint NOT NULL CHECK(block_height>=0), block_hash text NOT NULL CHECK(block_hash ~ '^[0-9a-f]{64}$'),
  block_time timestamptz NOT NULL, reference_hash zee.digest NOT NULL, receiver_hash zee.digest NOT NULL,
  shielded boolean NOT NULL, private_payload bytea NOT NULL CHECK(octet_length(private_payload)>28),
  classification text NOT NULL CHECK(classification IN ('EXACT','UNDER','OVER','LATE','EXTRA','QUARANTINED','PRIVACY_VIOLATION')),
  confirmed_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE zee.orders ADD FOREIGN KEY(primary_deposit) REFERENCES zee.deposits(id);
CREATE INDEX deposits_order ON zee.deposits(order_id);
CREATE TABLE zee.obligations (
  deposit_id uuid PRIMARY KEY REFERENCES zee.deposits(id), order_id uuid REFERENCES zee.orders(id),
  source_amount zee.atomic NOT NULL CHECK(source_amount>0),
  state text NOT NULL CHECK(state IN ('HELD','REFUND_REQUIRED','UNALLOCATED','DISCHARGED'))
);
CREATE TABLE zee.operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES zee.orders(id),
  deposit_id uuid NOT NULL UNIQUE REFERENCES zee.deposits(id),
  kind text NOT NULL CHECK(kind IN ('PAYOUT','REFUND')),
  state text NOT NULL DEFAULT 'PLANNED' CHECK(state IN ('PLANNED','PREPARED','SIGNED','SUBMITTED','CONFIRMED','UNKNOWN')),
  -- No G3 adapter can yet prove the required on-chain branch exclusion.
  chain_authorization_verified boolean NOT NULL DEFAULT false CHECK(NOT chain_authorization_verified),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX one_payout_per_order ON zee.operations(order_id) WHERE kind='PAYOUT';
CREATE TABLE zee.chain_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL REFERENCES zee.operations(id),
  tx_identity_hash zee.digest NOT NULL UNIQUE, private_payload bytea NOT NULL CHECK(octet_length(private_payload)>28),
  state text NOT NULL CHECK(state IN ('PREPARED','SIGNED','SUBMITTED','INCLUDED','CONFIRMED','REVERTED','EXPIRED','UNKNOWN')),
  block_height bigint, block_hash text, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE zee.outbox_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL UNIQUE REFERENCES zee.operations(id),
  status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','LEASED','DONE')),
  lease_owner uuid, lease_until timestamptz, fence bigint NOT NULL DEFAULT 0 CHECK(fence>=0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(status<>'LEASED' OR (lease_owner IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX outbox_dispatch ON zee.outbox_jobs(status,lease_until,created_at);
CREATE TABLE zee.order_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, order_id uuid NOT NULL REFERENCES zee.orders(id),
  event_type text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION zee.immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable record' USING ERRCODE='23514'; END $$;
CREATE TRIGGER immutable_quote BEFORE UPDATE OR DELETE ON zee.quotes FOR EACH ROW EXECUTE FUNCTION zee.immutable();
CREATE TRIGGER immutable_ledger BEFORE UPDATE OR DELETE ON zee.ledger_entries FOR EACH ROW EXECUTE FUNCTION zee.immutable();
CREATE TRIGGER immutable_event BEFORE UPDATE OR DELETE ON zee.order_events FOR EACH ROW EXECUTE FUNCTION zee.immutable();
CREATE FUNCTION zee.freeze_order_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.id,NEW.accepted_at,NEW.funding_cutoff_height,NEW.funding_cutoff_time,NEW.cancellation_available_at)
 IS DISTINCT FROM (OLD.id,OLD.accepted_at,OLD.funding_cutoff_height,OLD.funding_cutoff_time,OLD.cancellation_available_at)
 THEN RAISE EXCEPTION 'immutable accepted terms' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_order_terms BEFORE UPDATE ON zee.orders FOR EACH ROW EXECUTE FUNCTION zee.freeze_order_terms();

REVOKE ALL ON ALL TABLES IN SCHEMA zee FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA zee FROM PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA zee TO zeeswap_reader;
GRANT SELECT ON zee.quotes,zee.orders,zee.order_events,zee.assets TO zeeswap_api;
GRANT INSERT ON zee.quotes TO zeeswap_api;
GRANT SELECT ON ALL TABLES IN SCHEMA zee TO zeeswap_worker;
GRANT INSERT,UPDATE ON zee.scanner_checkpoints,zee.chain_observations TO zeeswap_worker;
