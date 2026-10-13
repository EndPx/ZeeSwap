import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { connect, transaction } from '../src/db.ts';
import { requireDevelopment, requirePrimary } from './config.ts';

const primary=process.argv.includes('--production');
const settings=primary?requirePrimary():requireDevelopment(),pool=connect(settings.adminUrl,1);
const path=process.env.ZEE_RUNTIME_CONFIG || fileURLToPath(new URL(primary?'../../.deploy-local/neon-primary-runtime.json':'../../.deploy-local/neon-g2-runtime.json',import.meta.url));
let runtime:Record<string,string>;
try { runtime=JSON.parse(await readFile(path,'utf8')); }
catch(error) {
 if ((error as NodeJS.ErrnoException).code!=='ENOENT') throw error;
 runtime={payloadKeyHex:randomBytes(32).toString('hex'),lookupKeyHex:randomBytes(32).toString('hex'),
  apiPassword:randomBytes(32).toString('base64url'),workerPassword:randomBytes(32).toString('base64url')};
 // Save recoverable local credentials before provisioning their own roles.
 await writeFile(path,JSON.stringify(runtime),{flag:'wx',mode:0o600});
}
try {
 await transaction(pool,async c=>{
  for(const kind of ['api','worker'] as const) {
   const name=`zeeswap_${kind}_${primary?'runtime':'dev'}`,password=runtime[`${kind}Password`];
   if(!/^[A-Za-z0-9_-]{43}$/.test(password)) throw new Error('Invalid generated credential');
   if(!(await c.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[name])).rowCount)
    await c.query(`CREATE ROLE ${name} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
   await c.query(`GRANT zeeswap_${kind} TO ${name}`);
   const uri=new URL(settings.adminUrl);uri.username=name;uri.password=password;
   uri.hostname=uri.hostname.replace(/(?<!-pooler)\./,'-pooler.');
   runtime[`${kind}Url`]=uri.toString();
  }
 });
 await writeFile(path,JSON.stringify(runtime),{mode:0o600});
 for(const kind of ['api','worker']) {
  const app=connect(runtime[`${kind}Url`],1);
  try {
   const client=await app.connect();
   try {
    const stream=(client as any).connection.stream;
    if(!stream.encrypted||!stream.authorized) throw new Error('Verified TLS required');
    const row=(await client.query('SELECT current_user AS role,current_database() AS database')).rows[0];
    console.log(JSON.stringify({...row,tlsVerified:true,pooled:true}));
   } finally {client.release();}
  } finally {await app.end();}
 }
} finally {await pool.end();}
