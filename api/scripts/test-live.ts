import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const requested=process.argv.slice(2);
const tests=requested.length?requested:['test/database.test.ts','test/api.test.ts'];
if(tests.some(t=>!['test/database.test.ts','test/api.test.ts'].includes(t)))throw new Error('Unknown live test file');
const child=spawn(process.execPath,['--import','tsx','--test','--test-concurrency=1',...tests],{
 stdio:'inherit',windowsHide:true,env:{...process.env,
 ZEE_DB_CONFIG:fileURLToPath(new URL('../../.deploy-local/neon-tests.json',import.meta.url)),
 ZEE_RUNTIME_CONFIG:fileURLToPath(new URL('../../.deploy-local/neon-tests-runtime.json',import.meta.url))}});
child.on('exit',code=>{process.exitCode=code??1;});
