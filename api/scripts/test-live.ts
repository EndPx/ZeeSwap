import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const requested=process.argv.slice(2);
const tests=requested.length?requested:['test/database.test.ts','test/api.test.ts'];
if(tests.some(t=>!['test/database.test.ts','test/api.test.ts','test/base-integration.test.ts'].includes(t)))throw new Error('Unknown live test file');
const settlement=tests.includes('test/base-integration.test.ts');
if(settlement&&tests.length!==1)throw Error('Settlement tests use a separate fixture branch');
const child=spawn(process.execPath,['--import','tsx','--test','--test-concurrency=1',...tests],{
 stdio:'inherit',windowsHide:true,env:{...process.env,
 ZEE_DB_CONFIG:fileURLToPath(new URL(settlement?'../../.deploy-local/neon-settlement-tests.json':'../../.deploy-local/neon-tests.json',import.meta.url)),
 ZEE_RUNTIME_CONFIG:fileURLToPath(new URL(settlement?'../../.deploy-local/neon-settlement-tests-runtime.json':'../../.deploy-local/neon-tests-runtime.json',import.meta.url))}});
child.on('exit',code=>{process.exitCode=code??1;});
