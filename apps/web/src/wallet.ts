import { useCallback, useEffect, useState } from 'react';
import { getAddress, isAddress } from 'viem';

export interface EthereumProvider {
  isMetaMask?:boolean;
  request(args:{method:string;params?:unknown[]}):Promise<unknown>;
  on?(name:string,listener:(value:unknown)=>void):void;
  removeListener?(name:string,listener:(value:unknown)=>void):void;
}
export interface WalletOption {id:string;name:string;provider:EthereumProvider;}
declare global {interface Window {ethereum?:EthereumProvider;}}
interface AnnounceEvent extends Event {detail:{info:{uuid:string;name:string;icon?:string;rdns?:string};provider:EthereumProvider};}
const account=(value:unknown)=>Array.isArray(value)&&typeof value[0]==='string'&&isAddress(value[0],{strict:true})?getAddress(value[0]):null;
const chain=(value:unknown)=>typeof value==='string'&&/^0x[0-9a-f]+$/i.test(value)?BigInt(value).toString():null;
export function walletError(error:unknown):string {
  const code=error&&typeof error==='object'&&'code'in error?error.code:undefined;
  if(code===4001)return 'Wallet request declined. You can enter your recipient manually.';
  if(code===-32002)return 'A wallet request is already open. Check your wallet extension.';
  if(code===4902)return 'Add Base Sepolia in your wallet, then connect again. Chain ID: 84532.';
  return 'The wallet did not connect. Unlock it and try again, or enter your recipient manually.';
}
export function useWallet(){
  const [options,setOptions]=useState<WalletOption[]>([]),[selected,setSelected]=useState<WalletOption|null>(null),[address,setAddress]=useState<string|null>(null),[chainId,setChainId]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    const announce=(event:Event)=>{const detail=(event as AnnounceEvent).detail;if(!detail?.info?.uuid||!detail.info.name||typeof detail.provider?.request!=='function')return;
      setOptions(current=>current.some(w=>w.id===detail.info.uuid)?current:[...current,{id:detail.info.uuid,name:detail.info.name.slice(0,60),provider:detail.provider}]);};
    window.addEventListener('eip6963:announceProvider',announce);window.dispatchEvent(new Event('eip6963:requestProvider'));
    const timer=window.setTimeout(()=>{if(window.ethereum)setOptions(current=>current.length?current:[{id:'injected',name:window.ethereum!.isMetaMask?'MetaMask':'Browser wallet',provider:window.ethereum!}]);},100);
    return()=>{clearTimeout(timer);window.removeEventListener('eip6963:announceProvider',announce);};
  },[]);
  useEffect(()=>{if(!selected)return;const accounts=(value:unknown)=>setAddress(account(value)),chains=(value:unknown)=>setChainId(chain(value));
    selected.provider.on?.('accountsChanged',accounts);selected.provider.on?.('chainChanged',chains);
    return()=>{selected.provider.removeListener?.('accountsChanged',accounts);selected.provider.removeListener?.('chainChanged',chains);};},[selected]);
  const connect=useCallback(async(option:WalletOption)=>{if(busy)return;setBusy(true);setError('');try{
    const accounts=await option.provider.request({method:'eth_requestAccounts'}),network=await option.provider.request({method:'eth_chainId'});
    const next=account(accounts),id=chain(network);if(!next||!id)throw Error('Invalid wallet response');setSelected(option);setAddress(next);setChainId(id);
  }catch(error){setError(walletError(error));}finally{setBusy(false);}},[busy]);
  const switchChain=useCallback(async()=>{if(!selected||busy)return;setBusy(true);setError('');try{await selected.provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x14a34'}]});
    const network=await selected.provider.request({method:'eth_chainId'});setChainId(chain(network));}catch(error){setError(walletError(error));}finally{setBusy(false);}},[selected,busy]);
  return{name:selected?.name,provider:selected?.provider,options,address,chainId,busy,error,connect,switchChain,disconnect:()=>{setAddress(null);setChainId(null);setSelected(null);setError('');}};
}
