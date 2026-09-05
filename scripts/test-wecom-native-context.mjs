// Hermetic checks against the actual installed plugin. No CLI child/auth/network.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {patchWecomEntry,patchWecomTool} from './patch-wecom-runtime-config.mjs';
const root=process.argv[2];
assert(root?.includes('/labs/instances/'), 'Private VLab instance only');
const toolPath=path.join(root,'dist/src/cli/tool.js');
const before=fs.readFileSync(toolPath,'utf8');
const entry=fs.readFileSync(path.join(root,'dist/index.js'),'utf8');
assert.equal(patchWecomEntry(patchWecomEntry(entry)),patchWecomEntry(entry));
assert.equal(patchWecomTool(patchWecomTool(before)),patchWecomTool(before));
// A throwaway adjacent module preserves the real plugin's relative imports.
const candidate=toolPath+'.native-context-test.mjs';
assert(!fs.existsSync(candidate));
fs.writeFileSync(candidate,patchWecomTool(before),{mode:0o600});
try {
 const old=await import(pathToFileURL(toolPath));
 const fixed=await import(pathToFileURL(candidate));
 const args={args:['contact','users','search','--json','{"keywords":["test"]}']};
 const emptyConfig={channels:{wecom:{enabled:true}}};
 const baseline=await old.createWeComCliTool({getRuntimeConfig:()=>emptyConfig}).execute('baseline',args);
 assert.match(baseline.details.error,/运行时未初始化/);
 const noCreds=await fixed.createWeComCliTool({getRuntimeConfig:()=>emptyConfig}).execute('fixed',args);
 assert.match(noCreds.details.error,/未配置 botId/);
 const multi={channels:{wecom:{accounts:{alpha:{},beta:{}}}}};
 const denied=await fixed.createWeComCliTool({getRuntimeConfig:()=>multi}).execute('multi',args);
 assert.match(denied.details.error,/缺少账号上下文/);
 const absent=await fixed.createWeComCliTool({getRuntimeConfig:()=>undefined}).execute('absent',args);
 assert.match(absent.details.error,/运行时未初始化/);
 const unavailable=await fixed.createWeComCliTool({getRuntimeConfig:()=>{throw Error('config unavailable');}}).execute('unavailable',args);
 assert.equal(unavailable.details.error,'config unavailable');
 const injected=await fixed.createWeComCliTool({getRuntimeConfig:()=>multi}).execute('injected',{...args,accountId:'alpha',config:emptyConfig});
 assert.match(injected.details.error,/缺少账号上下文/);
 console.log(JSON.stringify({baselineReproduced:true,contextConfigUsed:true,multiAccountFailClosed:true,missingConfigFailClosed:true,modelCannotOverrideConfig:true,idempotent:true,networkCalls:0}));
}finally{fs.unlinkSync(candidate);}
