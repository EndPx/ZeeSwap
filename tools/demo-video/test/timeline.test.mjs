import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {move,cursorPoint} from '../src/motion.mjs';
const timeline=JSON.parse(readFileSync(new URL('../timeline.json',import.meta.url),'utf8'));
test('80-second master and scene previews cover one continuous film under cap',()=>{
  assert.equal(timeline.composition.durationInFrames,2400);
  assert.equal(timeline.composition.fps,30);
  assert.ok(timeline.composition.durationInFrames/timeline.composition.fps<=timeline.maxDurationSeconds);
  let end=0;const ids=new Set();
  for(const scene of timeline.scenes){assert.equal(scene.startFrame,end);assert.ok(!ids.has(scene.id));ids.add(scene.id);assert.ok(scene.durationInFrames>0);let beatEnd=0;for(const beat of scene.beats){assert.equal(beat.fromFrame,beatEnd);beatEnd+=beat.durationInFrames;}assert.equal(beatEnd,scene.durationInFrames);end+=scene.durationInFrames;}
  assert.equal(end,2400);
});
test('motion clamps to stable reading poses and does not change with evaluation order',()=>{
  assert.equal(move(-10,0,20,100,300),100);assert.equal(move(40,0,20,100,300),300);
  const first=move(11,0,20,100,300);move(200,0,20);assert.equal(move(11,0,20,100,300),first);
  assert.throws(()=>move(5,5,5));
});
test('click anchor remains at click time while cursor departs in the same stage coordinates',()=>{
  const keys=[{frame:0,x:0,y:0},{frame:30,x:150,y:250},{frame:45,x:150,y:250},{frame:75,x:500,y:0}];
  const click=cursorPoint(45,keys);assert.deepEqual(click,{x:150,y:250});
  assert.notDeepEqual(cursorPoint(60,keys),click);assert.deepEqual(cursorPoint(45,keys),click);
  assert.deepEqual(cursorPoint(-10,keys),{x:0,y:0});assert.deepEqual(cursorPoint(100,keys),{x:500,y:0});
  assert.throws(()=>cursorPoint(0,[keys[0],keys[0]]));
});
test('truthful illustration labels and separate confirmations/delivery are explicit',()=>{
  for(const id of ['route','noir'])assert.match(timeline.scenes.find(s=>s.id===id).evidence.label,/simulated wallet/);
  assert.match(timeline.scenes.find(s=>s.id==='mechanism').viewerTakeaway,/confirmations and delivery differ/);
  assert.ok(timeline.audio.every(a=>a.startFrame+a.durationInFrames<=2400));
});
