#!/bin/sh
set -eu
# Official image starts as root, then its entrypoint drops to its postgres user.
# Resolve UID/GID by name inside the pinned image; do not assume host UID 999.
install -d -o postgres -g postgres -m 0700 /var/lib/postgresql/tls
install -o postgres -g postgres -m 0600 /run/secrets/tls_private_key /var/lib/postgresql/tls/server.key
install -o postgres -g postgres -m 0644 /run/secrets/tls_certificate /var/lib/postgresql/tls/server.crt
exec /usr/local/bin/docker-entrypoint.sh postgres \
  -c ssl=on \
  -c ssl_cert_file=/var/lib/postgresql/tls/server.crt \
  -c ssl_key_file=/var/lib/postgresql/tls/server.key \
  -c hba_file=/opt/zeeswap-postgres/pg_hba.conf \
  -c password_encryption=scram-sha-256 \
  -c log_statement=none \
  -c log_min_error_statement=panic
