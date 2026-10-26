import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {createPublicClient,createWalletClient,http,keccak256,encodeFunctionData,type Hex} from 'viem';
import {privateKeyToAccount,generatePrivateKey} from 'viem/accounts';
import {baseSepolia} from 'viem/chains';
import {CanonicalBridgeBase,bridgeAbi,bridgeDomain,mintTypes,redemptionTypes,mintNonce,redemptionNonce} from '../src/bridge/adapters/base.ts';
import {validateBridgeBaseProfile,type BridgeBaseProfile} from '../src/bridge/adapters/profile.ts';
import {makeOrder,emptyBooks,applyEvent,coverage} from '../src/bridge/model.ts';
import {CastBridgeBaseSigner} from '../src/bridge/adapters/cast.ts';
import {PrivateData} from '../src/private-data.ts';
import type {BridgeCastProfile,FilePin} from '../src/bridge/adapters/profile.ts';

const anvil=process.env.ZEE_BRIDGE_ANVIL_BIN??'C:/Users/abaym/.foundry/bin/anvil.exe';
test('real local Anvil bridge canonical reader, mint/cancel exclusion, authenticated burn and acknowledgment',{skip:!existsSync(anvil)},async t=>{
 const portServer=createServer();await new Promise<void>(r=>portServer.listen(0,'127.0.0.1',r));const port=(portServer.address() as any).port;await new Promise<void>((r,j)=>portServer.close(e=>e?j(e):r()));
 const child=spawn(anvil,['--host','127.0.0.1','--port',String(port),'--chain-id','84532','--base-fee','0','--silent'],{stdio:'ignore',windowsHide:true});
 t.after(async()=>{child.kill();await Promise.race([new Promise<void>(r=>child.once('exit',()=>r())),delay(3000)]);});
 const url=`http://127.0.0.1:${port}`,client=createPublicClient({chain:baseSepolia,transport:http(url,{retryCount:0})}),wallet=createWalletClient({chain:baseSepolia,transport:http(url)});
 let ready=false;for(let i=0;i<50;i++){try{if(await client.getChainId()===84532){ready=true;break;}}catch{}await delay(100);}assert.ok(ready,'invocation-owned Anvil ready');
 const [admin,payer]=await wallet.getAddresses(),operatorKey=generatePrivateKey(),authorizerKey=generatePrivateKey(),operator=privateKeyToAccount(operatorKey),authorizer=privateKeyToAccount(authorizerKey);
 await client.waitForTransactionReceipt({hash:await wallet.sendTransaction({account:admin,to:operator.address,value:10n**18n})});
 const artifact=JSON.parse(readFileSync(new URL('../../contracts/out/ZeeSwapBridge.sol/ZeeSwapBridge.json',import.meta.url),'utf8'));
 const deployed=await client.waitForTransactionReceipt({hash:await wallet.deployContract({account:admin,abi:artifact.abi,bytecode:artifact.bytecode.object,args:[admin,operator.address,authorizer.address]})});assert.ok(deployed.contractAddress);
 const contract=deployed.contractAddress!,profile:BridgeBaseProfile={version:1,mode:'BRIDGE_BASE_TESTNET',chainId:84532,rpcUrls:[url,url],contractAddress:contract,runtimeCodeHash:keccak256((await client.getCode({address:contract}))!),deployment:{transactionHash:deployed.transactionHash,blockHeight:Number(deployed.blockNumber),blockHash:deployed.blockHash},admin,operator:operator.address,authorizer:authorizer.address,maximumObservationAgeSeconds:60,maximumGas:'450000',gasPriceWei:'20000000',maximumTransactionCostWei:'10000000000000',minimumGasBalanceWei:'10000000000000',principalAccount:'test:bridge-principal',feeAccount:'test:bridge-fee',swapAccount:'test:swap'};
 const base=new CanonicalBridgeBase(profile,true),mine=()=>client.request({method:'anvil_mine' as any,params:['0x40'] as any});await mine();
 await t.test('canonical finalized deployment, roles, 8 decimals, paused counters and bytecode pin',async()=>{
  const anchor=await base.finalized(),snapshot=await base.readAt(anchor);assert.equal(snapshot.paused,true);assert.equal(snapshot.supply,'0');assert.equal(snapshot.unpaid,'0');
  await assert.rejects(()=>new CanonicalBridgeBase({...profile,runtimeCodeHash:('0x'+'ff'.repeat(32)) as Hex},true).readAt(anchor),/IDENTITY/);
  assert.throws(()=>validateBridgeBaseProfile(profile),/RPC_SCOPE/);
 });
 await client.waitForTransactionReceipt({hash:await wallet.writeContract({account:admin,address:contract,abi:artifact.abi,functionName:'unpause'})});
 await mine();
 const root=await mkdtemp(join(tmpdir(),'zee-bridge-cast-'));t.after(()=>rm(root,{recursive:true,force:true}));const cast=process.env.ZEE_BRIDGE_CAST_BIN??'C:/Users/abaym/.foundry/bin/cast.exe',password=randomBytes(24).toString('hex'),passwordPath=join(root,'password.private');await writeFile(passwordPath,password,{mode:0o600});
 const pin=async(path:string):Promise<FilePin>=>({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')});
 for(const [name,key]of [['bridge-operator',operatorKey],['bridge-authorizer',authorizerKey]])try{await promisify(execFile)(cast,['wallet','import',name,'--keystore-dir',root,'--private-key',key,'--unsafe-password',password],{windowsHide:true,timeout:60000});}catch{throw Error('BRIDGE_SYNTHETIC_CAST_IMPORT_FAILED');}
 const signerProfile:BridgeCastProfile={version:1,mode:'BRIDGE_CAST_TESTNET',enabled:true,root,cast:await pin(cast),operatorAccount:'bridge-operator',authorizerAccount:'bridge-authorizer',operatorKeystore:await pin(join(root,'bridge-operator')),authorizerKeystore:await pin(join(root,'bridge-authorizer')),operatorPassword:await pin(passwordPath),authorizerPassword:await pin(passwordPath),journalRoot:join(root,'journal')};
 const signer=new CastBridgeBaseSigner(base,signerProfile,new PrivateData(randomBytes(32),randomBytes(32)));
 await t.test('production signing stays gated until concrete native authority is qualified',async()=>{
  const production=new CanonicalBridgeBase({...profile,rpcUrls:['https://primary.invalid','https://independent.invalid']}),blocked=new CastBridgeBaseSigner(production,signerProfile,new PrivateData(randomBytes(32),randomBytes(32)));
  await assert.rejects(()=>blocked.authorize('Mint',{} as any,emptyBooks()),/NATIVE_AUTHORITY_NOT_QUALIFIED/);await assert.rejects(()=>blocked.prepare('ACK',{} as any,emptyBooks()),/NATIVE_AUTHORITY_NOT_QUALIFIED/);await assert.rejects(()=>blocked.broadcast({} as any,emptyBooks()),/NATIVE_AUTHORITY_NOT_QUALIFIED/);
  assert.throws(()=>new CanonicalBridgeBase({...profile,rpcUrls:['https://primary.invalid','https://independent.invalid']},true),/LOCAL_CHAIN_ONLY/);
 });
 const b={...emptyBooks(),paused:false,feeCapital:'10000',principalAccount:profile.principalAccount,feeAccount:profile.feeAccount,swapAccount:profile.swapAccount},o=makeOrder({direction:'TAZ_TO_ZEETAZ',amountAtomic:'100000',recipient:payer,refundRecipient:'synthetic:shielded-refund'},'00'.repeat(32),'local-anvil-key',Date.now());
 o.status='DEPOSIT_FINALIZED';o.source={network:'zcash-testnet',transactionHash:'aa'.repeat(32),blockHeight:10,blockHash:'bb'.repeat(32)};b.orders[o.id]=o;b.controlled='100000';
 b.pair={zcash:{height:100,hash:'bb'.repeat(32),observedAt:new Date().toISOString()},base:await base.finalized()};
 const minted=await signer.prepare('MINT',o,b),mintTx=await signer.broadcast(minted,b);await client.waitForTransactionReceipt({hash:mintTx});await mine();
 b.pair={zcash:{height:100,hash:'bb'.repeat(32),observedAt:new Date().toISOString()},base:await base.finalized()};
 await t.test('actual minted event/transaction/runtime is independently bound before book supply changes',async()=>{
  const event=await base.verify({kind:'MINT',transactionHash:mintTx},o,b);applyEvent(b,event,Date.now());assert.equal(b.supply,'100000');assert.equal((await base.readAt(b.pair!.base)).supply,'100000');assert.equal(coverage(b).covered,true);
  await signer.reconcile(minted,b.pair);assert.deepEqual(await signer.prepare('MINT',{...o,status:'DEPOSIT_FINALIZED'},b),minted);await assert.rejects(()=>signer.broadcast(minted,b),/ORIGINAL_REQUIRED|RECONCILIATION/);
  await assert.rejects(()=>base.verify({kind:'MINT',transactionHash:mintTx},{...o,recipient:admin},b),/BINDING/);
  await assert.rejects(()=>client.simulateContract({account:operator,address:contract,abi:bridgeAbi,functionName:'cancelMint',args:[o.commitment as Hex]}));
 });
 const r=makeOrder({direction:'ZEETAZ_TO_TAZ',amountAtomic:'100000',recipient:'synthetic:shielded-recipient',payer},'00'.repeat(32),'local-burn-key',Date.now()),terms={id:r.commitment as Hex,payer,amount:100000n,payoutCommitment:r.commitment as Hex,nonce:redemptionNonce(r.commitment as Hex),deadline:BigInt(Math.floor(Date.now()/1000)+300)};
 const signature=await authorizer.signTypedData({domain:bridgeDomain(profile),types:redemptionTypes,primaryType:'Redemption',message:terms}),calldata=encodeFunctionData({abi:bridgeAbi,functionName:'requestRedemption',args:[terms,signature]});
 r.status='AWAITING_BURN';r.funding={kind:'authenticated-burn',network:'base-sepolia',chainId:84532,contract,token:contract,calldata,signature,terms:{...terms,amount:'100000',nonce:terms.nonce.toString(),deadline:terms.deadline.toString()}};b.orders[r.id]=r;
 const burnTx=await wallet.sendTransaction({account:payer,to:contract,data:calldata});await client.waitForTransactionReceipt({hash:burnTx});await mine();b.pair.base=await base.finalized();
 await t.test('real authenticated burn creates exact unpaid liability and checks payer/private commitment',async()=>{
  const event=await base.verify({kind:'BURN',transactionHash:burnTx},r,b);applyEvent(b,event,Date.now());assert.equal(b.supply,'0');assert.equal(coverage(b).unpaidRedemptionsZatoshi,'100000');const snapshot=await base.readAt(b.pair!.base);assert.equal(snapshot.supply,'0');assert.equal(snapshot.unpaid,'100000');
  await assert.rejects(()=>base.verify({kind:'BURN',transactionHash:burnTx},{...r,payer:admin},b),/BINDING/);await base.assertCanonicalOrder(r,b);
 });
 const historicalPair=structuredClone(b.pair),syntheticDelivered={...r,status:'COMPLETED' as const,destination:{network:'zcash-testnet' as const,transactionHash:'dd'.repeat(32),blockHeight:50,blockHash:'bb'.repeat(32)}};
 const acknowledged=await signer.prepare('ACK',syntheticDelivered,b);await client.waitForTransactionReceipt({hash:await signer.broadcast(acknowledged,b)});await mine();b.pair.base=await base.finalized();await signer.reconcile(acknowledged,b.pair);
 await t.test('actual acknowledgment closes contract counter and permanently blocks a stale-book payout',async()=>{assert.equal((await base.readAt(b.pair!.base)).unpaid,'0');assert.equal(coverage(b).unpaidRedemptionsZatoshi,'100000','synthetic native leg remains unconfirmed; no local fictional close');
  await base.verify({kind:'BURN',transactionHash:burnTx},r,b);await assert.rejects(()=>base.assertCanonicalOrder(r,b),/ALREADY_ACKNOWLEDGED/);
  await assert.rejects(()=>base.assertCanonicalOrder(r,{...b,pair:historicalPair}),/ALREADY_ACKNOWLEDGED/);
 });
 await t.test('actual journaled permanent cancellation excludes every later mint for the same deposit',async()=>{
  const cancelled=makeOrder({direction:'TAZ_TO_ZEETAZ',amountAtomic:'100000',recipient:payer,refundRecipient:'synthetic:shielded-refund'},'00'.repeat(32),'cancel-anvil-key',Date.now());cancelled.status='DEPOSIT_FINALIZED';cancelled.source={network:'zcash-testnet',transactionHash:'cc'.repeat(32),blockHeight:11,blockHash:'bb'.repeat(32)};b.orders[cancelled.id]=cancelled;
  const original=await signer.prepare('CANCEL',cancelled,b),tx=await signer.broadcast(original,b);await client.waitForTransactionReceipt({hash:tx});await mine();b.pair!.base=await base.finalized();
  applyEvent(b,await base.verify({kind:'CANCEL',transactionHash:tx},cancelled,b),Date.now());assert.equal(cancelled.status,'CANCELLED');await signer.reconcile(original,b.pair);await base.assertCanonicalOrder(cancelled,b);
  const terms={id:cancelled.commitment as Hex,recipient:payer,amount:100000n,nonce:mintNonce(cancelled.commitment as Hex),deadline:BigInt(Math.floor(Date.now()/1000)+3600)},signature=await authorizer.signTypedData({domain:bridgeDomain(profile),types:mintTypes,primaryType:'Mint',message:terms});
  await assert.rejects(()=>client.simulateContract({account:operator,address:contract,abi:bridgeAbi,functionName:'mint',args:[terms,signature]}));
 });
});
