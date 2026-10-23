import { decodePrivateOrders, type PrivateOrder } from './protocol.ts';
export const STORAGE_KEY='zeeswap.private-tab.v1';
export function readPrivateSession(storage:Pick<Storage,'getItem'|'removeItem'>):{remember:boolean;orders:PrivateOrder[]}{
  try{const value=storage.getItem(STORAGE_KEY);if(value)return{remember:true,orders:decodePrivateOrders(JSON.parse(value))};}catch{try{storage.removeItem(STORAGE_KEY);}catch{/* Browser privacy mode may forbid storage entirely. */}}
  return{remember:false,orders:[]};
}
export function writePrivateSession(storage:Pick<Storage,'setItem'|'removeItem'>,orders:PrivateOrder[],remember:boolean):boolean{
  try{if(remember)storage.setItem(STORAGE_KEY,JSON.stringify(orders));else storage.removeItem(STORAGE_KEY);return true;}catch{return false;}
}
export class OrderRequestFence{
  private epochs=new Map<string,number>();
  begin(id:string){const epoch=(this.epochs.get(id)??0)+1;this.epochs.set(id,epoch);return epoch;}
  current(id:string,epoch:number){return this.epochs.get(id)===epoch;}
  invalidate(id:string){this.begin(id);}
}
