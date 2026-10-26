/** Cross-language accepted-quote -> concrete guard binding -> synthetic native raw validation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {marketSnapshotDigest,marketOutput,requireAcceptedMarketQuote,type MarketSnapshot} from '../src/market-pricing.ts';
import {marketNativeRequest,assertMarketNativeAcceptedRequest} from '../src/market-native-runtime.ts';
import {marketRefundRequest} from '../src/market-refund-native-runtime.ts';
import {approvalDigest} from '../src/reverse-authority.ts';
import {PrivateData} from '../src/private-data.ts';

const id='23456789-2345-4345-8345-23456789abcd',snapshotId='12345678-1234-4234-8234-123456789abc';
function fixture(){
 const snapshot:MarketSnapshot={version:1,snapshotId,snapshotSha256:'',source:'Kraken',pair:'ZEC/USDC',retrievedAt:'2026-10-26T00:00:00.000Z',expiresAt:'2026-10-26T00:00:30.000Z',sourcePairs:[
  {pair:'ZEC/USD',providerPair:'XZECZUSD',bid:'1200',ask:'1202',mid:'1201.000000000000'},
  {pair:'USDC/USD',providerPair:'USDCUSD',bid:'0.999',ask:'1.001',mid:'1.000000000000'}]};snapshot.snapshotSha256=marketSnapshotDigest(snapshot);
 const acceptedAt='2026-10-26T00:00:10.000Z',calculated=marketOutput('1000000','BASE_TO_ZCASH',snapshot,Date.parse(acceptedAt));
 const quote={id,direction:'BASE_TO_ZCASH',executionMode:'base-escrow-v1',inputAmount:'1000000',outputAmount:calculated.outputAmount,recipient:'utest1fixture',refundRecipient:'0x'+'2'.repeat(40),acceptedAt,quoteExpiresAt:'2026-10-26T00:02:00.000Z',pricing:{...calculated.pricing,acceptedAt,locked:true},priceMode:'market-reference'};
 const funding={id:'0x'+'a'.repeat(64),token:'0x'+'4'.repeat(40),payer:'0x'+'2'.repeat(40),refundRecipient:quote.refundRecipient,amount:quote.inputAmount,cancellationAvailableAt:'1800000000'};
 const payout={recipient:quote.recipient,amountZatoshi:quote.outputAmount,maxFeeZatoshi:'10000'},proof={transactionHash:'0x'+'b'.repeat(64),blockHeight:90,blockHash:'0x'+'c'.repeat(64)};
 return{snapshot,quote,funding,payout,proof,request:marketNativeRequest(quote,funding,payout,proof,'0x'+'3'.repeat(40))};
}
function python(request:any,validateRaw=false){
 let directory=fileURLToPath(new URL('../../workers/zcash-wallet/',import.meta.url));if(process.platform==='win32')directory='/mnt/'+directory[0]!.toLowerCase()+directory.slice(2).replaceAll('\\','/');
 const script=`import json,sys\nsys.path.insert(0,sys.argv[1])\nfrom market_native_protocol import validate_request\nv=json.load(sys.stdin);q=v['request'];validate_request(q,v['digest'])\n`+(validateRaw?`from prepared_raw import validate_prepared\ntx={'txid':'f'*64,'rawTransaction':'010203','feeZatoshi':'10000','expiryHeight':'150','selectedNotes':[{'pool':'ironwood','txid':'e'*64,'index':0,'value':'200000'}],'outputs':[{'recipient':q['recipient'],'amount':q['amountZatoshi'],'ownChange':False,'index':0},{'recipient':'internal-change','amount':str(200000-int(q['amountZatoshi'])-10000),'ownChange':True,'index':1}]}\np=validate_prepared({'version':'zeeswap_prepared_v1','transactions':[tx]},q,{'capitalNotes':tx['selectedNotes']},{'txid':'f'*64,'expiry_height':150,'ironwood_only_with_10000_zatoshi_fee':True},100,lambda p:{'network':'zcash-testnet','shielded':True,'receiver':p['address']})\nprint(json.dumps({'source':q['base']['amountAtomic'],'amount':p['amount'],'change':p['outputs'][1]['amount']}))\n`:`print('VALID_MARKET_NATIVE_REQUEST')\n`);
 const command=process.platform==='win32'?'wsl.exe':'python3',args=process.platform==='win32'?['-d','Ubuntu-24.04','-e','python3','-c',script,directory]:['-c',script,directory];
 return spawnSync(command,args,{input:JSON.stringify({request,digest:approvalDigest(request)}),encoding:'utf8',timeout:20000});
}
test('Node and independent Python agree on fixed12 snapshot, inverse-ask floor, and native output below legacy minimum',()=>{
 const f=fixture();assert.equal(f.quote.outputAmount,'83111');assert.equal(f.snapshot.snapshotSha256,'a150d27324f0487458b1d0dd2a7f2a40c5958a08be9a888c49be18b86c8e1ad8');
 const result=python(f.request);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/VALID_MARKET_NATIVE_REQUEST/);
});
test('accepted DB quote remains original after feed expiry; concrete guard binds source and native output before stub SDK',async()=>{
 const f=fixture(),keys=new PrivateData(Buffer.alloc(32,1),Buffer.alloc(32,2));
 const row={input_amount:f.quote.inputAmount,output_amount:f.quote.outputAmount,direction:'BASE_TO_ZCASH',execution_mode:'base-escrow-v1',accepted_at:new Date(f.quote.acceptedAt),expires_at:new Date(f.quote.quoteExpiresAt),snapshot_sha256:f.snapshot.snapshotSha256,snapshot:f.snapshot,private_payload:keys.seal(f.quote,`quote:${id}:v1`)};
 const db={query:async()=>({rows:[row]})} as any,accepted=await requireAcceptedMarketQuote(db,keys,id);
 const expected=marketNativeRequest(accepted,f.funding,f.payout,f.proof,f.request.base.contract);assertMarketNativeAcceptedRequest(f.request,expected);
 const result=python(expected,true);assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{source:'1000000',amount:'83111',change:'106889'});
 const tampered=structuredClone(expected);tampered.amountZatoshi='1000000';assert.throws(()=>assertMarketNativeAcceptedRequest(tampered,expected),/ACCEPTED_TERMS/);
});
test('altered recipient, refund, snapshot, source amount, price ratio and acceptance time fail before native raw boundary',()=>{
 for(const mutate of ['recipient','refund','snapshot','source','rate','accept']){const r=fixture().request;
  if(mutate==='recipient')r.recipient='utest1attacker';if(mutate==='refund')r.base.refundRecipient='0x'+'9'.repeat(40);if(mutate==='snapshot')r.quote.pricing.snapshotSha256='e'.repeat(64);if(mutate==='source')r.base.amountAtomic='83111';if(mutate==='rate')r.quote.pricing.rateNumerator='1000000000001';if(mutate==='accept'){r.quote.acceptedAt='2026-10-26T00:00:31.000Z';r.quote.pricing.acceptedAt=r.quote.acceptedAt;}
  const result=python(r);assert.notEqual(result.status,0,mutate);
 }
});
test('market refund independently returns full actual native source, never converted destination units',()=>{
 const f=fixture(),converted=marketOutput('100000','ZCASH_TO_BASE',f.snapshot,Date.parse(f.quote.acceptedAt)),quote={...f.quote,direction:'ZCASH_TO_BASE',executionMode:'base-settlement-v1',inputAmount:'100000',outputAmount:converted.outputAmount,recipient:'0x'+'1'.repeat(40),refundRecipient:'utest1refund',pricing:{...converted.pricing,acceptedAt:f.quote.acceptedAt,locked:true}};
 const row={base_height:90,base_block:'c'.repeat(64)},source={id:f.funding.id,recipient:quote.refundRecipient,row:{deposit_id:'abcdefab-1234-4234-8234-123456789abc',received_amount:'100000',refund_fee:'10000',classification:'EXACT'}};
 const request=marketRefundRequest(quote,row,source,f.proof.transactionHash,f.request.base.contract,f.funding.token);
 assert.equal(request.amountZatoshi,'100000');assert.equal(request.quote.outputAmount,'1198801');
 const result=python(request);assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/VALID_MARKET_NATIVE_REQUEST/);
 const wrong=structuredClone(request);wrong.amountZatoshi=wrong.quote.outputAmount;assert.notEqual(python(wrong).status,0);
});
