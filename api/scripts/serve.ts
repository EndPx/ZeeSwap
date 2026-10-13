import { connect } from '../src/db.ts';
import { createApi } from '../src/http-api.ts';
import { runtime } from './runtime.ts';
import { BaseContract,loadBaseRegistry } from '../src/base-contract.ts';
const development=process.argv.includes('--integration');const r=await runtime(development);const pool=connect(r.apiUrl);
const server=createApi({pool,keys:r.keys,wallet:r.wallet,integrationOnly:development,
 baseFeeBudget:development&&!process.argv.includes('--base')?'10000':undefined,allowedOrigin:process.env.ZEE_ALLOWED_ORIGIN,
 base:process.argv.includes('--base')?new BaseContract(loadBaseRegistry()):undefined});
server.listen(Number(process.env.PORT||3031),'127.0.0.1',()=>console.log(`ZeeSwap API listening on loopback; integrationOnly=${development}`));
const stop=()=>server.close(()=>{void pool.end();});process.on('SIGINT',stop);process.on('SIGTERM',stop);
