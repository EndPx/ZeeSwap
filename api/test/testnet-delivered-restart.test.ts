import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requireDeliveredRestartBase} from '../scripts/check-testnet-delivered-restart.ts';
test('delivered restart refuses pending nonce or unavailable physical Base capital',()=>{
 const good={nonce:7,pending:7,gas:'100000000000000',available:'100000'};
 assert.doesNotThrow(()=>requireDeliveredRestartBase(good));
 for(const change of [{pending:8},{nonce:-1},{gas:'99999999999999'},{available:'99999'},{gas:'1.5'}])assert.throws(()=>requireDeliveredRestartBase({...good,...change}));
});
