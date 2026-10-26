import {runMarketNativeGuard} from '../src/market-native-runtime.ts';
try{
 const [path,mode]=process.argv.slice(2);if(!path||!['authority','broadcast'].includes(mode??'')||process.argv.length!==4)throw Error('MARKET_NATIVE_GUARD_ARGUMENTS');
 let input='';for await(const part of process.stdin){input+=part;if(input.length>2048)throw Error('MARKET_NATIVE_GUARD_INPUT');}
 if(mode==='authority'&&input.trim())throw Error('MARKET_NATIVE_AUTHORITY_INPUT');
 console.log(JSON.stringify(await runMarketNativeGuard(path,mode as 'authority'|'broadcast',mode==='broadcast'?JSON.parse(input):undefined)));
}catch{console.error('MARKET_NATIVE_GUARD_DENIED');process.exitCode=1;}
