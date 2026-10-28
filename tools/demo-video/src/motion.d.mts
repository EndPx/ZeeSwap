export function clamp01(value:number):number;
export function ease(value:number):number;
export function move(frame:number,start:number,end:number,from?:number,to?:number):number;
export function cursorPoint(frame:number,keys:readonly {frame:number;x:number;y:number}[]):{x:number;y:number};
