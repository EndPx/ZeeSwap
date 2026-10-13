CREATE TABLE zee.api_quote_requests (
 request_hash zee.digest PRIMARY KEY, owner_hash zee.digest NOT NULL, body_hash zee.digest NOT NULL,
 quote_id uuid NOT NULL UNIQUE REFERENCES zee.quotes(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_request BEFORE UPDATE OR DELETE ON zee.api_quote_requests FOR EACH ROW EXECUTE FUNCTION zee.immutable();
GRANT SELECT,INSERT ON zee.api_quote_requests TO zeeswap_api;
GRANT SELECT ON zee.api_quote_requests TO zeeswap_reader;
