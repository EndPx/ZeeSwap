import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { disposableSettlement } from './test-settlement-database.ts';
const requested=process.argv.slice(2);
const tests=requested.length?requested:['test/database.test.ts','test/api.test.ts'];
if(tests.some(t=>!['test/database.test.ts','test/api.test.ts','test/base-integration.test.ts'].includes(t)))throw new Error('Unknown live test file');
const settlement=tests.includes('test/base-integration.test.ts');
if(settlement&&tests.length!==1)throw Error('Settlement tests use a separate fixture branch');
const isolated=settlement?await disposableSettlement():undefined;
const child=spawn(process.execPath,['--import','tsx','--test','--test-concurrency=1',...tests],{
 stdio:'inherit',windowsHide:true,env:{...process.env,
 ZEE_DB_CONFIG:isolated?.configPath??fileURLToPath(new URL('../../.deploy-local/neon-tests.json',import.meta.url)),
 ZEE_RUNTIME_CONFIG:isolated?.runtimePath??fileURLToPath(new URL('../../.deploy-local/neon-tests-runtime.json',import.meta.url))}});
const code=await new Promise<number>(resolve=>{child.once('error',()=>resolve(1));child.once('exit',code=>resolve(code??1));});
try{await isolated?.cleanup();}catch{console.error('Disposable settlement database cleanup failed; inspect its private manifest');process.exitCode=1;}
process.exitCode ||= code;
