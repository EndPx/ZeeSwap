import {test,expect,type Page} from '@playwright/test';
import {bech32m} from 'bech32';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import QRCode from 'qrcode';
const require=createRequire(import.meta.url),{PNG}=createRequire(require.resolve('qrcode'))('pngjs');
const address=bech32m.encode('utest',bech32m.toWords(new Uint8Array(64).fill(7)),512),id='22222222-2222-4222-8222-222222222222',token='a'.repeat(43),memo='{"v":1,"ref":"11111111-1111-4111-8111-111111111111"}';
async function fixture(page:Page,attempt:string|null=null,heightOnly:'fresh'|'cutoff'|false=false){
 await page.addInitScript(({id,token,attempt})=>{
  sessionStorage.setItem('zeeswap.private-tab.v1',JSON.stringify([{id,token}]));
  if(attempt!==null&&!localStorage.getItem(`zeeswap.noir-send.v1.${id}`))localStorage.setItem(`zeeswap.noir-send.v1.${id}`,attempt);
  const calls:string[]=[],provider={isNoirWallet:true,zcash:{request:async({method}:{method:string})=>{calls.push(method);throw Error('Removed provider must never be called');}}};
  Object.assign(window,{removedProviderCalls:calls,removedProviderReads:0});
  Object.defineProperty(window,'noirwallet',{get:()=>{(window as unknown as {removedProviderReads:number}).removedProviderReads++;return provider;}});
  window.ethereum={isMetaMask:true,request:async({method})=>{if(method==='eth_requestAccounts')return ['0x1111111111111111111111111111111111111111'];if(method==='eth_chainId')return '0x14a34';throw Error('Unexpected EVM request');}};
 },{id,token,attempt});
 const now=Date.now();
 const order={id,direction:'ZCASH_TO_BASE',status:'AWAITING_FUNDS',inputAmount:'100000',outputAmount:'100000',priceMode:'fixture',integrationOnly:true,executionMode:'base-settlement-v1',expiresAt:new Date(0).toISOString(),source:{received:false,confirmed:false,confirmations:0,policy:'zcash-10-confirmations',requiredConfirmations:10,...(heightOnly?{scannedHeight:heightOnly==='cutoff'?5000000:4999990,scannedAt:new Date(now).toISOString(),checkedAt:new Date(now).toISOString()}:{})},funding:{network:'zcash-testnet',receiver:address,memo,cutoffHeight:5000000,cutoffTime:heightOnly?null:new Date(now+120000).toISOString(),cancellationAvailableAt:null}};
 const availability={version:4,status:'ready',checkedAt:new Date(now).toISOString(),policy:{id,sha256:'a'.repeat(64),expiresAt:null,lifetime:'nonexpiring',lifetimeAuthorizationSha256:'b'.repeat(64),capacityBasis:'funded-or-active',capacityAuthorizationSha256:'c'.repeat(64),inputAmountAtomic:'100000',maxAcceptedByDirection:{ZCASH_TO_BASE:2,BASE_TO_ZCASH:2},remainingByDirection:{ZCASH_TO_BASE:2,BASE_TO_ZCASH:2},maxConcurrent:1,activeOrders:0,remainingQuotes:30,availableByDirection:{ZCASH_TO_BASE:true,BASE_TO_ZCASH:true}}};
 for(const path of ['/health','/availability',`/orders/${id}`])await page.route(`**${path}`,route=>{expect(route.request().method()).toBe('GET');return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(path==='/health'?{status:'ok',integrationOnly:false}:path==='/availability'?availability:order)});});
 return order;
}
async function openOrder(page:Page){await page.getByRole('button',{name:/^Activity/}).click();await page.getByRole('button',{name:/TAZ to USDC/}).click();await expect(page.getByRole('heading',{name:'Waiting for your deposit'})).toBeVisible();}
async function noRemovedProvider(page:Page){expect(await page.evaluate(()=>(window as unknown as {removedProviderCalls:string[]}).removedProviderCalls)).toEqual([]);expect(await page.evaluate(()=>(window as unknown as {removedProviderReads:number}).removedProviderReads)).toBe(0);await expect(page.getByRole('button',{name:/Noir|Pay with/i})).toHaveCount(0);await expect(page.getByRole('link',{name:/Noir/i})).toHaveCount(0);}
test('manual shielded funding retains exact QR and memo while only the Base wallet connects',async({page})=>{
 await page.setViewportSize({width:375,height:1000});await fixture(page);await page.goto('/');await noRemovedProvider(page);
 await page.getByRole('button',{name:'Connect wallet',exact:true}).click();await expect(page.getByText('Base Sepolia wallet',{exact:true})).toBeVisible();await page.getByRole('button',{name:'MetaMask',exact:true}).click();await expect(page.getByText('Base Sepolia connected',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Close dialog'}).click();
 await openOrder(page);const qr=page.getByRole('img',{name:'Zcash testnet payment QR with the exact amount, shielded receiver and required memo shown below'});await expect(qr).toBeVisible();await expect.poll(()=>qr.evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
 await expect(page.getByText(memo,{exact:true})).toBeVisible();for(const label of ['Copy amount','Copy receiver','Copy memo','Copy wallet payment request'])await expect(page.getByRole('button',{name:label,exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Save recovery file'})).toBeVisible();await noRemovedProvider(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('How it works explains both external-wallet directions without bypassing unavailable source readiness',async({page})=>{
 await fixture(page);await page.route('**/availability',route=>route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({version:4,status:'source_unavailable',checkedAt:new Date().toISOString(),policy:{id,sha256:'a'.repeat(64),expiresAt:null,lifetime:'nonexpiring',lifetimeAuthorizationSha256:'b'.repeat(64),capacityBasis:'funded-or-active',capacityAuthorizationSha256:'c'.repeat(64),inputAmountAtomic:'100000',maxAcceptedByDirection:{ZCASH_TO_BASE:2,BASE_TO_ZCASH:2},remainingByDirection:{ZCASH_TO_BASE:2,BASE_TO_ZCASH:2},maxConcurrent:1,activeOrders:0,remainingQuotes:30,availableByDirection:{ZCASH_TO_BASE:false,BASE_TO_ZCASH:false}}})}));
 await page.goto('/');await page.getByRole('button',{name:'How it works',exact:true}).click();await expect(page.getByRole('heading',{name:'TAZ to USDC: send from Zingo'})).toBeVisible();await expect(page.getByRole('heading',{name:'USDC to TAZ: fund on Base Sepolia'})).toBeVisible();await expect(page.getByRole('link',{name:'Get Zingo PC from its official release'})).toHaveAttribute('href','https://github.com/zingolabs/zingo-pc/releases/tag/zingo-pc-2.0.27-201');await page.getByRole('button',{name:'Close dialog'}).click();await page.getByRole('button',{name:'Review swap',exact:true}).click();await expect(page.getByRole('button',{name:'Get exact testnet quote'})).toBeDisabled();await expect(page.getByRole('dialog').getByText('Waiting for fresh chain observations',{exact:true})).toBeVisible();await noRemovedProvider(page);
});
test('height-only QR requires fresh source height and disappears when that observation ages without a new order state',async({page})=>{
 await page.clock.install();await fixture(page,null,'fresh');await page.goto('/');await openOrder(page);const qr=page.getByRole('img',{name:/Zcash testnet payment QR/});await expect(qr).toBeVisible();await expect(page.getByRole('button',{name:'Copy wallet payment request',exact:true})).toBeVisible();
 await page.clock.fastForward(30001);await expect(qr).toHaveCount(0);await expect(page.getByRole('button',{name:'Download QR (PNG)',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Copy wallet payment request',exact:true})).toHaveCount(0);await expect(page.getByText(/Refresh the original order to verify a fresh service-observed Zcash height/)).toBeVisible();await expect(page.getByRole('button',{name:'Copy memo',exact:true})).toBeVisible();await noRemovedProvider(page);
});
test('known reached funding height suppresses payment requests while retaining original details',async({page})=>{
 await fixture(page,null,'cutoff');await page.goto('/');await openOrder(page);await expect(page.getByRole('img',{name:/Zcash testnet payment QR/})).toHaveCount(0);await expect(page.getByRole('button',{name:'Download QR (PNG)',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Copy wallet payment request',exact:true})).toHaveCount(0);await expect(page.getByText(/The funding height cutoff has been reached. Do not send/)).toBeVisible();await expect(page.getByText(memo,{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Copy receiver',exact:true})).toBeVisible();await noRemovedProvider(page);
});
for(const [name,attempt] of [['unknown','{"state":"unknown"}'],['malformed','not-json'],['submitted',JSON.stringify({state:'submitted',txid:'b'.repeat(64)})]])test(`previous ${name} wallet result survives reload without a new payment action`,async({page})=>{
 await fixture(page,attempt);await page.goto('/');await openOrder(page);
 for(let reload=0;reload<2;reload++){
  if(reload){await page.reload();await openOrder(page);}
  await expect(page.getByText('Check the original wallet transaction',{exact:true})).toBeVisible();await expect(page.getByText('Original funding details',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Copy memo',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Download QR (PNG)',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Copy wallet payment request',exact:true})).toHaveCount(0);await expect(page.getByRole('img',{name:/Zcash testnet payment QR/})).toHaveCount(0);
  if(name==='submitted')await expect(page.getByText('b'.repeat(64),{exact:true})).toBeVisible();
  expect(await page.evaluate(id=>localStorage.getItem(`zeeswap.noir-send.v1.${id}`),id)).toBe(attempt);await noRemovedProvider(page);
 }
});
test('downloads a standard PNG containing the exact accepted amount, receiver and memo payment request',async({page})=>{
 await fixture(page);await page.goto('/');await openOrder(page);const button=page.getByRole('button',{name:'Download QR (PNG)',exact:true});await expect(button).toBeEnabled();const pending=page.waitForEvent('download');await button.click();const download=await pending;expect(download.suggestedFilename()).toBe('zeeswap-payment-qr.png');const path=await download.path();expect(path).not.toBeNull();const bytes=await readFile(path!);expect(bytes.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
 const actual=PNG.sync.read(bytes),uri=`zcash:${address}?amount=0.00100000&memo=${Buffer.from(memo).toString('base64url')}`,expected=PNG.sync.read(await QRCode.toBuffer(uri,{width:768,margin:4,errorCorrectionLevel:'M'}));expect(actual.width).toBe(768);expect(actual.height).toBe(768);expect(actual.data).toEqual(expected.data);await noRemovedProvider(page);
});
test('download click rechecks a stale observation even before the render timer runs',async({page})=>{
 await page.clock.install();await fixture(page,null,'fresh');await page.goto('/');await openOrder(page);const button=page.getByRole('button',{name:'Download QR (PNG)',exact:true});await expect(button).toBeEnabled();const downloads:string[]=[];page.on('download',download=>downloads.push(download.suggestedFilename()));await page.clock.setSystemTime(new Date((await page.evaluate(()=>Date.now()))+30001));await button.click();await expect(page.getByText('Refresh the original order before downloading a payment QR. Its funding window or previous wallet request must be reconciled.',{exact:true})).toBeVisible();expect(downloads).toEqual([]);await noRemovedProvider(page);
});
for(const change of ['stale','time-expired','received','unmount','legacy','changed-uri'] as const)test(`a ${change} order cannot finish an already encoding QR download`,async({page})=>{
 await page.clock.install();const order=await fixture(page,null,change==='time-expired'?false:'fresh');await page.addInitScript(()=>{
  const original=HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL=function(...args){const value=original.apply(this,args);return new Promise<string>(resolve=>{Object.assign(window,{qrEncodingPaused:true,finishQrEncoding:()=>resolve(value)});}) as unknown as string;};
 });
 const downloads:string[]=[];page.on('download',download=>downloads.push(download.suggestedFilename()));await page.goto('/');await openOrder(page);await page.getByRole('button',{name:'Download QR (PNG)',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as unknown as {qrEncodingPaused?:boolean}).qrEncodingPaused)).toBe(true);
 if(change==='stale')await page.clock.fastForward(30001);
 if(change==='time-expired')await page.clock.fastForward(120001);
 if(change==='received'){order.status='CONFIRMING';order.source.received=true;delete (order as {funding?:unknown}).funding;await page.getByRole('button',{name:'Refresh status',exact:true}).click();await expect(page.getByRole('heading',{name:/Deposit found/})).toBeVisible();}
 if(change==='unmount')await page.getByRole('button',{name:'Close dialog'}).click();
 if(change==='legacy')await page.evaluate(id=>localStorage.setItem(`zeeswap.noir-send.v1.${id}`,JSON.stringify({state:'unknown'})),id);
 if(change==='changed-uri'){order.funding.memo=JSON.stringify({v:1,ref:'33333333-3333-4333-8333-333333333333'});await page.getByRole('button',{name:'Refresh status',exact:true}).click();await expect(page.getByText(order.funding.memo,{exact:true})).toBeVisible();}
 await page.evaluate(()=>(window as unknown as {finishQrEncoding:()=>void}).finishQrEncoding());
 if(!['unmount','received','time-expired'].includes(change))await expect(page.getByText('The original funding request changed or expired. No QR was downloaded. Refresh the original order.',{exact:true})).toBeVisible();else await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())));
 expect(downloads).toEqual([]);await noRemovedProvider(page);
});
