import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveG5ReferencedPrivatePath as path} from '../src/g5-private-path.ts';
test('native Linux approval references retain the actual UNC config distribution',()=>{
 assert.equal(path('\\\\wsl.localhost\\Ubuntu\\home\\operator\\payer.json','/home/operator/approval.json'),'//wsl.localhost/Ubuntu/home/operator/approval.json');
 assert.equal(path('//wsl$/Ubuntu-24.04/home/operator/payer.json','/home/operator/approval.json'),'//wsl$/Ubuntu-24.04/home/operator/approval.json');
 assert.equal(path('/home/operator/payer.json','/home/operator/approval.json'),'/home/operator/approval.json');
 assert.equal(path('//wsl.localhost/Ubuntu/home/operator/payer.json','//wsl.localhost/Ubuntu/home/operator/approval.json'),'//wsl.localhost/Ubuntu/home/operator/approval.json');
 assert.equal(path('//wsl.localhost/Ubuntu/home/operator/payer.json','D:/private/approval.json'),'D:/private/approval.json');
});
test('relative paths and traversal cannot escape a distribution anchor',()=>{
 for(const reference of ['../approval.json','/home/operator/../approval.json','/home/operator/./approval.json','approval.json','//server/share/approval.json'])assert.throws(()=>path('//wsl.localhost/Ubuntu/home/operator/payer.json',reference),/TRAVERSAL|ABSOLUTE/);
 assert.throws(()=>path('//wsl.localhost/Ubuntu/home/../payer.json','/home/operator/approval.json'),/TRAVERSAL/);
});
