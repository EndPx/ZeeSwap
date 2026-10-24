/** Local Windows/WSL admin only. Existing intent always means readback, never replay. */
import {readFile,open,lstat} from 'node:fs/promises';
import {resolve,dirname,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {validateReplacementExpiryReceipt} from '../src/native-circle-replacement.ts';
import {connect} from '../src/db.ts';
import {validateAdminTarget,type Journal} from '../src/linux-control.ts';
import {validateContinuationApproval,requireContinuationApiHealth,validateContinuationWindow,validateContinuationPreflight,checkContinuationDatabase,resumeContinuation,reconcileContinuation,type ContinuationIntent} from '../src/native-circle-continuation.ts';
function need(v:unknown,c:string):asserts v{if(!v)throw Error('LINUX_CONTINUATION_'+c);}
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
async function main(){
 const [step,input]=process.argv.slice(2);need(['check','resume','reconcile'].includes(step!)&&input&&process.argv.length===4,'EXPLICIT_LOCAL_COMMAND');
 const path=resolve(input),normalized=path.replaceAll('\\','/');need(normalized.includes('/.deploy-local/live-testnet-20261023/')&&(process.platform==='win32'&&/^[A-Za-z]:\//.test(normalized)||process.platform==='linux'&&/^\/mnt\/[a-z]\//.test(normalized)),'LOCAL_OPERATOR_ONLY');
 const bytes=await readFile(path),config=JSON.parse(bytes.toString());need(config.version===1&&config.mode==='LOCAL_POST_REFUND_ONE_CIRCLE_CONTROL'||config.version===2&&config.mode==='LOCAL_POST_REFUND_UNFUNDED_REPLACEMENT_CONTROL','EXACT_LOCAL_CONFIG');const local=(p:string)=>resolve(dirname(path),p);
 async function pinned(pin:{path:string;sha256:string}){const file=local(pin.path),stat=await lstat(file);need(stat.isFile()&&!stat.isSymbolicLink(),'PRIVATE_PIN_FILE');const data=await readFile(file);need(sha(data)===pin.sha256,'PRIVATE_PIN_HASH');return JSON.parse(data.toString());}
 const admin=JSON.parse(await readFile(local(config.adminConfig),'utf8')),pool=connect(validateAdminTarget(admin),1),journalPath=local(config.journalPath);need(dirname(journalPath)===dirname(path)&&basename(journalPath).endsWith('.private.jsonl'),'PRIVATE_JOURNAL');
 const journal:Journal={async append(value){const f=await open(journalPath,'a',0o600);try{await f.writeFile(JSON.stringify({at:new Date().toISOString(),...value})+'\n');await f.sync();}finally{await f.close();}}};
 try{
  let prior:any[]=[];try{prior=(await readFile(journalPath,'utf8')).split('\n').filter(Boolean).map(x=>JSON.parse(x));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  if(prior.length){need(prior[0]?.configSha256===sha(bytes),'ORIGINAL_CONFIG_REQUIRED');const intent=prior.findLast(x=>x.event==='TX_INTENT') as ContinuationIntent|undefined;need(intent,'ORIGINAL_DURABLE_INTENT_REQUIRED');console.log(JSON.stringify({status:'CONTINUATION_READBACK_ONLY_NO_REPLAY',...await reconcileContinuation(pool,intent,journal)}));return;}
  need(step!=='reconcile','NO_ORIGINAL_INTENT');const approval=await pinned(config.approval);validateContinuationApproval(approval);need(config.version===approval.version,'CONFIG_AUTHORITY_VERSION');
  async function evidence(){await requireContinuationApiHealth(config.approval.sha256,approval);validateContinuationApproval(approval);if(approval.version===2)validateReplacementExpiryReceipt(await pinned(config.expiryReceipt),approval,config.expiryReceipt.sha256);validateContinuationWindow(await pinned(config.window),approval,config.approval.sha256);validateContinuationPreflight(await pinned(config.preflight),approval,config.approval.sha256);}
  if(step==='check'){await evidence();const c=await pool.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await checkContinuationDatabase(c,approval);await c.query('ROLLBACK');console.log(JSON.stringify({status:'POST_REFUND_CONTINUATION_GATES_VERIFIED_PAUSED',mutation:false}));}finally{await c.query('ROLLBACK').catch(()=>{});c.release();}return;}
  const f=await open(journalPath,'wx',0o600);try{await f.writeFile(JSON.stringify({event:'OPERATOR_INTENT',at:new Date().toISOString(),configSha256:sha(bytes),approvalSha256:config.approval.sha256})+'\n');await f.sync();}finally{await f.close();}
  const result=await resumeContinuation(pool,approval,config.approval.sha256,journal,evidence);console.log(JSON.stringify({status:'POST_REFUND_CONTINUATION_RESULT',...result}));if(result.outcome!=='CONTINUATION_CONFIRMED')process.exitCode=1;
 }finally{await pool.end();}
}
await main().catch(e=>{console.error(JSON.stringify({status:'POST_REFUND_CONTINUATION_REFUSED_OR_UNKNOWN',reason:e instanceof Error&&e.message.startsWith('LINUX_CONTINUATION_')?e.message:'VERIFY_PRIVATE_JOURNAL_AND_RECONCILE'}));process.exitCode=1;});
