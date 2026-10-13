import { connect } from '../src/db.ts';
import { createApi } from '../src/http-api.ts';
import { runtime } from './runtime.ts';
const development=process.argv.includes('--integration');const r=await runtime(development);const pool=connect(r.apiUrl);
const server=createApi({pool,keys:r.keys,wallet:r.wallet,integrationOnly:development,
 baseFeeBudget:development?'10000':undefined,allowedOrigin:process.env.ZEE_ALLOWED_ORIGIN});
server.listen(Number(process.env.PORT||3031),'127.0.0.1',()=>console.log(`ZeeSwap API listening on loopback; integrationOnly=${development}`));
const stop=()=>server.close(()=>{void pool.end();});process.on('SIGINT',stop);process.on('SIGTERM',stop);
