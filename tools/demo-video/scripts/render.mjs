import {bundle} from '@remotion/bundler';
import {renderMedia,renderStill,selectComposition} from '@remotion/renderer';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateAudio} from './audio-contract.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const timeline=JSON.parse(await readFile(path.join(root,'timeline.json'),'utf8'));
const args=process.argv.slice(2);
const option=(key,fallback)=>{const i=args.indexOf(`--${key}`);return i<0?fallback:args[i+1];};
const mode=option('mode','preview');
if(!['still','preview','full'].includes(mode))throw new Error('mode must be still, preview, or full');
if(mode!=='still')validateAudio(timeline,root);
const compositionId=option('composition','Master');
const concurrency=Number(option('concurrency','1'));
if(!Number.isInteger(concurrency)||concurrency<1)throw new Error('Positive integer concurrency required');
await mkdir(path.join(root,'out'),{recursive:true});
console.log('Bundling ZeeSwap film source and original assets…');
const serveUrl=await bundle({entryPoint:path.join(root,'src/index.tsx'),publicDir:path.join(root,'public')});
console.log('Bundle ready. Selecting composition in headless Chromium…');
const composition=await selectComposition({serveUrl,id:compositionId});
console.log(`Composition ready: ${composition.id}, ${composition.durationInFrames} frames at ${composition.fps} fps.`);
const defaultStart=compositionId==='Master'?timeline.scenes.find(s=>s.id==='route').startFrame:0;
const start=Number(option('start',String(defaultStart)));
const length=Number(option('frames','240'));
const stillFrame=Number(option('frame',String(start+Math.min(150,composition.durationInFrames-start-1))));
const common={serveUrl,composition,chromiumOptions:{disableWebSecurity:false},timeoutInMilliseconds:120000};
if(mode==='still'){
  if(!Number.isInteger(stillFrame)||stillFrame<0||stillFrame>=composition.durationInFrames)throw new Error('Still frame out of bounds');
  const output=path.resolve(root,option('output',`out/${compositionId}-${stillFrame}.png`));
  console.log(`Rendering still frame ${stillFrame}…`);
  await renderStill({...common,frame:stillFrame,output,imageFormat:'png'});
  console.log(output);
}else{
  const frameRange=mode==='full'?[0,composition.durationInFrames-1]:[start,start+length-1];
  if(frameRange.some(n=>!Number.isInteger(n)||n<0||n>=composition.durationInFrames))throw new Error('Render frame range out of bounds');
  const outputLocation=path.resolve(root,option('output',mode==='full'?'out/zeeswap-product-film.mp4':'out/zeeswap-preview.mp4'));
  console.log(`Rendering frames ${frameRange[0]}–${frameRange[1]}, concurrency ${concurrency}…`);
  await renderMedia({...common,outputLocation,codec:'h264',audioCodec:'aac',pixelFormat:'yuv420p',crf:18,concurrency,frameRange,onProgress:({progress})=>{if(progress===1)console.log('Frames complete');}});
  console.log(outputLocation);
}
