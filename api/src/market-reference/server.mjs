import {createServer} from 'node:http';
import {createMarketReferenceCache} from './cache.mjs';

export function createMarketReferenceServer(cache=createMarketReferenceCache()){
 const server=createServer({maxHeaderSize:8192},(req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  const reply=(status,value)=>{res.statusCode=status;res.end(req.method==='HEAD'?undefined:JSON.stringify(value));};
  if(req.url!=='/market-reference'){reply(404,{error:'NOT_FOUND'});return;}
  if(!['GET','HEAD','OPTIONS'].includes(req.method)){res.setHeader('Allow','GET, HEAD, OPTIONS');req.resume();reply(405,{error:'METHOD_NOT_ALLOWED'});return;}
  if(req.headers['transfer-encoding']||req.headers['content-length']&&req.headers['content-length']!=='0'){req.resume();reply(400,{error:'BODY_NOT_ALLOWED'});return;}
  if(req.method==='OPTIONS'){res.setHeader('Allow','GET, HEAD, OPTIONS');res.statusCode=204;res.end();return;}
  const value=cache.view();reply(value.status==='available'?200:503,value);
 });
 server.requestTimeout=5000;server.headersTimeout=5000;server.timeout=5000;server.keepAliveTimeout=1000;server.maxRequestsPerSocket=100;server.maxConnections=64;
 return {server,startPolling:()=>cache.start(),stopPolling:()=>cache.stop()};
}
