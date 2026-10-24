#!/usr/bin/env bash
# Minimal Node process against a separate remote PostgreSQL database. No Docker.
set -euo pipefail
if [[ "$(node -p 'process.versions.node.split(".")[0]')" != 24 ]]; then
  echo 'NODE24_REQUIRED' >&2
  exit 1
fi
: "${ENVIO_PG_HOST:?REMOTE_POSTGRES_REQUIRED}"
: "${ENVIO_PG_DATABASE:?ISOLATED_DATABASE_REQUIRED}"
: "${ENVIO_PG_USER:?INDEXER_ROLE_REQUIRED}"
: "${ENVIO_PG_PASSWORD:?INDEXER_CREDENTIAL_REQUIRED}"
export ENVIO_HASURA=false ENVIO_TUI=false
export ENVIO_PG_SSL_MODE=require ENVIO_PG_MAX_CONNECTIONS=2
export ZEESWAP_COHERENT_HEADERS=true
export ZEESWAP_BASE_RPC_URL=https://sepolia.base.org
export NODE_OPTIONS=--max-old-space-size=256
exec pnpm exec envio start --config "${1:?CONFIG_REQUIRED}"
