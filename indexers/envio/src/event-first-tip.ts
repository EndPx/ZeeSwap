/** Existing entity shape, one stable ID. A processor clock is not an RPC/source clock. */
export const EVENT_FIRST_TIP_ID='84532:source-tip';
type Tip={id:string;blockNumber:number;coverageComplete:boolean;headerJson:undefined;sourceHeadJson:undefined;sourceSampledAt:string};
export function writeEventFirstTip(block:{number:number},context:{isPreload:boolean;BlockVisit:{set(value:Tip):void}},clock=()=>new Date().toISOString(),maximum?:number){
 if(context.isPreload)return; // Never persist a parallel pre-run's time or call the clock there.
 if(!Number.isSafeInteger(block.number)||block.number<0)throw Error('EVENT_FIRST_BLOCK_NUMBER');
 if(maximum!==undefined&&(!Number.isSafeInteger(maximum)||maximum<0||block.number>maximum))throw Error('EVENT_FIRST_REHEARSAL_BLOCK_LIMIT');
 const observedAt=clock();if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(observedAt)||!Number.isFinite(Date.parse(observedAt)))throw Error('EVENT_FIRST_PROCESSOR_CLOCK');
 context.BlockVisit.set({id:EVENT_FIRST_TIP_ID,blockNumber:block.number,coverageComplete:false,headerJson:undefined,sourceHeadJson:undefined,sourceSampledAt:observedAt});
}
