import {test,expect} from '@playwright/test';
const id='00000000-0000-4000-8000-000000000001';
for(const width of [375,835,1440])test(`forward delivery and confirmation truth at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1000});
 let destinationStatus='RESERVING';
 await page.addInitScript(id=>sessionStorage.setItem('zeeswap.private-tab.v1',JSON.stringify([{id,token:'a'.repeat(43)}])),id);
 await page.route('http://127.0.0.1:3031/**',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type,idempotency-key','access-control-allow-methods':'GET,POST,OPTIONS'}});
  const path=new URL(route.request().url()).pathname;
  const value=path==='/health'?{status:'ok',integrationOnly:true}:path==='/availability'?{version:1,status:'disabled',checkedAt:new Date().toISOString(),policy:null}:{id,direction:'ZCASH_TO_BASE',status:destinationStatus==='FINALIZED'?'SETTLED':'READY',inputAmount:'100000',outputAmount:'100000',priceMode:'fixture',integrationOnly:true,executionMode:'base-settlement-v1',expiresAt:new Date(Date.now()+120000).toISOString(),source:{received:true,confirmed:true,confirmations:26,policy:'zcash-10-confirmations',requiredConfirmations:10},destination:{network:'base-sepolia',status:destinationStatus,...(['INCLUDED','FINALIZED'].includes(destinationStatus)?{transactionHash:'0x'+'a'.repeat(64),blockNumber:123}:{})}};
  await route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(value)});
 });
 await page.goto('/');await page.getByRole('button',{name:/^Activity/}).click();await page.getByRole('button',{name:/TAZ to USDC/}).click();
 await expect(page.getByText('Confirmed · 26 confirmations',{exact:true})).toBeVisible();await expect(page.getByText('26 / 10',{exact:true})).toHaveCount(0);await expect(page.getByText('Reserving payout',{exact:true})).toBeVisible();
 destinationStatus='PAYOUT_PENDING';await page.getByRole('button',{name:'Refresh status'}).click();await expect(page.getByText('Payment pending',{exact:true})).toBeVisible();await expect(page.getByText('USDC delivered · Finalizing',{exact:true})).toHaveCount(0);
 destinationStatus='INCLUDED';await page.getByRole('button',{name:'Refresh status'}).click();await expect(page.getByText('USDC delivered · Finalizing',{exact:true})).toBeVisible();await expect(page.locator('.status-steps > div').nth(2)).not.toHaveClass('done');await expect(page.getByRole('link',{name:'View public Base transaction'})).toHaveAttribute('href',`https://sepolia.basescan.org/tx/0x${'a'.repeat(64)}`);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`../../.deploy-local/web-qa/forward-finalizing-${width}.png`,fullPage:true});
 destinationStatus='FINALIZED';await page.getByRole('button',{name:'Refresh status'}).click();await expect(page.getByText('Delivery finalized',{exact:true})).toBeVisible();await expect(page.locator('.status-steps > div').nth(2)).toHaveClass('done');
});
test('reverse canonical L2 funding does not claim finalized source while TAZ delivery proceeds',async({page})=>{
 await page.addInitScript(id=>sessionStorage.setItem('zeeswap.private-tab.v1',JSON.stringify([{id,token:'a'.repeat(43)}])),id);
 await page.route('http://127.0.0.1:3031/**',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type,idempotency-key'}});
  const path=new URL(route.request().url()).pathname;
  const value=path==='/health'?{status:'ok',integrationOnly:true}:path==='/availability'?{version:1,status:'disabled',checkedAt:new Date().toISOString(),policy:null}:{id,direction:'BASE_TO_ZCASH',status:'READY',inputAmount:'100000',outputAmount:'100000',priceMode:'fixture',integrationOnly:true,executionMode:'base-escrow-v1',expiresAt:new Date(Date.now()+120000).toISOString(),source:{received:true,confirmed:false,included:true,confirmations:0,policy:'base-included',requiredConfirmations:null},destination:{network:'zcash-testnet',status:'PAYOUT_PENDING'}};
  await route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(value)});
 });
 await page.goto('/');await page.getByRole('button',{name:/^Activity/}).click();await page.getByRole('button',{name:/USDC to TAZ/}).click();
 await expect(page.getByText('Source included · Delivering TAZ',{exact:true})).toBeVisible();await expect(page.getByText('Included · Base L2',{exact:true})).toBeVisible();await expect(page.getByText('Source finalized',{exact:true})).toHaveCount(0);await expect(page.locator('.order-status').getByText(/operator accepts Base reorg risk/)).toBeVisible();
});
