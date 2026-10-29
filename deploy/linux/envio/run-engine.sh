#!/usr/bin/env bash
# Operator starts only after proving the laptop engine has stopped.
set -euo pipefail
printf '%s  %s\n' e237a2839d0cbdc9a9a2adda1a184afc0f5b20306ffbe923af5686550472d8a8 /usr/bin/node | sha256sum --check --status
[[ $(/usr/bin/node -p 'process.versions.node.split(".")[0]') == 24 ]] || exit 1
export COREPACK_ENABLE_NETWORK=0 npm_config_manage_package_manager_versions=false
pnpm_cli=/opt/zeeswap-testnet/tools/pnpm-10.21.0/bin/pnpm.cjs
: "${ENVIO_PNPM_CLI_SHA256:?}"
[[ $ENVIO_PNPM_CLI_SHA256 =~ ^[0-9a-f]{64}$ ]]
printf '%s  %s\n' "$ENVIO_PNPM_CLI_SHA256" "$pnpm_cli" | sha256sum --check --status
[[ $(/usr/bin/node "$pnpm_cli" --version) == 10.21.0 ]]
# BEGIN DATABASE TRANSPORT SCOPE
validate_envio_database_scope() {
  if [[ ${ZEESWAP_SDK_DATASTORE_MODE:-} == VPS_PRIMARY_REQUIRED ]]; then
    [[ ${ENVIO_PG_HOST:?} == postgres || ${ENVIO_PG_HOST:?} == zeeswap-app-postgres-v1 ]]
    [[ ${ENVIO_PG_PORT:?} == 5432 && ${ENVIO_PG_SSL_MODE:?} == verify-full ]]
    [[ ${ZEESWAP_SDK_DATASTORE_RELOCATION_PROOF:?} == /opt/zeeswap-testnet/state/database-relocation/sdk-stores.private.json ]]
    [[ ${ZEESWAP_SDK_DATASTORE_RELOCATION_SHA256:?} =~ ^[0-9a-f]{64}$ ]]
    printf '%s  %s\n' "$ZEESWAP_SDK_DATASTORE_RELOCATION_SHA256" "$ZEESWAP_SDK_DATASTORE_RELOCATION_PROOF" | sha256sum --check --status
    [[ ${SSL_CERT_FILE:?} == /opt/zeeswap-testnet/secrets/sdk-primary/source-combined-ca.pem ]]
    [[ ${NODE_EXTRA_CA_CERTS:?} == /opt/zeeswap-testnet/secrets/sdk-primary/source-combined-ca.pem ]]
  else
    [[ -z ${ZEESWAP_SDK_DATASTORE_MODE:-} && -z ${ZEESWAP_SDK_DATASTORE_RELOCATION_PROOF:-} && -z ${ZEESWAP_SDK_DATASTORE_RELOCATION_SHA256:-} ]]
    [[ ${ZEESWAP_DATABASE_RUNTIME_MODE:-} != VPS_PRIMARY_REQUIRED ]]
    [[ ${ENVIO_PG_HOST:?} == ep-red-thunder-aosp0w70.c-2.ap-southeast-1.aws.neon.tech ]]
  fi
  [[ ${ENVIO_PG_DATABASE:?} == zee_envio_20261023 && ${ENVIO_PG_SCHEMA:?} == envio_live_final && ${ENVIO_PG_USER:?} == zee_envio_owner_20261023 ]]
}
# END DATABASE TRANSPORT SCOPE
validate_envio_database_scope
[[ ${ENVIO_PG_DATABASE:?} == zee_envio_20261023 ]]
[[ ${ENVIO_PG_SCHEMA:?} == envio_live_final ]]
[[ ${ENVIO_PG_USER:?} == zee_envio_owner_20261023 ]]
: "${ENVIO_PG_PASSWORD:?}" "${ENVIO_CONFIG_SHA256:?}"
[[ $ENVIO_CONFIG_SHA256 =~ ^[0-9a-f]{64}$ ]]
printf '%s  %s\n' "$ENVIO_CONFIG_SHA256" /opt/zeeswap-testnet/secrets/envio-live.yaml | sha256sum --check --status
printf '%s  %s\n' "$ENVIO_CONFIG_SHA256" live.yaml | sha256sum --check --status
export ENVIO_HASURA=false ENVIO_TUI=false ENVIO_PG_MAX_CONNECTIONS=2
export ENVIO_PG_SSL_MODE=verify-full ZEESWAP_COHERENT_HEADERS=true
export ZEESWAP_BASE_RPC_URL=https://sepolia.base.org NODE_OPTIONS=--max-old-space-size=256
exec /usr/bin/node "$pnpm_cli" exec envio start --config live.yaml
