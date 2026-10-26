import {pathToFileURL} from 'node:url';
import {createMarketReferenceServer} from './server.mjs';

export function runMarketReference(){
 const text=process.env.PORT??'3032';if(!/^[1-9][0-9]{0,4}$/.test(text)||Number(text)>65535)throw Error('MARKET_REFERENCE_PORT_INVALID');
 const service=createMarketReferenceServer();service.server.listen(Number(text),'127.0.0.1',()=>{service.startPolling();console.log('Market reference read-only service listening on loopback');});
 const stop=()=>{service.stopPolling();service.server.close();};process.once('SIGINT',stop);process.once('SIGTERM',stop);return service;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)runMarketReference();
