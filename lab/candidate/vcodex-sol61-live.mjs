import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {configureVcodex, target} from '../release-files/vcodex-sol61/config.mjs';

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const cli = `${runtime}/openclaw/dist/index.js`;
const shared = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && shared);
for (const [key, dir] of Object.entries({TMPDIR:'tmp',XDG_CACHE_HOME:'cache',npm_config_cache:'npm-cache'})) {
  process.env[key]=path.join(process.env.VLAB_CANDIDATE_DATA,dir);
  fs.mkdirSync(process.env[key],{recursive:true,mode:0o700});
}
const redacted = s => String(s).replace(/(Bearer\s+)\S+/gi,'$1[redacted]').replace(/((?:token|api.?key|secret|authorization)[=: ]+)\S+/gi,'$1[redacted]');
function run(args, timeout=180000) {
  const r=spawnSync(process.execPath,[cli,...args],{env:process.env,encoding:'utf8',timeout,maxBuffer:32*1024*1024});
  assert.equal(r.status,0,redacted(`${r.stdout}\n${r.stderr}`).slice(-6000));
  return r.stdout;
}
const cfg=configureVcodex(JSON.parse(fs.readFileSync(configPath,'utf8')));
// 0.156.x predates Sol 6.1. Test the pinned supported client without replacing shared tools.
const codexPrefix=path.join(process.env.VLAB_CANDIDATE_DATA,'codex-0.159.2');
const npm=path.join(path.dirname(process.execPath),'npm');
const install=spawnSync(npm,['install','--prefix',codexPrefix,'--no-audit','--no-fund','@openai/codex@0.159.2'],{env:{...process.env,PATH:`${path.dirname(process.execPath)}:${process.env.PATH}`},encoding:'utf8',timeout:300000,maxBuffer:16*1024*1024});
assert.equal(install.status,0,redacted(install.stderr).slice(-2000));
const codexBin=path.join(codexPrefix,'node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex');
assert(fs.existsSync(codexBin),'Pinned Codex binary missing');
cfg.channels={};
cfg.bindings=[];
cfg.cron={enabled:false};
cfg.plugins.allow=['openai','codex','deepseek'];
cfg.plugins.load={paths:(cfg.plugins.load?.paths ?? []).filter(p=>p.endsWith('/@openclaw/deepseek-provider')).map((source,index)=>{
  const dest=path.join(process.env.VLAB_CANDIDATE_DATA,`deepseek-provider-${index}`);
  fs.cpSync(source,dest,{recursive:true});
  const peer=path.join(dest,'node_modules/openclaw');
  fs.mkdirSync(path.dirname(peer),{recursive:true});
  fs.rmSync(peer,{recursive:true,force:true});
  fs.symlinkSync(path.join(runtime,'openclaw'),peer);
  return dest;
})};
cfg.plugins.entries={codex:cfg.plugins.entries.codex ?? {enabled:true},openai:{enabled:true},deepseek:{enabled:true}};
cfg.plugins.entries.codex.config ??= {};
cfg.plugins.entries.codex.config.codexPlugins={enabled:false};
cfg.plugins.entries.codex.config.appServer ??= {};
cfg.plugins.entries.codex.config.appServer.command=codexBin;
cfg.plugins.entries.codex.config.appServer.homeScope='agent';
cfg.plugins.entries.codex.config.discovery={timeoutMs:30000};
cfg.agents.entries={makaron:cfg.agents.entries.makaron};
cfg.agents.entries.makaron.model={primary:target};
cfg.agents.entries.makaron.models['openai/gpt-6-sol'] ??= {...cfg.agents.entries.makaron.models[target],alias:'candidate-sol60'};
const vdsRef=Object.entries({...cfg.agents.defaults.models,...cfg.agents.entries.makaron.models}).find(([,row])=>row?.alias==='vds')?.[0];
assert(vdsRef,'Existing /vds model missing');
fs.writeFileSync(configPath,JSON.stringify(cfg,null,2)+'\n',{mode:0o600});

// Npm registration is required for a registry-owned native Codex harness.
run(['plugins','install','@openclaw/codex@2026.9.1','--pin','--force','--accept-capabilities','--acknowledge-install-policy-warning'],300000);
// Match the shared harness, including its existing DeepSeek/runtime/progress patches.
const pluginProject=fs.readdirSync(path.join(process.env.OPENCLAW_STATE_DIR,'npm/projects')).find(p=>p.startsWith('openclaw-codex-'));
const sharedProject=fs.readdirSync(path.join(shared,'npm/projects')).find(p=>p.startsWith('openclaw-codex-'));
assert(pluginProject && sharedProject);
fs.cpSync(path.join(shared,'npm/projects',sharedProject,'node_modules/@openclaw/codex/dist'),path.join(process.env.OPENCLAW_STATE_DIR,'npm/projects',pluginProject,'node_modules/@openclaw/codex/dist'),{recursive:true});
const home=path.join(cfg.agents.entries.makaron.agentDir,'codex-home');
fs.mkdirSync(home,{recursive:true,mode:0o700});
// Agent-scoped runs use OpenClaw's auth store. Reuse only DeepSeek's provider definition.
const sharedToml=fs.readFileSync(path.join(shared,'agents/makaron/agent/codex-home/config.toml'),'utf8');
let inProvider=false;
const providerLines=[];
for (const line of sharedToml.split(/\r?\n/)) {
  if (line.trim()==='[model_providers.deepseek]') inProvider=true;
  else if (inProvider && /^\s*\[/.test(line)) break;
  if (inProvider) providerLines.push(line);
}
assert(providerLines.length,'Existing DeepSeek Codex provider missing');
fs.writeFileSync(path.join(home,'config.toml'),providerLines.join('\n')+'\n',{mode:0o600});

// Only copy auth tables, never the multi-GB conversation database. Values stay server-side.
const sourceDb=new DatabaseSync(path.join(shared,'agents/makaron/agent/openclaw-agent.sqlite'),{readOnly:true});
const targetDbPath=path.join(cfg.agents.entries.makaron.agentDir,'openclaw-agent.sqlite');
const targetDb=new DatabaseSync(targetDbPath);
const {a:ensureAgentSchema}=await import(`${runtime}/openclaw/dist/openclaw-agent-db-maintenance-DYSkzMMg.js`);
ensureAgentSchema(targetDb,'makaron',targetDbPath);
for (const table of ['auth_profile_store','auth_profile_state']) {
  const schema=sourceDb.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table);
  if (!schema) continue;
  if (!targetDb.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) targetDb.exec(schema.sql);
  const rows=sourceDb.prepare(`SELECT * FROM ${table}`).all();
  if (!rows.length) continue;
  const columns=Object.keys(rows[0]);
  const insert=targetDb.prepare(`INSERT OR REPLACE INTO ${table} (${columns.map(c=>`"${c}"`).join(',')}) VALUES (${columns.map(()=>'?').join(',')})`);
  targetDb.exec('BEGIN');
  try {for (const row of rows) insert.run(...columns.map(c=>row[c]));targetDb.exec('COMMIT');}
  catch (e) {targetDb.exec('ROLLBACK');throw e;}
}
sourceDb.close();targetDb.close();fs.chmodSync(targetDbPath,0o600);

const workspace=cfg.agents.entries.makaron.workspace;
const nonce=`SOL61_TOOL_${Date.now()}`;
const proof=path.join(workspace,'sol61-proof.txt');
const session=`vlab-dev-sol61-${Date.now()}`;
const raw=run(['agent','--local','--agent','makaron','--session-key',session,'--model',target,'--message',`Use your shell tool to write exactly ${nonce} to ${proof}, read it back with a tool, then reply with exactly ${nonce}. Work only inside ${workspace}.`,'--json','--timeout','300'],360000);
const out=JSON.parse(raw.slice(raw.indexOf('{')));
const result=out.result ?? out;
const text=(result.payloads ?? []).map(p=>p.text??'').join('\n');
const meta=result.meta?.agentMeta;
assert.equal(meta?.model,'gpt-6.1-sol',redacted(JSON.stringify(result.meta)));
assert.equal(meta?.provider,'openai');
assert(text.includes(nonce),redacted(text));
assert.equal(fs.readFileSync(proof,'utf8').trim(),nonce);
const regressions=[];
for (const ref of ['openai/gpt-6-sol','openai/gpt-6-astra',vdsRef]) {
  const token=`REGRESSION_${ref.split('/')[1]}_${Date.now()}`;
  const response=run(['agent','--local','--agent','makaron','--session-key',`${session}-${regressions.length}`,'--model',ref,'--message',`Do not call tools. Reply with exactly ${token}.`,'--json','--timeout','180'],240000);
  const parsed=JSON.parse(response.slice(response.indexOf('{')));
  const rr=parsed.result ?? parsed;
  const reply=(rr.payloads??[]).map(p=>p.text??'').join('\n');
  assert(reply.includes(token),redacted(reply));
  const configured=cfg.agents.entries.makaron.models[ref] ?? cfg.agents.defaults.models[ref];
  const expectedModel=configured?.params?.codexAppServerRuntimeModel ?? ref.split('/')[1];
  assert([ref.split('/')[1],expectedModel].includes(rr.meta?.agentMeta?.model));
  regressions.push({model:rr.meta.agentMeta.model,provider:rr.meta.agentMeta.provider,ok:true});
}
console.log(JSON.stringify({ok:true,session,codexVersion:'0.159.2',codexSha256:createHash('sha256').update(fs.readFileSync(codexBin)).digest('hex'),model:meta.model,provider:meta.provider,runtime:meta.harnessId??meta.runtime,reply:text,toolArtifact:true,regressions}));
