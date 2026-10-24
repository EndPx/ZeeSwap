import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { parseAbi } from 'viem';
import { digest, requireThat, type Policy } from '../src/integrations/observation/types.ts';

/** Prepares observation-only profiles. Does not start processes or touch SQL. */
const [out, mode] = process.argv.slice(2);
requireThat(out && isAbsolute(out) && out.replaceAll('\\','/').includes('/.deploy-local/') && ['live','archive'].includes(mode!), 'PRIVATE_ENVIO_CONFIG_REQUIRED');
const base = new URL('../../indexers/envio/',import.meta.url);
const config = await readFile(new URL('config.yaml',base),'utf8');
const registry = JSON.parse(await readFile(new URL('../../contracts/deployments/base-sepolia.json',import.meta.url),'utf8'));
const response = await fetch('https://sepolia.base.org',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_blockNumber',params:[]}),signal:AbortSignal.timeout(15000),redirect:'error'});
const body = await response.json() as {result?:string,error?:unknown};
requireThat(response.ok && !body.error && /^0x[0-9a-f]+$/.test(body.result??''),'BASE_TIP_REQUIRED');
const tip = Number(BigInt(body.result!));
const birthday = mode==='archive'?48093590:tip-16;
const generated = config.replace('start_block: 48078599',`start_block: ${birthday}${mode==='archive'?'\n    end_block: 48093605':''}\n    rpc:\n      - url: https://sepolia.base.org\n        for: sync\n        initial_block_interval: 100\n        interval_ceiling: 200`);
const v1Events = [...config.split('  - name: ZeeSwapSettlementV2')[0]!.matchAll(/- event: (.+)/g)].map(match=>`event ${match[1]}`);
const sources = await Promise.all(['src/handlers/settlement.ts','src/headers.ts','schema.graphql'].map(path=>readFile(new URL(path,base),'utf8')));
const policy: Policy = {adapter:'envio-hyperindex',network:'eip155:84532',birthday,
  registryDigest:digest(registry),projectionDigest:digest({config:generated,sources,envio:'3.14.0',coherentHeaders:true}),
  canonicalSourceId:'base-sepolia-public-rpc',contract:registry.contracts.ZeeSwapSettlement.address.toLowerCase(),
  token:registry.contracts.MockUSDC.address.toLowerCase(),abiDigest:digest(parseAbi(v1Events)),contractVersion:'v1',maxBlocks:1000,maxHistory:10000};
await mkdir(out,{recursive:true});
await writeFile(join(out,'config.yaml'),generated);
await writeFile(join(out,'policy.json'),JSON.stringify(policy,null,2));
await writeFile(join(out,'export.json'),JSON.stringify({policy,schema:`envio_${mode}`,databaseUrlEnv:'ENVIO_EXPORT_DATABASE_URL',tokenEnv:'ENVIO_EXPORT_TOKEN',port:mode==='live'?8099:8098},null,2));
console.log(JSON.stringify({status:'PREPARED_ONLY',mode,birthday,tip,financialDispatchEnabled:false}));
