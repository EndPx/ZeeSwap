import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {digest as observationDigest} from '../../src/integrations/observation/types.ts';

test('Chef immutable exclusion pins the exact UTF8 STRING through observation digest, not raw bytes or parsed JSON',()=>{
 const proofText='{"v":1}\n';
 const rawHash=createHash('sha256').update(proofText).digest('hex');
 assert.equal(rawHash,'2b4248702881de2f5638efe96b233de1c0dd9be5dd24ec35ad030d6b06aede9a');
 assert.equal(observationDigest(proofText),'7ae221cb10e8af586b28438c57482f41c783dc6a73c8dfaf365f616f2c033a1d');
 assert.notEqual(observationDigest(proofText),rawHash);
 assert.notEqual(observationDigest(proofText),observationDigest(JSON.parse(proofText)));
 assert.notEqual(observationDigest(proofText),observationDigest(proofText.trim()));
});
