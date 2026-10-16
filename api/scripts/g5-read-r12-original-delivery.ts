import {g5Context,durable,privateLocalPath} from './g5-context.ts';
import {captureG5R12Source15Delivery} from './g5-r12-source15-proof.ts';
const [manifestPath]=process.argv.slice(2);if(!manifestPath||process.argv.length!==3)throw Error('G5_SOURCE15_EXPLICIT_MANIFEST_REQUIRED');
const c=await g5Context(manifestPath);
try{const proof=await captureG5R12Source15Delivery(c);await durable(privateLocalPath(c.config.stateFile+'.r12-original-delivery-source15.private.json'),proof);console.log(JSON.stringify({status:proof.status,sequence:12,sqlConfirmed:false,noAck:true,noNewPayment:true,blockHeight:proof.receipt?.blockHeight,tipHeight:proof.receipt?.tipHeight}));}
finally{await c.close(false);}
