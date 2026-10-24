/** Minimum cadence between starts; slow observation never adds another idle interval. */
export function observerCadenceDelay(started:number,completed:number,intervalMs=5000){
 if(!Number.isFinite(started)||!Number.isFinite(completed)||completed<started||!Number.isSafeInteger(intervalMs)||intervalMs<1||intervalMs>10000)throw Error('INVALID_OBSERVER_CADENCE');
 return Math.max(0,intervalMs-(completed-started));
}
