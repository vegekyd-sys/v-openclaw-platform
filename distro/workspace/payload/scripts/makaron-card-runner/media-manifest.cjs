'use strict';

const fs=require('node:fs');
const path=require('node:path');

function hasOwn(value,key){ return Object.prototype.hasOwnProperty.call(value,key); }
function isHttpUrl(value){
  try{
    const url=new URL(String(value||''));
    return (url.protocol==='http:'||url.protocol==='https:') && Boolean(url.hostname);
  }catch{return false;}
}
function timingKeys(value){ return ['start','end','start_sec','end_sec'].filter(key=>hasOwn(value,key)); }

function validateCanonicalClip(clip,index){
  const label=`media manifest clip ${index+1}`;
  if(!clip||typeof clip!=='object'||Array.isArray(clip)) throw new Error(`${label} must be an object`);
  if(!isHttpUrl(clip.source_url)) throw new Error(`${label} has invalid source_url`);
  if(clip.type!=='image'&&clip.type!=='video') throw new Error(`${label} must declare type "image" or "video"`);
  const times=timingKeys(clip);
  if(clip.type==='image'){
    if(times.length) throw new Error(`${label} image must not contain timing fields`);
    return {type:'image',duration:0};
  }
  if(hasOwn(clip,'start_sec')||hasOwn(clip,'end_sec')) throw new Error(`${label} video must use canonical start/end fields`);
  if(!hasOwn(clip,'start')||!hasOwn(clip,'end')) throw new Error(`${label} video requires start and end`);
  const start=Number(clip.start), end=Number(clip.end);
  if(!Number.isFinite(start)||start<0||!Number.isFinite(end)||end<=start) throw new Error(`${label} has invalid start/end`);
  return {type:'video',duration:end-start};
}

// Historical jobs used source_ranges and sometimes MIME-like/missing types.
// Preserve that compatibility only on the legacy branch; all canonical clips
// submitted to Makaron CLI 0.14.1 are checked strictly above.
function validateLegacyRange(range,index){
  const label=`legacy media manifest range ${index+1}`;
  if(!range||typeof range!=='object'||Array.isArray(range)) throw new Error(`${label} must be an object`);
  if(!isHttpUrl(range.source_url)) throw new Error(`${label} has invalid source_url`);
  const rawType=String(range.type??range.media_type??'').toLowerCase();
  const hasRange=range.start!=null||range.end!=null||range.start_sec!=null||range.end_sec!=null;
  const isImage=rawType==='image'||rawType.startsWith('image/');
  if(isImage||!hasRange) return {type:'image',duration:0};
  const start=Number(range.start??range.start_sec), end=Number(range.end??range.end_sec);
  if(!Number.isFinite(start)||start<0||!Number.isFinite(end)||end<=start) throw new Error(`${label} has invalid start/end`);
  return {type:'video',duration:end-start};
}

function inspectMediaManifest(file){
  const manifestPath=path.resolve(file);
  const data=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  const topLevelArray=Array.isArray(data);
  const canonical=topLevelArray || Array.isArray(data.clips);
  const ranges=topLevelArray ? data : (canonical ? data.clips : (Array.isArray(data.source_ranges) ? data.source_ranges : []));
  if(!ranges.length||ranges.length>20) throw new Error('media manifest must contain 1-20 clips');
  let totalDurationSec=0, imageCount=0, videoCount=0;
  for(const [index,range] of ranges.entries()){
    const summary=canonical ? validateCanonicalClip(range,index) : validateLegacyRange(range,index);
    if(summary.type==='video'){ videoCount++; totalDurationSec+=summary.duration; }
    else imageCount++;
  }
  return {
    path:manifestPath,
    title:String((topLevelArray ? '' : data.title)||'Scene 精确片段'),
    rangeCount:ranges.length,
    totalDurationSec:Number(totalDurationSec.toFixed(2)),
    imageCount,
    videoCount,
    format:topLevelArray?'canonical-array':canonical?'canonical-clips':'legacy-source-ranges',
  };
}

module.exports={inspectMediaManifest};
