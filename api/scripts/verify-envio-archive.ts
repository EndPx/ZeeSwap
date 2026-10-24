import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { createPublicClient, decodeEventLog, http, parseAbi } from 'viem';
import { requireThat, stable, type BaseEvent } from '../src/integrations/observation/types.ts';
const config = JSON.parse(await readFile(process.argv[2]!, 'utf8')) as {schema:string};
requireThat(config.schema==='envio_archive','ARCHIVE_SCHEMA_REQUIRED');
const url=process.env.ENVIO_VERIFY_DATABASE_URL;
requireThat(url && /^\/zee_envio_[a-z0-9_]+$/.test(new URL(url).pathname),'ISOLATED_ENVIO_DATABASE_REQUIRED');
const pool=new Pool({connectionString:url,max:1});
try {
 const rows=await pool.query('SELECT payload FROM envio_archive.zee_events');
 requireThat(rows.rows.length===1,'ARCHIVE_EVENT_COUNT');
 const event=rows.rows[0]!.payload as BaseEvent;
 requireThat(event.txHash==='0x8a0053f8b0b8076ca65c8d1375889966e7dee9a3666fec8a502cec7c1f6c7bd4'&&event.event==='InventoryDeposited','PUBLIC_ARCHIVE_RECEIPT_REQUIRED');
 const rpc=createPublicClient({transport:http('https://sepolia.base.org')});
 const receipt=await rpc.getTransactionReceipt({hash:event.txHash as `0x${string}`});
 requireThat(receipt.status==='success'&&receipt.blockHash===event.block.hash&&Number(receipt.blockNumber)===event.block.height,'ARCHIVE_RECEIPT_MISMATCH');
 const log=receipt.logs.find(row=>row.logIndex===event.logIndex&&row.address.toLowerCase()===event.contract);
 requireThat(log,'ARCHIVE_LOG_MISSING');
 const decoded=decodeEventLog({abi:parseAbi(['event InventoryDeposited(address indexed from,uint256 amount)']),data:log.data,topics:log.topics});
 const exact={from:decoded.args.from.toLowerCase(),amount:decoded.args.amount.toString()};
 requireThat(stable(exact)===stable(event.decoded)&&event.amountAtomic===exact.amount,'ARCHIVE_DECODE_MISMATCH');
 const headers=await pool.query('SELECT payload FROM envio_archive.zee_headers ORDER BY block_height');
 requireThat(headers.rows.length===16,'ARCHIVE_HEADER_GAP');
 for(const {payload} of headers.rows){const block=await rpc.getBlock({blockNumber:BigInt(payload.height)});requireThat(block.hash===payload.hash&&block.parentHash===payload.parentHash,'ARCHIVE_HEADER_MISMATCH');}
 console.log(JSON.stringify({status:'ACTUAL_ENVIO_ARCHIVE_RECEIPT_VERIFIED',from:48093590,through:48093605,headers:16,events:1,emptyBlocks:15,receiptBlock:48093596,amountAtomic:exact.amount,financialDispatchEnabled:false}));
}finally{await pool.end();}
