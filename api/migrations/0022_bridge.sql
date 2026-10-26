-- Preparation only. Apply separately with an independently reviewed operator plan.
-- No swap table/function/role is modified. All private state is AEAD encrypted.
CREATE SCHEMA zee_bridge;
REVOKE ALL ON SCHEMA zee_bridge FROM PUBLIC;
CREATE TABLE zee_bridge.books (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
 payload bytea NOT NULL CHECK(octet_length(payload)>28)
);
REVOKE ALL ON ALL TABLES IN SCHEMA zee_bridge FROM PUBLIC;
-- No runtime grants or financial authority are installed by this migration.
-- No seed/capital/signer/viewing key/bridge account or activation is inferred.
