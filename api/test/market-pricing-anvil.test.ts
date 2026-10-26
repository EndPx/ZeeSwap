import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {randomUUID} from 'node:crypto';
import {createWalletClient,createPublicClient,http,keccak256,type Hex} from 'viem';
import {privateKeyToAccount,generatePrivateKey} from 'viem/accounts';
import {baseSepolia} from 'viem/chains';
import {BaseContract,publicSettlementId,payoutTypedData,payoutCall,authNonce,type BaseRegistry,type Deployment} from '../src/base-contract.ts';
import {fundingTypedData,fundingCall} from '../src/base-escrow.ts';
import {marketOutput} from '../src/market-pricing.ts';
import {marketFixture} from './market-pricing-fixture.ts';
const binary=process.env.ZEE_MARKET_ANVIL_BIN??'C:/Users/abaym/.foundry/bin/anvil.exe';
test('actual local Anvil market payout differs from source units and cannot execute twice',{skip:!existsSync(binary)},async t=>{
 const portServer=createServer();await new Promise<void>(r=>portServer.listen(0,'127.0.0.1',r));const port=(portServer.address() as any).port;await new Promise<void>((r,j)=>portServer.close(e=>e?j(e):r()));
 const child=spawn(binary,['--host','127.0.0.1','--port',String(port),'--chain-id','84532','--base-fee','0','--silent'],{stdio:'ignore',windowsHide:true});t.after(async()=>{child.kill();await Promise.race([new Promise<void>(r=>child.once('exit',()=>r())),delay(3000)]);});
 const url=`http://127.0.0.1:${port}`,client=createPublicClient({chain:baseSepolia,transport:http(url,{retryCount:0})}),wallet=createWalletClient({chain:baseSepolia,transport:http(url)});let ready=false;for(let n=0;n<50;n++){try{ready=await client.getChainId()===84532;if(ready)break;}catch{}await delay(100);}assert.ok(ready);
 const [admin,recipient,payer]=await wallet.getAddresses(),operator=privateKeyToAccount(generatePrivateKey());await client.waitForTransactionReceipt({hash:await wallet.sendTransaction({account:admin,to:operator.address,value:10n**18n})});
 const mock=JSON.parse(readFileSync(new URL('../../contracts/out/MockUSDC.sol/MockUSDC.json',import.meta.url),'utf8')),settle=JSON.parse(readFileSync(new URL('../../contracts/out/ZeeSwapSettlement.sol/ZeeSwapSettlement.json',import.meta.url),'utf8'));
 async function deploy(artifact:any,args:any[]):Promise<Deployment>{const receipt=await client.waitForTransactionReceipt({hash:await wallet.deployContract({account:admin,abi:artifact.abi,bytecode:artifact.bytecode.object,args})});assert.ok(receipt.contractAddress);return{address:receipt.contractAddress!,transactionHash:receipt.transactionHash,blockNumber:Number(receipt.blockNumber),blockHash:receipt.blockHash,runtimeCodeHash:keccak256((await client.getCode({address:receipt.contractAddress!}))!)};}
 const token=await deploy(mock,[admin,admin]),settlement=await deploy(settle,[token.address,admin,operator.address,operator.address]),registry:BaseRegistry={chainId:84532,rpcUrl:url,deployer:admin,operator:operator.address,contracts:{MockUSDC:token,ZeeSwapSettlement:settlement}},base=new BaseContract(registry,true);
 await client.waitForTransactionReceipt({hash:await wallet.writeContract({account:admin,address:token.address,abi:mock.abi,functionName:'mint',args:[admin,5000000n]})});await client.waitForTransactionReceipt({hash:await wallet.writeContract({account:admin,address:token.address,abi:mock.abi,functionName:'approve',args:[settlement.address,5000000n]})});await client.waitForTransactionReceipt({hash:await wallet.writeContract({account:admin,address:settlement.address,abi:settle.abi,functionName:'depositInventory',args:[5000000n]})});
 const mine=()=>client.request({method:'anvil_mine' as any,params:['0x40'] as any});await mine();await base.preflight();
 const at=Date.now(),snapshot=marketFixture(at),output=marketOutput('100000','ZCASH_TO_BASE',snapshot,at).outputAmount,id=publicSettlementId(randomUUID()),terms={id,token:token.address,recipient,amount:output,nonce:authNonce(id,'Payout'),deadline:String(Math.floor(Date.now()/1000)+7200)},signature=await operator.signTypedData(payoutTypedData(registry,terms));
 await t.test('market output 1200000 is signed and reserved for synthetic 100000-zatoshi source',async()=>{assert.equal(output,'1200000');assert.notEqual(output,'100000');const hash=await wallet.sendTransaction({account:operator,to:settlement.address,data:payoutCall(registry,terms,signature,'RESERVE'),gas:450000n,gasPrice:1000000n});await client.waitForTransactionReceipt({hash});await mine();assert.ok(await base.receipt(hash,'RESERVE',terms));});
 await t.test('expired quote price does not reprice the agreed contract payment; one exact receipt wins',async()=>{
  assert.throws(()=>marketOutput('100000','ZCASH_TO_BASE',snapshot,at+30000),/EXPIRED/);const before=await client.readContract({address:token.address,abi:mock.abi,functionName:'balanceOf',args:[recipient]}) as bigint;
  const hash=await wallet.sendTransaction({account:operator,to:settlement.address,data:payoutCall(registry,terms,signature,'PAY'),gas:450000n,gasPrice:1000000n});await client.waitForTransactionReceipt({hash});await mine();const proof=await base.receipt(hash,'PAY',terms);assert.equal(proof?.amount,'1200000');const after=await client.readContract({address:token.address,abi:mock.abi,functionName:'balanceOf',args:[recipient]}) as bigint;assert.equal(after-before,1200000n);
  await assert.rejects(()=>client.call({account:operator.address,to:settlement.address,data:payoutCall(registry,terms,signature,'PAY')}));assert.equal(await base.state(id),2);
 });
 await t.test('reverse actual Base escrow commits input1000000 while independent native quote remains80000',async()=>{
  const native=marketOutput('1000000','BASE_TO_ZCASH',snapshot,at);assert.equal(native.outputAmount,'80000');const fundingId=publicSettlementId(randomUUID()),latest=await client.getBlock(),cutoff=Number(latest.timestamp)+900,q={id:fundingId,token:token.address,payer,refundRecipient:payer,amount:'1000000',nonce:authNonce(fundingId,'Funding'),fundingCutoff:String(cutoff),cancellationAvailableAt:String(cutoff+7200)},auth=await operator.signTypedData(fundingTypedData(base,q));
  await client.waitForTransactionReceipt({hash:await wallet.writeContract({account:admin,address:token.address,abi:mock.abi,functionName:'mint',args:[payer,1000000n]})});await client.waitForTransactionReceipt({hash:await wallet.writeContract({account:payer,address:token.address,abi:mock.abi,functionName:'approve',args:[settlement.address,1000000n]})});await client.waitForTransactionReceipt({hash:await wallet.sendTransaction({account:payer,to:settlement.address,data:fundingCall(base,q,auth)})});await client.waitForTransactionReceipt({hash:await wallet.writeContract({account:operator,address:settlement.address,abi:settle.abi,functionName:'commitPayout',args:[fundingId],gas:450000n,gasPrice:1000000n})});await mine();assert.equal(await base.state(fundingId),5);assert.equal(await client.readContract({address:settlement.address,abi:settle.abi,functionName:'escrowLiability'}),1000000n);
  // No synthetic native receipt is used to discharge this actual commitment.
  assert.notEqual(q.amount,native.outputAmount);
 });
});
