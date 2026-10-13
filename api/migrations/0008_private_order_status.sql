-- Narrow status projection avoids granting the API access to raw deposit payloads.
CREATE VIEW zee.order_status AS SELECT q.id,q.direction,q.input_amount::text,q.output_amount::text,q.expires_at,
 o.state,o.funding_cutoff_height::text,o.funding_cutoff_time,o.cancellation_available_at,
 d.id AS deposit_id,d.confirmed_at,
 CASE WHEN d.network='zcash-testnet' THEN GREATEST(0,s.scanned_height-d.block_height+1)::integer ELSE 0 END AS confirmations
 FROM zee.quotes q LEFT JOIN zee.orders o ON o.id=q.id LEFT JOIN zee.deposits d ON d.id=o.primary_deposit
 LEFT JOIN zee.scanner_checkpoints s ON s.network=d.network;
GRANT SELECT ON zee.order_status TO zeeswap_api,zeeswap_reader;
