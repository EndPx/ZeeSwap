/** Run locally with the existing scoped admin credential, never from a service. */
import {readFile,open,lstat} from 'node:fs/promises';
import {resolve,dirname,basename} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {connect} from '../src/db.ts';
import {validateAdminTarget,validateActivationEvidence,validateSourceWindow,checkActivationDatabase,changeControl,reconcileControl,type ActivationEvidence,type SourceWindow,type Intent,type Journal} from '../src/linux-control.ts';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function need(v:unknown,c:string):asserts v{if(!v)throw Error('LINUX_CONTROL_'+c);}
async function pinned(pin:{path:string;sha256:string}){const path=resolve(pin.path),s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink(),'PRIVATE_INPUT_FILE');const bytes=await readFile(path);need(sha(bytes)===pin.sha256,'PRIVATE_INPUT_HASH');return JSON.parse(bytes.toString());}
async function main(){
const [step,input,reconcileJournal]=process.argv.slice(2);need(['check-activation','activate','pause','reconcile'].includes(step)&&input&&(process.argv.length===4||step==='reconcile'&&process.argv.length===5),'EXPLICIT_STEP_AND_LOCAL_CONFIG');
const path=resolve(input);need(path.replaceAll('\\','/').includes('/.deploy-local/live-testnet-20261023/'),'LOCAL_OPERATOR_CONFIG');
const normalized=path.replaceAll('\\','/');need(process.platform==='win32'&&/^[A-Za-z]:\//.test(normalized)||process.platform==='linux'&&/^\/mnt\/[a-z]\//.test(normalized),'LOCAL_WINDOWS_OR_WSL_OPERATOR_MOUNT_REQUIRED');
const configBytes=await readFile(path),config=JSON.parse(configBytes.toString());need(config.version===1&&config.mode==='LOCAL_LINUX_FIRST_CIRCLE_CONTROL','EXACT_LOCAL_CONTROLLER');
const local=(p:string)=>resolve(dirname(path),p),admin=JSON.parse(await readFile(local(config.adminConfig),'utf8')),pool=connect(validateAdminTarget(admin),1);
const configuredJournal=local(config.journalPath),journalPath=step==='pause'?configuredJournal.replace(/\.private\.jsonl$/,`.pause-${Date.now()}-${randomUUID()}.private.jsonl`):reconcileJournal?local(reconcileJournal):configuredJournal;need(dirname(journalPath)===dirname(path)&&basename(journalPath).endsWith('.private.jsonl'),'PRIVATE_JOURNAL_PATH');
let journal:Journal|undefined;
try{
 async function evidence(){const p=await pinned({...config.preflight,path:local(config.preflight.path)}) as ActivationEvidence,w=await pinned({...config.window,path:local(config.window.path)}) as SourceWindow;validateActivationEvidence(p,config.expected);validateSourceWindow(w,p);return p;}
 if(step==='check-activation'){const p=await evidence(),c=await pool.connect();try{await c.query('BEGIN');await checkActivationDatabase(c,p);await c.query('ROLLBACK');console.log(JSON.stringify({status:'LINUX_ACTIVATION_GATES_VERIFIED_PAUSED',mutation:false,firstEpoch:'0'}));}finally{await c.query('ROLLBACK').catch(()=>{});c.release();}}
 else{
  let rows:Record<string,any>[]=[];try{rows=(await readFile(journalPath,'utf8')).trim().split('\n').filter(Boolean).map(row=>JSON.parse(row));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  if(rows.length){need(rows[0]?.configSha256===sha(configBytes),'JOURNAL_CONFIG_BINDING');const intent=rows.findLast(row=>row.event==='TX_INTENT') as Intent|undefined;need(intent,'EXISTING_JOURNAL_NEEDS_OPERATOR_REVIEW');need(step==='reconcile'||step===intent.action,'JOURNAL_ACTION_MISMATCH');journal={async append(value){const f=await open(journalPath,'a',0o600);try{await f.writeFile(JSON.stringify({at:new Date().toISOString(),...value})+'\n');await f.sync();}finally{await f.close();}}};console.log(JSON.stringify({status:'LINUX_CONTROL_READBACK_ONLY_NO_REPLAY',...await reconcileControl(pool,intent,journal)}));}
  else{
   need(step!=='reconcile','NO_ORIGINAL_INTENT');const f=await open(journalPath,'wx',0o600);try{await f.writeFile(JSON.stringify({event:'OPERATOR_INTENT',at:new Date().toISOString(),action:step,configSha256:sha(configBytes),branchId:admin.branchId,database:admin.database})+'\n');await f.sync();}finally{await f.close();}
   journal={async append(value){const fd=await open(journalPath,'a',0o600);try{await fd.writeFile(JSON.stringify({at:new Date().toISOString(),...value})+'\n');await fd.sync();}finally{await fd.close();}}};
   const result=await changeControl(pool,step as 'activate'|'pause',journal,step==='activate'?evidence:undefined);console.log(JSON.stringify({status:'LINUX_CONTROL_RESULT',journalPath,...result}));if(!['ACTIVATION_CONFIRMED','PAUSE_CONFIRMED'].includes(result.outcome))process.exitCode=1;
  }
 }
}catch(e){console.error(JSON.stringify({status:'LINUX_CONTROL_REFUSED_OR_UNKNOWN',reason:e instanceof Error&&e.message.startsWith('LINUX_CONTROL_')?e.message:'READ_PRIVATE_JOURNAL_AND_RECONCILE'}));process.exitCode=1;}finally{await pool.end();}

}
await main().catch(error=>{console.error(JSON.stringify({status:"LINUX_CONTROL_REFUSED_OR_UNKNOWN",reason:error instanceof Error&&error.message.startsWith("LINUX_CONTROL_")?error.message:"VERIFY_PRIVATE_INPUT_OR_JOURNAL"}));process.exitCode=1;});
