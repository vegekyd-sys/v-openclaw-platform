// Read-only business API checks. Never installs a plugin or opens a channel.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const lab = os.hostname() === 'VM-0-4-ubuntu';
assert(lab || os.hostname() === 'VM-8-2-ubuntu');
const base = '/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const state = lab ? base + '/state' : '/home/openclaw/.openclaw';
const unit = lab ? 'openclaw-vlab-production-mirror-v8.service' : 'openclaw-gateway.service';
const plugin = lab ? state + '/extensions/wecom-openclaw-plugin' : state + '/backups/wecom-native-config-20260906/probe-only';
const pid = () => execFileSync('systemctl', ['show', unit, '-p', 'MainPID', '--value'], {encoding:'utf8'}).trim();
const beforePid = pid();
for (const item of fs.readFileSync(`/proc/${beforePid}/environ`, 'utf8').split('\0').filter(Boolean)) {
  const index = item.indexOf('=');
  process.env[item.slice(0,index)] = item.slice(index+1);
}
Object.assign(process.env, {OPENCLAW_CONFIG_PATH:state+'/openclaw.json', OPENCLAW_STATE_DIR:state});
const cfg = JSON.parse(fs.readFileSync(state+'/openclaw.json'));
const wecom = cfg.channels?.wecom;
const configured = !!(wecom?.botId && wecom?.secret) || Object.values(wecom?.accounts ?? {}).some(a => a.botId && a.secret);
const output = process.stdout.write.bind(process.stdout);
const report = value => output(JSON.stringify(value)+'\n');
if (!configured) {
  report({lab,configured:false,gatewayPidUnchanged:pid()===beforePid});
  process.exit(0);
}
const owner = fs.statSync(state+'/openclaw.json');
process.chdir(state);
process.setgid(owner.gid); process.setuid(owner.uid);
// Vendor warnings can include authorization links or identifiers. Summaries only.
for (const method of ['log','warn','error','info','debug']) console[method] = () => {};
const {createWeComCliTool} = await import(plugin+'/dist/src/cli/tool.js');
const tool = createWeComCliTool({accountId:'default',getRuntimeConfig:()=>cfg});
report({lab,configured:true,candidateVersion:JSON.parse(fs.readFileSync(plugin+'/package.json')).version});
const cases = [
  ['contact',['contact','users','search'],{keywords:['Tianyi']}],
  ['documents',['doc','search'],{keywords:['测试'],limit:3}],
  ['disk',['disk','files','list'],{limit:3}],
  ['calendar',['calendar','schedules','list'],{begin_time:'2026-09-06 00:00:00',end_time:'2026-09-06 23:59:59'}],
  ['meeting',['meeting','list'],{begin_time:'2026-09-06 00:00:00',end_time:'2026-09-06 23:59:59',limit:3}],
  ['todo',['todo','list'],{limit:3}],
  ['recent-conversations',['message','aibot','sessions','list'],{}],
];
for (const [label,args,body] of cases) {
  const start = Date.now();
  try {
    const r = await tool.execute('authorization-recheck-'+label,{args:[...args,'--json',JSON.stringify(body)]});
    let d = r.details ?? {};
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {unparsed:true}; } }
    let data = d;
    if (typeof d.stdout === 'string') { try { data = JSON.parse(d.stdout); } catch {} }
    const raw = JSON.stringify(r);
    const code = data?.errcode ?? data?.error?.code ?? (raw.includes('850003') ? 850003 : undefined);
    report({label,ms:Date.now()-start,isError:!!(r.isError||d.error),status:d.status,errcode:code,
      expired:raw.includes('850003'),runtimeMissing:raw.includes('插件运行时未初始化'),
      detailKeys:Object.keys(d),stdoutBytes:d.stdoutBytes,apiOk:data?.ok??data?.success,
      resultKeys:data && typeof data==='object' ? Object.keys(data) : [],
      arrayCounts:data && typeof data==='object' ? Object.fromEntries(Object.entries(data).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.length])) : {}});
  } catch (error) {
    report({label,exception:true,expired:String(error).includes('850003'),runtimeMissing:String(error).includes('插件运行时未初始化')});
  }
}
report({lab,gatewayPidUnchanged:pid()===beforePid});
