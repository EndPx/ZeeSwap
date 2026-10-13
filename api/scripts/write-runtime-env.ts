import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { requirePrimary } from './config.ts';
requirePrimary();
const runtime=JSON.parse(await readFile(new URL('../../.deploy-local/neon-primary-runtime.json',import.meta.url),'utf8'));
const lines=['# ZeeSwap server-only testnet runtime; generated locally.',
 `DATABASE_URL=${runtime.apiUrl}`,`WORKER_DATABASE_URL=${runtime.workerUrl}`,
 `ZEE_PAYLOAD_KEY_HEX=${runtime.payloadKeyHex}`,`ZEE_LOOKUP_KEY_HEX=${runtime.lookupKeyHex}`];
await writeFile(new URL('../.env',import.meta.url),lines.join('\n')+'\n',{flag:'wx',mode:0o600});
console.log(`Wrote server-only configuration: ${fileURLToPath(new URL('../.env',import.meta.url))}`);
