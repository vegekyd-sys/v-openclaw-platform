// Evidence checks for the synthetic waiting-test case. No session or auth I/O.
const CN_DIGITS={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
const CN_UNITS={十:10,百:100,千:1000};
const NUMBER='(?:[0-9]{1,4}|[零〇一二两三四五六七八九十百千]{1,8})';
const PROGRESS=/(?:后台|V).*(?:开始|正在|现在).*(?:等待|等.{0,6}(?:八|8)秒|sleep|测试|执行)/u;

function numberValue(text){
  if(/^[0-9]+$/u.test(text))return Number(text);
  if([...text].every(c=>c in CN_DIGITS))return Number([...text].map(c=>CN_DIGITS[c]).join(''));
  let sum=0,digit=0;
  for(const c of text){
    if(c in CN_DIGITS)digit=CN_DIGITS[c];
    else if(c in CN_UNITS){sum+=(digit||1)*CN_UNITS[c];digit=0}
    else return null;
  }
  return sum+digit;
}

export function parseCompleteTimestamps(text){
  if(typeof text!=='string')return [];
  const date=new RegExp(`(${NUMBER})\\s*(?:年|[-/])\\s*(${NUMBER})\\s*(?:月|[-/])\\s*(${NUMBER})\\s*(?:日|号)?`,'gu');
  const time=new RegExp(`(?:\\s|[，,。：:])*(凌晨|早上|上午|中午|下午|晚上|傍晚)?\\s*(${NUMBER})\\s*(?:点|时|[:：])\\s*(${NUMBER})\\s*(?:分|[:：])\\s*(${NUMBER})\\s*秒?`,'u');
  const found=[];
  for(const match of text.matchAll(date)){
    const clock=time.exec(text.slice(match.index+match[0].length));
    // A distant unrelated clock must not complete an otherwise partial date.
    if(!clock||clock.index>20)continue;
    const year=numberValue(match[1]),month=numberValue(match[2]),day=numberValue(match[3]);
    let hour=numberValue(clock[2]);
    const minute=numberValue(clock[3]),second=numberValue(clock[4]),period=clock[1];
    if(period&&hour>12)continue;
    if(['下午','晚上','傍晚'].includes(period)&&hour<12)hour+=12;
    if(['凌晨','早上','上午'].includes(period)&&hour===12)hour=0;
    if(period==='中午'&&hour>=1&&hour<=5)hour+=12;
    const value={year,month,day,hour,minute,second};
    if(Object.values(value).some(n=>!Number.isInteger(n))||year<2000||year>2100||hour<0||hour>23||minute<0||minute>59||second<0||second>59)continue;
    const check=new Date(Date.UTC(year,month-1,day));
    if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day)continue;
    found.push(value);
  }
  // The tool may use GNU date's default English output. Accept its complete
  // fields, including explicit AM/PM, without asking the model to rewrite it.
  const english=/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\s*(AM|PM))?\s+([A-Za-z][A-Za-z0-9_+:/-]*|[+-]\d{4})\s+(\d{4})\b/gu;
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  for(const match of text.matchAll(english)){
    const year=Number(match[8]),month=months.indexOf(match[1])+1,day=Number(match[2]);
    let hour=Number(match[3]);const minute=Number(match[4]),second=Number(match[5]),period=match[6];
    if(period&&(hour<1||hour>12))continue;
    if(period==='PM'&&hour<12)hour+=12;
    if(period==='AM'&&hour===12)hour=0;
    if(year<2000||year>2100||hour>23||minute>59||second>59)continue;
    const check=new Date(Date.UTC(year,month-1,day));
    if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day)continue;
    found.push({year,month,day,hour,minute,second});
  }
  return found;
}

export function assessFinalTimestamp(appendTraces,events){
  const finals=appendTraces.filter(x=>x.phase==='final');
  const expected=parseCompleteTimestamps(finals.map(x=>x.text).join(''));
  if(expected.length!==1)return {status:'manual-required',reason:'Backend final lacks one unambiguous complete timestamp'};
  const terminalTurns=events.filter(x=>x.type==='turn.done'&&x.role==='assistant'&&x.at>=finals[0].at);
  const lastTurn=terminalTurns.at(-1);
  const spoken=parseCompleteTimestamps(lastTurn?.text);
  if(!spoken.length)return {status:'manual-required',reason:'Final assistant transcript lacks a complete timestamp',expected:expected[0]};
  const matches=spoken.every(actual=>Object.keys(expected[0]).every(key=>actual[key]===expected[0][key]));
  return {status:matches?'match':'mismatch',expected:expected[0],spoken,assistantTurnAt:lastTurn.at};
}

export function assessEarlyProgress(appendTraces,events,energyWindows){
  const first=appendTraces.find(x=>x.phase==='progress');
  const final=appendTraces.find(x=>x.phase==='final');
  if(!first||!final)return {status:'missing',reason:'Progress/final append boundary missing',energyWindows:[]};
  const activeWindows=energyWindows.filter(x=>x.at>=first.at&&x.at<final.at&&x.rms>2);
  const turns=events.filter(x=>x.type==='turn.done'&&x.role==='assistant');
  for(const turn of turns){
    if(!Number.isFinite(turn.startMs)||!Number.isFinite(turn.endMs))continue;
    const parts=events.filter(x=>x.type==='output_transcript.added'&&x.at>=first.at&&x.at<final.at&&
      Number.isFinite(x.startMs)&&Number.isFinite(x.endMs)&&x.startMs>=turn.startMs-500&&x.endMs<=turn.endMs+500)
      .sort((a,b)=>a.startMs-b.startMs||a.at-b.at);
    let prefix='';
    for(const part of parts){
      prefix+=part.text;
      if(PROGRESS.test(prefix))return {
        status:activeWindows.length?'observed':'transcript-only',
        firstProgressAppendAt:first.at,finalAppendAt:final.at,progressTranscriptAt:part.at,
        progressPrefix:prefix,assistantTurnAt:turn.at,assistantTurnText:turn.text,
        assistantTurnId:turn.turnId??null,association:'assistant native start/end time range',
        energyWindows:activeWindows,
      };
    }
  }
  return {status:'missing',reason:'No explicit progress prefix within one assistant turn before final',energyWindows:activeWindows};
}

export function assessSyntheticLiveEvidence(summary){
  return {
    earlyProgress:assessEarlyProgress(summary.nativeAppendTraces??[],summary.syntheticTranscriptEvents??[],summary.progressRemoteEnergyWindows??[]),
    finalTimestamp:assessFinalTimestamp(summary.nativeAppendTraces??[],summary.syntheticTranscriptEvents??[]),
  };
}
