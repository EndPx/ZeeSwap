import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

export function probeDuration(file, ffprobe=process.env.FFPROBE_PATH || 'ffprobe') {
  const result=spawnSync(ffprobe,['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',file],{encoding:'utf8',windowsHide:true});
  const duration=Number(result.stdout?.trim());
  if(result.error || result.status!==0 || !Number.isFinite(duration) || duration<=0)throw new Error(`Cannot measure original audio ${path.basename(file)}: ${result.error?.message || result.stderr || 'invalid duration'}`);
  return duration;
}

// Original files remain unchanged. Only placement and render gain live here.
export function validateAudio(timeline, root, {measure=probeDuration,read=readFileSync}={}) {
  const {fps,durationInFrames:total}=timeline.composition;
  const tracks=timeline.audio;
  if(!Array.isArray(tracks) || !tracks.length)throw new Error('ElevenLabs original audio has not been imported');
  const ids=new Set();
  const narration=new Set();
  for(const track of tracks){
    if(!track.id || ids.has(track.id))throw new Error('Audio IDs must be present and unique');
    ids.add(track.id);
    if(track.provider!=='ElevenLabs' || !track.sourceName || !['narration','music','sfx'].includes(track.kind))throw new Error(`Missing ElevenLabs provenance: ${track.id}`);
    if(!/^audio\/elevenlabs\/[a-zA-Z0-9_./-]+\.(mp3|wav|m4a)$/.test(track.file) || track.file.split('/').includes('..'))throw new Error(`Unsafe audio path: ${track.id}`);
    if(!Number.isInteger(track.startFrame) || track.startFrame<0 || !Number.isInteger(track.durationInFrames) || track.durationInFrames<=0 || track.startFrame+track.durationInFrames>total)throw new Error(`Audio outside composition: ${track.id}`);
    if(!Number.isFinite(track.gain) || track.gain<0 || track.gain>1)throw new Error(`Invalid audio gain: ${track.id}`);
    for(const key of ['fadeInFrames','fadeOutFrames'])if(track[key]!==undefined && (!Number.isInteger(track[key]) || track[key]<0 || track[key]>track.durationInFrames))throw new Error(`Invalid audio fade: ${track.id}`);
    const file=path.join(root,'public',track.file);
    const hash=createHash('sha256').update(read(file)).digest('hex');
    if(track.sha256!==hash)throw new Error(`Original audio hash mismatch: ${track.id}`);
    const seconds=measure(file);
    if(!Number.isFinite(track.sourceDurationSeconds) || Math.abs(seconds-track.sourceDurationSeconds)>.05)throw new Error(`Original audio duration mismatch: ${track.id}`);
    if(track.durationInFrames!==Math.ceil(seconds*fps))throw new Error(`Use the complete original audio duration: ${track.id}`);
    if(track.kind==='narration'){
      const scene=timeline.scenes.find(s=>s.id===track.sceneId);
      if(!scene || narration.has(scene.id) || track.voice!=='Albary' || track.model!=='Eleven v4')throw new Error(`Invalid narration assignment or requested voice/model: ${track.id}`);
      if(!Number.isInteger(track.leadInFrames) || track.leadInFrames<0 || !Number.isInteger(track.tailFrames) || track.tailFrames<0 || track.startFrame!==scene.startFrame+track.leadInFrames || track.leadInFrames+track.durationInFrames+track.tailFrames>scene.durationInFrames)throw new Error(`Original narration does not fit scene: ${track.id}`);
      narration.add(scene.id);
    }
  }
  if(timeline.scenes.some(scene=>!narration.has(scene.id)))throw new Error('Every scene needs its original ElevenLabs narration paragraph');
  if(!tracks.some(track=>track.kind==='music'))throw new Error('Original ElevenLabs music is required');
  return tracks.length;
}
