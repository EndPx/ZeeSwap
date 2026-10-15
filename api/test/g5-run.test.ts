import test from 'node:test';
import assert from 'node:assert/strict';
import {g5Binding,g5Direction,requireG5Target,validateG5State,requireG5Next,validateG5Accounts,expectedG5Balances,validateG5OpeningLedger,validateG5PhysicalBase,validateG5WalletBalances,requireG5CommandConfig,G5_CAPITAL,G5_TARGET,type G5State} from '../src/g5-run.ts';
const config={version:1,runId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',branchId:G5_TARGET.branchId,baseFeeBudget:'100000000000000',forward:{recipient:'base-recipient',refundRecipient:'shielded-refund'},reverseOrders:Array.from({length:10},(_,i)=>({sequence:(i+1)*2,configFile:`/private/order-${(i+1)*2}.json`}))};
test('G5 validates actual adapter config arguments across Windows UNC and Linux paths',()=>{
 requireG5CommandConfig(['-d','Ubuntu-24.04','--','python3','adapter.py','--config','/home/operator/raw.json'],'\\\\wsl.localhost\\Ubuntu-24.04\\home\\operator\\raw.json');
 requireG5CommandConfig(['--config','/home/operator/raw.json'],'\\\\wsl$\\Ubuntu-24.04\\home\\operator\\raw.json');
 requireG5CommandConfig(['adapter.py','--config','/mnt/d/private/raw.json'],'D:\\private\\raw.json');
 assert.throws(()=>requireG5CommandConfig(['--config','/home/operator/other.json'],'/home/operator/raw.json'),/BINDING/);
 assert.throws(()=>requireG5CommandConfig(['--config','/home/operator/raw.json','--config','/other.json'],'/home/operator/raw.json'));
 assert.throws(()=>requireG5CommandConfig(['bash','-lc','python --config /home/operator/raw.json'],'/home/operator/raw.json'));
});
function state():G5State{return {version:1,runId:config.runId,binding:g5Binding(config),openingEventId:'opening',orders:[]};}
test('G5 pins the isolated physical run and rejects all historical branch and runtime endpoints',()=>{
 const target={...G5_TARGET,adminUrl:'postgres://user@'+G5_TARGET.host+'/db'};requireG5Target(target,['postgres://user@'+G5_TARGET.host.replace('.','-pooler.')+'/db']);
 for(const change of [{branchId:'br-small-sound-aozx7xa6'},{branchName:'production'},{projectId:'other'},{adminUrl:'postgres://user@attacker.example/db'}])assert.throws(()=>requireG5Target({...target,...change}),/EXACT_BRANCH/);
 assert.throws(()=>requireG5Target(target,['postgres://user@historical-pooler.example/db']),/RUNTIME_BRANCH/);
});
test('G5 has exactly20 alternating immutable slots, each reverse with its own config',()=>{
 assert.deepEqual(Array.from({length:20},(_,i)=>g5Direction(i+1)),Array.from({length:10},()=>['ZCASH_TO_BASE','BASE_TO_ZCASH']).flat());
 for(const n of [0,21,NaN,1.5])assert.throws(()=>g5Direction(n));
 assert.throws(()=>g5Binding({...config,reverseOrders:config.reverseOrders.slice(1)}));
 assert.throws(()=>g5Binding({...config,reverseOrders:config.reverseOrders.map(r=>({...r,configFile:'same'}))}));
 const s=state();validateG5State(s,config);assert.throws(()=>validateG5State(s,{...config,forward:{...config.forward,recipient:'changed'}}),/BINDING/);
});
test('G5 rejects skipped orders, duplicate economic identities and unverified predecessors',()=>{
 const s=state();assert.equal(requireG5Next(s,1),undefined);assert.throws(()=>requireG5Next(s,2));
 s.orders.push({sequence:1,direction:'ZCASH_TO_BASE',owner:'first',orderId:'id1'});assert.equal(requireG5Next(s,1),s.orders[0]);assert.throws(()=>requireG5Next(s,2),/OUTSTANDING/);
 s.orders.push({sequence:2,direction:'BASE_TO_ZCASH',owner:'second',orderId:'id2'});assert.throws(()=>validateG5State(s,config),/PREDECESSOR/);
 s.orders[0].verified=true;validateG5State(s,config);s.orders[1].orderId='id1';assert.throws(()=>validateG5State(s,config),/DUPLICATE/);
 s.orders[1].orderId='id2';s.orders[1].owner='first';assert.throws(()=>validateG5State(s,config));
 s.closed=true;assert.throws(()=>requireG5Next(s,2),/CLOSED/);
});
test('G5 prefunds20 payments without treating settled proceeds or old branch books as capital',()=>{
 const opening=expectedG5Balances(0,0,'0');assert.deepEqual(opening,G5_CAPITAL.map(r=>[...r]));
 const final=expectedG5Balances(10,10,'30000000000000');assert.deepEqual(final,[['mockUSDC','principal','0'],['TAZ','principal','0'],['TAZ','fee','0'],['baseETH','fee','270000000000000']]);
 const accounts=final.map(([asset,purpose,balance])=>({asset,purpose,balance,reserved:'0'}));validateG5Accounts(accounts,10,10,'30000000000000');
 assert.throws(()=>validateG5Accounts(accounts.map(a=>a.asset==='mockUSDC'?{...a,balance:'1000000'}:a),10,10,'30000000000000'),/ACCOUNTING/);
 assert.throws(()=>validateG5Accounts([...accounts,{asset:'TAZ',purpose:'fee',balance:'490000',reserved:'0'}],10,10,'30000000000000'));
 assert.throws(()=>expectedG5Balances(0,1,'0'));assert.throws(()=>expectedG5Balances(10,10,'300000000000001'),/CAP/);
 assert.throws(()=>validateG5Accounts(accounts.map(a=>({...a,reserved:'1'})),10,10,'30000000000000'));
});
test('G5 capitalization recovery accepts exactly the original eight balanced opening entries',()=>{
 const rows=G5_CAPITAL.flatMap(([asset,purpose,amount])=>[{event_id:'opening',asset,bucket:purpose+':available',amount},{event_id:'opening',asset,bucket:purpose+':operator-capital',amount:'-'+amount}]);
 validateG5OpeningLedger(rows,'opening');assert.throws(()=>validateG5OpeningLedger(rows,'new-event'));
 assert.throws(()=>validateG5OpeningLedger([...rows,...rows],'opening'));
 assert.throws(()=>validateG5OpeningLedger(rows.map((r,i)=>i===0?{...r,amount:'10000000'}:r),'opening'));
});
test('G5 reconciles the full physical contract and gas baselines, including unreconciled source proceeds',()=>{
 const opening={inventory:'10000000',operatorGas:'993000000000000'},physical={inventory:'10000000',available:'10000000',tokenBalance:'10000000',escrowLiability:'0',gas:'963000000000000'};
 validateG5PhysicalBase(opening,10,10,'30000000000000',physical);
 // An inequality against the remaining zero book inventory would miss all of
 // these unexplained changes, including an extra shared-operator gas spend.
 for(const change of [{inventory:'9900000'},{tokenBalance:'9999999'},{available:'9999999'},{escrowLiability:'100000'},{gas:'962999999999999'},{gas:'963000000000001'}])assert.throws(()=>validateG5PhysicalBase(opening,10,10,'30000000000000',{...physical,...change}),/UNEXPLAINED/);
 validateG5PhysicalBase(opening,1,0,'1000',{inventory:'9900000',available:'9900000',tokenBalance:'9900000',escrowLiability:'0',gas:'992999999999000'});
});
test('G5 partitions every live TAZ note by wallet and matches source proceeds to canonical deposit identities',()=>{
 const s=state(),fresh={observedAt:new Date().toISOString(),scannedHeight:100,tipHash:'b'.repeat(64)};
 s.openingCapital=Array.from({length:10},(_,i)=>({sequence:(i+1)*2,pool:'ironwood',txid:'a'.repeat(64),index:i,amount:'110000',ufvkSha256:String(i),depositUfvkSha256:'view'}));
 const source=[{pool:'ironwood',txid:'c'.repeat(64),index:0,value:'100000'}];
 const proof={version:1,runId:s.runId,reverse:(s.openingCapital as any[]).map((n,i)=>({...fresh,sequence:n.sequence,ufvkSha256:n.ufvkSha256,spendableZatoshi:i===0?'0':'110000',notes:i===0?[]:[{pool:n.pool,txid:n.txid,index:n.index,value:n.amount}]})),deposit:{...fresh,ufvkSha256:'view',spendableZatoshi:'100000',notes:source}};
 validateG5WalletBalances(proof,s,source,1);
 const mutate=()=>JSON.parse(JSON.stringify(proof));
 let p=mutate();p.reverse[0].spendableZatoshi='110000';assert.throws(()=>validateG5WalletBalances(p,s,source,1),/REVERSE_WALLET/);
 p=mutate();p.reverse[1].notes[0].index=8;assert.throws(()=>validateG5WalletBalances(p,s,source,1),/REVERSE_WALLET/);
 p=mutate();p.reverse[1].ufvkSha256='other';assert.throws(()=>validateG5WalletBalances(p,s,source,1),/IDENTITY/);
 p=mutate();p.deposit.notes=[...source,...source];assert.throws(()=>validateG5WalletBalances(p,s,source,1),/SOURCE_PROCEEDS/);
 p=mutate();p.deposit.notes[0].txid='d'.repeat(64);assert.throws(()=>validateG5WalletBalances(p,s,source,1),/SOURCE_PROCEEDS/);
 p=mutate();p.reverse[0].observedAt=new Date(Date.now()-300001).toISOString();assert.throws(()=>validateG5WalletBalances(p,s,source,1),/STALE/);
});
