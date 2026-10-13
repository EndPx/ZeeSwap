import { BaseContract,loadBaseRegistry,jsonSafe } from '../src/base-contract.ts';
const base=new BaseContract(loadBaseRegistry());
console.log(jsonSafe({...await base.preflight(),operatorGasWei:await base.client.getBalance({address:base.registry.operator}),
 sendsTransactions:false,activatesIntake:false}));
