-- REVIEWED OPT-IN ONLY. Not part of api/migrations or its runner. Do not apply to
-- retained G5 branches. Use a new isolated branch/schema and a direct connection.
\set ON_ERROR_STOP on
\if :{?route_instance_id}
\else
  \echo 'Required psql variable: route_instance_id (fresh UUID)'
  \quit 3
\endif
\if :{?route_deployment_digest}
\else
  \echo 'Required psql variable: route_deployment_digest (64 lowercase hex)'
  \quit 3
\endif

BEGIN;
-- No IF NOT EXISTS: an existing role/schema is a review-required collision, not
-- permission to adopt an old financial namespace or replace its data.
CREATE ROLE zeeswap_route_integration_writer LOGIN NOINHERIT NOSUPERUSER
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA zeeswap_route_integration_v1;
REVOKE ALL ON SCHEMA zeeswap_route_integration_v1 FROM PUBLIC;

CREATE TABLE zeeswap_route_integration_v1.schema_identity (
  singleton boolean PRIMARY KEY CHECK (singleton),
  schema_version smallint NOT NULL CHECK (schema_version = 1),
  instance_id uuid NOT NULL,
  deployment_digest text NOT NULL CHECK (deployment_digest ~ '^[0-9a-f]{64}$'),
  database_name name NOT NULL
);
INSERT INTO zeeswap_route_integration_v1.schema_identity
  VALUES (true, 1, :'route_instance_id'::uuid, :'route_deployment_digest', current_database());

CREATE TABLE zeeswap_route_integration_v1.books (
  stream_id text PRIMARY KEY CHECK (stream_id ~ '^route:(fixture|shadow|acceptance):[a-z0-9][a-z0-9._-]{0,63}$'),
  schema_version smallint NOT NULL CHECK (schema_version = 1),
  revision bigint NOT NULL CHECK (revision BETWEEN 0 AND 9007199254740991),
  payload bytea NOT NULL CHECK (octet_length(payload) BETWEEN 29 AND 32000000),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON ALL TABLES IN SCHEMA zeeswap_route_integration_v1 FROM PUBLIC;
GRANT USAGE ON SCHEMA zeeswap_route_integration_v1 TO zeeswap_route_integration_writer;
GRANT SELECT ON zeeswap_route_integration_v1.schema_identity TO zeeswap_route_integration_writer;
GRANT SELECT, INSERT ON zeeswap_route_integration_v1.books TO zeeswap_route_integration_writer;
GRANT UPDATE (revision, payload, updated_at) ON zeeswap_route_integration_v1.books TO zeeswap_route_integration_writer;
-- No schema CREATE, identity modification, DELETE, TRUNCATE or DDL privilege.
-- Set writer credentials separately in a secret manager; never in this file.
COMMIT;
