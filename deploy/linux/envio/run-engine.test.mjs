import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';
const source=readFileSync(new URL('./run-engine.sh',import.meta.url),'utf8'),body=source.split('# BEGIN DATABASE TRANSPORT SCOPE\n')[1].split('# END DATABASE TRANSPORT SCOPE')[0];
function run(patch=''){
 const script=`set -euo pipefail
tmp=$(mktemp -d); trap 'rm -rf -- "$tmp"' EXIT
printf '{"fixture":"proof-already-validated-by-wrapper"}' > "$tmp/proof"
export ENVIO_PG_HOST=postgres ENVIO_PG_PORT=5432 ENVIO_PG_DATABASE=zee_envio_20261023 ENVIO_PG_SCHEMA=envio_live_final ENVIO_PG_USER=zee_envio_owner_20261023 ENVIO_PG_SSL_MODE=verify-full
export ZEESWAP_SDK_DATASTORE_MODE=VPS_PRIMARY_REQUIRED ZEESWAP_SDK_DATASTORE_RELOCATION_PROOF="$tmp/proof" ZEESWAP_SDK_DATASTORE_RELOCATION_SHA256=$(sha256sum "$tmp/proof" | cut -d' ' -f1)
export SSL_CERT_FILE="$tmp/ca" NODE_EXTRA_CA_CERTS="$tmp/ca"
${body.replaceAll('/opt/zeeswap-testnet/state/database-relocation/sdk-stores.private.json','"$tmp/proof"').replaceAll('/opt/zeeswap-testnet/secrets/sdk-primary/source-combined-ca.pem','"$tmp/ca"')}
${patch}
validate_envio_database_scope
printf SCOPE_VERIFIED
`;
 return process.platform==='win32'?spawnSync('wsl.exe',['-d','Ubuntu-24.04','--','/bin/bash','-s'],{input:script,encoding:'utf8',timeout:20000,windowsHide:true}):spawnSync('/bin/bash',['-s'],{input:script,encoding:'utf8',timeout:20000});
}
test('actual Bash scope accepts only explicit pinned primary endpoints and retains exact legacy scope',()=>{
 for(const patch of['','export ENVIO_PG_HOST=zeeswap-app-postgres-v1','unset ZEESWAP_SDK_DATASTORE_MODE ZEESWAP_SDK_DATASTORE_RELOCATION_PROOF ZEESWAP_SDK_DATASTORE_RELOCATION_SHA256; export ENVIO_PG_HOST=ep-red-thunder-aosp0w70.c-2.ap-southeast-1.aws.neon.tech']){const r=run(patch);assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'SCOPE_VERIFIED');}
});
test('actual Bash refuses wrong host/role/port/TLS/CA, changed proof bytes and primary-to-Neon fallback',()=>{
 for(const patch of['export ENVIO_PG_HOST=ep-red-thunder-aosp0w70.c-2.ap-southeast-1.aws.neon.tech','export ENVIO_PG_PORT=5433','export ENVIO_PG_SSL_MODE=require','export ENVIO_PG_USER=wrong','export NODE_EXTRA_CA_CERTS=/tmp/wrong','printf changed >> "$tmp/proof"','unset ZEESWAP_SDK_DATASTORE_MODE ZEESWAP_SDK_DATASTORE_RELOCATION_PROOF ZEESWAP_SDK_DATASTORE_RELOCATION_SHA256;export ZEESWAP_DATABASE_RUNTIME_MODE=VPS_PRIMARY_REQUIRED ENVIO_PG_HOST=ep-red-thunder-aosp0w70.c-2.ap-southeast-1.aws.neon.tech']){const r=run(patch);assert.notEqual(r.status,0,patch);assert.notEqual(r.stdout,'SCOPE_VERIFIED');}
});
