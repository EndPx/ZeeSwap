export const clamp01 = value => Math.min(1, Math.max(0, value));
export const ease = value => 1 - Math.pow(1 - clamp01(value), 3);
export const move = (frame, start, end, from=0, to=1) => {
  if (!(end > start)) throw new Error('Increasing motion range required');
  return from + (to-from) * ease((frame-start)/(end-start));
};
export const cursorPoint = (frame, keys) => {
  if (!keys.length || keys.some((key,i)=>i>0 && key.frame<=keys[i-1].frame)) throw new Error('Strictly increasing cursor frames required');
  let a=keys[0], b=a;
  for(let i=1;i<keys.length;i++){b=keys[i];if(frame<=b.frame)break;a=b;}
  if(a===b)return {x:a.x,y:a.y};
  return {x:move(frame,a.frame,b.frame,a.x,b.x), y:move(frame,a.frame,b.frame,a.y,b.y)};
};
