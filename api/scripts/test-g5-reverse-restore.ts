import { spawn } from 'node:child_process';
import { disposableSettlement } from './test-settlement-database.ts';
const isolated=await disposableSettlement();
try{
 const child=spawn(process.execPath,['--import','tsx','--test','--test-concurrency=1','test/g5-reverse-restore.test.ts'],{
  stdio:'inherit',windowsHide:true,env:{...process.env,ZEE_DB_CONFIG:isolated.configPath,ZEE_RUNTIME_CONFIG:isolated.runtimePath}});
 process.exitCode=await new Promise<number>(resolve=>{child.once('error',()=>resolve(1));child.once('exit',code=>resolve(code??1));});
}finally{await isolated.cleanup();}
