/** Explicit local current-source activation. Financial worker release stays6ebb;
 * this entry never labels a single proof as a historical stability window. */
import {administerServiceLocal} from './administer-testnet-service-policy-local.ts';
const [action,path,sha]=process.argv.slice(2);
if(process.argv.length!==5||!['activate','reconcile'].includes(action!))throw Error('Explicit activate/reconcile local-config/raw-SHA required');
administerServiceLocal(action==='activate'?'activate-current':'activation-current-reconcile',path!,sha!).then(v=>console.log(JSON.stringify(v))).catch(()=>{console.error(JSON.stringify({status:'CURRENT_SOURCE_LOCAL_STOPPED_RECONCILE_ORIGINAL_INTENT_NO_REPLAY',stabilityClaimed:false}));process.exitCode=1;});
