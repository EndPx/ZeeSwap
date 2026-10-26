/** Root review helper: reads accepted terms/stored COMMIT and writes a private candidate only. */
import {readFile,lstat,realpath,open} from 'node:fs/promises';
import {connect} from '../src/db.ts';
import {PrivateData} from '../src/private-data.ts';
import {BaseContract} from '../src/base-contract.ts';
import {escrowTerms} from '../src/base-escrow.ts';
import {reversePayoutTerms} from '../src/reverse-settlement.ts';
import {approvalDigest} from '../src/reverse-authority.ts';
import {loadMarketNative,marketNativeDirectory,marketNativeRequest} from '../src/market-native-runtime.ts';
import {requireAcceptedMarketQuote} from '../src/market-pricing.ts';
import {requireMarketPolicyWorkerOrder,type MarketWorkerOrderContext} from '../src/market-policy-worker.ts';

try{
 const [profile,id]=process.argv.slice(2);if(!profile||!id||process.argv.length!==4)throw Error('MARKET_APPROVAL_PREVIEW_ARGUMENTS');
 const loaded=await loadMarketNative(profile),directory=marketNativeDirectory(loaded,id),statePath=directory+'/state.private.json',s=await lstat(statePath);
 if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o027)!==0||await realpath(statePath)!==statePath)throw Error('MARKET_APPROVAL_PREVIEW_STATE');
 const state=JSON.parse(await readFile(statePath,'utf8')),context=state.marketContext as MarketWorkerOrderContext;
 if(state.orderId!==id||context.policySha256!==loaded.c.marketPolicySha256)throw Error('MARKET_APPROVAL_PREVIEW_POLICY');
 const {runtime,registry}=loaded.verified,pool=connect(runtime.workerUrl,1),keys=new PrivateData(Buffer.from(runtime.payloadKeyHex,'hex'),Buffer.from(runtime.lookupKeyHex,'hex')),base=new BaseContract(registry);
 try{
  await requireMarketPolicyWorkerOrder(pool,context,id);const quote=await requireAcceptedMarketQuote(pool,keys,id,context);
  // No observation publication, signer, calculation, initialization or broadcast.
  // Fresh canonical COMMIT authority is rechecked by the actual native preflight.
  const funding=await escrowTerms(pool,keys,base,id),payout=await reversePayoutTerms(pool,keys,id),commit=(await pool.query('SELECT * FROM zee.escrow_commits WHERE order_id=$1 AND confirmed',[id])).rows[0];
  if(!commit)throw Error('MARKET_APPROVAL_PREVIEW_COMMIT');const request=marketNativeRequest(quote,funding,payout,keys.open(commit.receipt_payload,`escrow-proof:${id}:v1`),registry.contracts.ZeeSwapSettlement.address),output=directory+'/candidate-approved.private.json';
  const file=await open(output,'wx',0o600);try{await file.writeFile(JSON.stringify(request,null,2));await file.sync();}finally{await file.close();}
  const dir=await open(directory,'r');try{await dir.sync();}finally{await dir.close();}
  console.log(JSON.stringify({status:'MARKET_NATIVE_PRIVATE_CANDIDATE_WRITTEN',orderId:id,approvedDigest:approvalDigest(request),financialAction:false,sourceProofFresh:false}));
 }finally{await pool.end();}
}catch{console.error('MARKET_NATIVE_APPROVAL_PREVIEW_REFUSED');process.exitCode=1;}
