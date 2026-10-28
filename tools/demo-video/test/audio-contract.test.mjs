import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateAudio} from '../scripts/audio-contract.mjs';

const bytes=Buffer.from('original export fixture');
const sha256=createHash('sha256').update(bytes).digest('hex');
const options={read:()=>bytes,measure:()=>2};
const original={provider:'ElevenLabs',sourceName:'original.mp3',sourceDurationSeconds:2,sha256,gain:.8,durationInFrames:60};
const fixture=()=>({composition:{fps:30,durationInFrames:120},scenes:[{id:'hook',startFrame:0,durationInFrames:120}],audio:[{...original,id:'voice-hook',file:'audio/elevenlabs/narration/01-hook.mp3',kind:'narration',sceneId:'hook',voice:'Albary',model:'Eleven v4',leadInFrames:15,tailFrames:15,startFrame:15},{...original,id:'music',file:'audio/elevenlabs/music/background.mp3',kind:'music',startFrame:0}]});

test('accepts complete original paragraph with measured fit and provenance',()=>assert.equal(validateAudio(fixture(),'.',options),2));
test('blocks absent assets and synthetic provenance',()=>{
  const empty=fixture();empty.audio=[];assert.throws(()=>validateAudio(empty,'.',options),/not been imported/);
  const synthetic=fixture();synthetic.audio[1].provider='local';assert.throws(()=>validateAudio(synthetic,'.',options),/provenance/);
});
test('rejects changed originals, stale lengths and clipped speech',()=>{
  for(const [change,pattern] of [
    [t=>t.audio[0].sha256='0'.repeat(64),/hash mismatch/],
    [t=>t.audio[0].sourceDurationSeconds=3,/duration mismatch/],
    [t=>t.audio[0].durationInFrames=59,/complete original/],
    [t=>t.audio[0].tailFrames=46,/does not fit/],
    [t=>t.audio[0].model='other',/requested voice/],
    [t=>t.audio[1].fadeOutFrames=61,/Invalid audio fade/],
  ]){const timeline=fixture();change(timeline);assert.throws(()=>validateAudio(timeline,'.',options),pattern);}
});
test('rejects missing paragraphs, music and escaping audio paths',()=>{
  const missing=fixture();missing.scenes.push({id:'closing',startFrame:120,durationInFrames:60});assert.throws(()=>validateAudio(missing,'.',options),/Every scene/);
  const noMusic=fixture();noMusic.audio.pop();assert.throws(()=>validateAudio(noMusic,'.',options),/music is required/);
  const unsafe=fixture();unsafe.audio[0].file='audio/elevenlabs/../secret.mp3';assert.throws(()=>validateAudio(unsafe,'.',options),/Unsafe/);
});
