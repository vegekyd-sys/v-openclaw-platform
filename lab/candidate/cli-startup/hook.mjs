import {registerHooks,getCompileCacheDir} from 'node:module';
import {performance} from 'node:perf_hooks';
import fs from 'node:fs';
const mods=[];
registerHooks({load(url,ctx,next){const t=performance.now();const r=next(url,ctx);mods.push({u:url.replace(/^file:\/\//,''),b:r.source?.length??0,at:+t.toFixed(1),rd:+(performance.now()-t).toFixed(2)});return r;}});
const out=process.env.CLI_SLOW_OUT;
process.on('exit',()=>{if(!out)return;try{const m=performance.nodeTiming;fs.writeFileSync(`${out}.${process.pid}.json`,JSON.stringify({argv:process.argv.slice(2),end:performance.now(),nodeStart:m.nodeStart,v8Start:m.v8Start,env:m.environment,boot:m.bootstrapComplete,loop:m.loopStart,cache:getCompileCacheDir?.(),usage:process.resourceUsage(),n:mods.length,bytes:mods.reduce((a,x)=>a+x.b,0),last:mods.at(-1),mods}));}catch{}});
