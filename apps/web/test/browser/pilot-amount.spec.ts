/** Synthetic ready policy only: no wallet request, signing or live financial operation. */
import {test,expect} from '@playwright/test';
import {bech32m} from 'bech32';

const id='11111111-1111-4111-8111-111111111111';
const address='0x'+'1'.repeat(40);
const receiver=bech32m.encode('utest',bech32m.toWords(new Uint8Array(64).fill(7)),512);
function ready(){return {version:1,status:'ready',checkedAt:new Date().toISOString(),policy:{id,sha256:'b'.repeat(64),expiresAt:new Date(Date.now()+120000).toISOString(),inputAmountAtomic:'100000',maxAcceptedByDirection:{ZCASH_TO_BASE:2,BASE_TO_ZCASH:2},remainingByDirection:{ZCASH_TO_BASE:2,BASE_TO_ZCASH:2},maxConcurrent:1,activeOrders:0,remainingQuotes:32,availableByDirection:{ZCASH_TO_BASE:true,BASE_TO_ZCASH:true}}};}

test('ready policy without health bounds shows only the exact forward and reverse pilot size',async({page})=>{
  let posts=0;
  await page.route('http://127.0.0.1:3031/**',route=>{
    if(route.request().method()==='POST')posts++;
    return route.fulfill({json:new URL(route.request().url()).pathname==='/health'?{status:'ok',integrationOnly:false}:ready()});
  });
  await page.goto('/');
  await expect(page.getByLabel('You pay')).toHaveValue('0.001');
  await expect(page.getByLabel('You pay')).toHaveAttribute('readonly','');
  await expect(page.getByLabel('Indicative amount received')).toHaveText('0.1');
  await expect(page.locator('#pilot-amount-hint')).toContainText('Pilot amount updated from 0.01 TAZ to 0.001 TAZ.');
  await expect(page.locator('.presets button')).toHaveCount(1);
  await expect(page.locator('.presets button')).toHaveText('0.001');
  await expect(page.getByText(/maximum 1 active swap at a time/)).toBeVisible();
  await page.screenshot({path:'../../.deploy-local/web-qa/pilot-amount-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Reverse swap direction'}).click();
  await expect(page.getByLabel('You pay')).toHaveValue('0.1');
  await expect(page.getByLabel('Indicative amount received')).toHaveText('0.001');
  await expect(page.locator('.presets button')).toHaveText('0.1');
  await expect(page.locator('#pilot-amount-hint')).toHaveText('Pilot size: 0.1 USDC → 0.001 TAZ. Larger amounts are unavailable in this pilot.');
  expect(posts).toBe(0);
});

test('late pilot policy announces incompatible selection and retains required address validation',async({page})=>{
  let enabled=false;
  const posts:unknown[]=[];
  await page.route('http://127.0.0.1:3031/**',route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    if(request.method()==='POST'){posts.push(request.postDataJSON());return route.fulfill({status:503,json:{error:'TEST_QUOTE_STOP'}});}
    return route.fulfill({json:path==='/health'?{status:'ok',integrationOnly:false}:enabled?ready():{version:1,status:'disabled',checkedAt:new Date().toISOString(),policy:null}});
  });
  await page.goto('/');
  await expect(page.getByText('Testnet admission is disabled',{exact:true})).toBeVisible();
  await page.locator('.presets').getByRole('button',{name:'0.1',exact:true}).click();
  enabled=true;
  await page.getByRole('button',{name:'Check service connection again'}).click();
  await expect(page.getByLabel('You pay')).toHaveValue('0.001');
  await expect(page.locator('#pilot-amount-hint')).toContainText('updated from 0.1 TAZ to 0.001 TAZ');
  await expect(page.locator('.presets button')).toHaveCount(1);
  await page.getByRole('button',{name:'Review swap',exact:true}).click();
  await page.getByRole('button',{name:'Get exact testnet quote'}).click();
  await expect(page.locator('#recipient')).toBeFocused();
  expect(posts).toHaveLength(0);
  await page.locator('#recipient').fill(address);
  await page.getByRole('button',{name:'Get exact testnet quote'}).click();
  await expect(page.locator('#refund')).toBeFocused();
  expect(posts).toHaveLength(0);
  await page.locator('#recipient').fill('invalid-address');
  await page.locator('#refund').fill(receiver);
  await page.getByRole('button',{name:'Get exact testnet quote'}).click();
  await expect(page.getByRole('alert')).toContainText('valid, nonzero Base Sepolia address');
  expect(posts).toHaveLength(0);
  await page.locator('#recipient').fill(address);
  await page.getByRole('button',{name:'Get exact testnet quote'}).click();
  await expect.poll(()=>posts.length).toBe(1);
  expect(posts[0]).toMatchObject({direction:'ZCASH_TO_BASE',inputAmount:'100000',recipient:address,refundRecipient:receiver});
});

test('mobile pilot amount and capacity explanation fit without horizontal overflow',async({page})=>{
  await page.setViewportSize({width:375,height:1000});
  await page.route('http://127.0.0.1:3031/**',route=>route.fulfill({json:new URL(route.request().url()).pathname==='/health'?{status:'ok',integrationOnly:false}:ready()}));
  await page.goto('/');
  await expect(page.locator('#pilot-amount-hint')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'../../.deploy-local/web-qa/pilot-amount-375.png',fullPage:true});
});
