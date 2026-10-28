import React,{useEffect,useState} from 'react';
import {Composition,Folder,registerRoot,delayRender,continueRender,cancelRender,staticFile} from 'remotion';
import timeline from '../timeline.json';
import {Film,Scene,SceneId} from './Film';

function Fonts({children}:{children:React.ReactNode}){const [handle]=useState(()=>delayRender('Load original ZeeSwap fonts'));useEffect(()=>{Promise.all([
  new FontFace('Manrope',`url(${staticFile('fonts/manrope-latin-variable.woff2')})`,{weight:'200 800'}).load(),
  new FontFace('Instrument',`url(${staticFile('fonts/instrument-serif-latin-italic.woff2')})`,{style:'italic'}).load(),
]).then(fonts=>{const fontSet=document.fonts as FontFaceSet & {add:(font:FontFace)=>void};fonts.forEach(font=>fontSet.add(font));continueRender(handle);}).catch(cancelRender);},[handle]);return <>{children}</>;}
const Master=()=> <Fonts><Film/></Fonts>;
const Preview=({id}:{id:SceneId})=><Fonts><Scene id={id}/></Fonts>;
const Root=()=> <><Composition id="Master" component={Master} {...timeline.composition}/><Folder name="Scenes">{timeline.scenes.map(scene=><Composition key={scene.id} id={`Scene-${scene.id}`} component={Preview} defaultProps={{id:scene.id as SceneId}} width={timeline.composition.width} height={timeline.composition.height} fps={timeline.composition.fps} durationInFrames={scene.durationInFrames}/>)}</Folder></>;
registerRoot(Root);
