#!/usr/bin/env node
// Run on VLab through the existing private SSH alias. No production default.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {buildConfig, validateName, requireOwner, assertSafeConfig} from './config.mjs';

const ROOT = '/srv/vlab-production-mirror/labs';
const NODE = '/opt/vlab/node-v22.23.1-linux-x64/bin/node';
const MAX_RUNNING = 2;
const MIN_FREE = 3 * 1024 ** 3;
const [command, name, ...argv] = process.argv.slice(2);
const opts = {};
let extra = [];
for (let i=0; i<argv.length; i++) {
  if (argv[i] === '--') {extra = argv.slice(i+1); break;}
  if (!argv[i].startsWith('--') || !argv[i+1]) throw Error('Options require values');
  opts[argv[i].slice(2)] = argv[++i];
}
const run = (bin,args,options={}) => execFileSync(bin,args,{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,...options})?.trim() ?? '';
const read = p => JSON.parse(fs.readFileSync(p,'utf8'));
const save = (p,v,mode=0o600) => fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n',{mode});
function fail(message) {throw Error(message);}
function manifests() {
  return fs.readdirSync(`${ROOT}/control`).filter(f=>f.endsWith('.json') && f!=='integration.json').map(f=>read(`${ROOT}/control/${f}`));
}
function active(m) {return ['active','activating','deactivating','reloading'].includes(run('systemctl',['show',m.unit,'-p','ActiveState','--value']));}
function env(m) {
  const r=m.root;
  return {PATH:`${path.dirname(NODE)}:/usr/local/bin:/usr/bin:/bin`,HOME:r,USER:m.user,LOGNAME:m.user,
    OPENCLAW_HOME:r,OPENCLAW_STATE_DIR:`${r}/state`,OPENCLAW_CONFIG_PATH:`${r}/state/openclaw.json`,
    OPENCLAW_WORKSPACE_DIR:`${r}/workspace`,OPENCLAW_GATEWAY_PORT:String(m.port),
    CODEX_HOME:`${r}/codex`,XDG_CACHE_HOME:`${r}/cache`,TMPDIR:`${r}/tmp`,
    VLAB_OPENCLAW_AGENT_RUNTIME:`${r}/runtime/openclaw/dist/plugin-sdk/agent-runtime.js`,
    npm_config_cache:`${r}/cache/npm`,npm_config_prefix:`${r}/runtime/user-npm`};
}
function properties(m) {
  return [`User=${m.user}`,`Group=${m.user}`,`WorkingDirectory=${m.root}/workspace`,
    'MemoryHigh=2G','MemoryMax=3G','CPUQuota=100%','TasksMax=256','NoNewPrivileges=yes',
    'ProtectSystem=strict','ProtectHome=yes','PrivateTmp=yes',`ReadWritePaths=${m.root}`,
    'UMask=0077',`EnvironmentFile=${m.root}/secrets.env`];
}
function unitArgs(m) {return [...properties(m).map(p=>`--property=${p}`),...Object.entries(env(m)).map(([k,v])=>`--setenv=${k}=${v}`)];}
function audit(action, m, detail={}) {
  fs.appendFileSync(`${ROOT}/control/audit.log`,JSON.stringify({at:new Date().toISOString(),action,name:m.name,owner:m.owner,commit:m.commit,...detail})+'\n',{mode:0o600});
}
function check(m) {
  requireOwner(m, opts.owner);
  assertSafeConfig(read(`${m.root}/state/openclaw.json`), m.root, m.port);
  if (fs.realpathSync(m.root) !== m.root) fail('Instance root must not be a symlink');
  walk(`${m.root}/runtime`,(p,e)=>{
    if(e.isSymbolicLink()&&!fs.realpathSync(p).startsWith(m.root+'/'))fail('Runtime symlink escaped instance: '+p);
  });
}
function freeDisk() {const s=fs.statfsSync(ROOT); return s.bavail*s.bsize;}
function walk(dir, fn) {
  for(const ent of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    const p=path.join(dir,ent.name);
    fn(p,ent);
    if(ent.isDirectory()) walk(p,fn);
  }
}
function fingerprint(dir) {
  const hash=createHash('sha256'); let files=0;
  walk(dir,(p,e)=>{
    const relative=path.relative(dir,p);
    if(e.isSymbolicLink()) {
      const target=fs.realpathSync(p);
      if(!target.startsWith(dir+'/')) fail(`External symlink in baseline: ${relative}`);
      hash.update(relative+'\0'+fs.readlinkSync(p));
    } else if(e.isFile()) {hash.update(relative+'\0');hash.update(fs.readFileSync(p));files++;}
  });
  return {sha256:hash.digest('hex'),files};
}
function lock(fn) {
  const p=`${ROOT}/control/operation.lock`;
  try {fs.mkdirSync(p,{mode:0o700});} catch {fail('Another labctl operation is running. Inspect operation.lock before recovering it; never steal it.');}
  try {fs.writeFileSync(`${p}/pid`,String(process.pid)); return fn();}
  finally {fs.unlinkSync(`${p}/pid`);fs.rmdirSync(p);}
}
function start(m) {
  check(m);
  if(active(m)) fail('Instance is already running');
  if(manifests().filter(active).length >= MAX_RUNNING) fail('Two-instance CPU/memory budget reached; stop your unused instance first');
  if(freeDisk()<MIN_FREE) fail('Less than 3 GiB free on data disk');
  if(run('ss',['-ltnH',`sport = :${m.port}`])) fail('Port is occupied; refusing to start');
  try {run('systemctl',['reset-failed',m.unit],{stdio:['ignore','pipe','ignore']});} catch { /* New transient units have no failure state. */ }
  run('systemd-run',['--quiet','--collect',`--unit=${m.unit}`,...unitArgs(m),
    '--property=Restart=no','--property=TimeoutStopSec=30','--property=KillMode=control-group',
    NODE,'--max-old-space-size=1536',`${m.root}/runtime/openclaw/dist/index.js`,'gateway','--port',String(m.port)]);
  audit('start',m);
  console.log(JSON.stringify({name:m.name,state:'start-requested-not-accepted',port:m.port}));
}

try {
  if(os.hostname()!=='VM-0-4-ubuntu' || process.getuid()!==0) fail('Run as root on VLab only, through the private SSH alias');
  if(command==='list') {
    console.log(JSON.stringify(manifests().map(m=>({name:m.name,owner:m.owner,branch:m.branch,commit:m.commit,port:m.port,running:active(m)})),null,2));
  } else if(command==='seal') {
    validateName(name);
    const base=`${ROOT}/baselines/${name}`;
    if(fs.existsSync(`${base}/baseline.json`)) fail('Baseline already sealed; create a new version instead');
    const sum=fingerprint(`${base}/runtime`);
    save(`${base}/baseline.json`,{name,at:new Date().toISOString(),source:opts.source??'explicit-code-only-snapshot',...sum});
    run('chown',['-R','root:root',base]);
    run('chmod',['-R','a-w',base]);
    console.log(JSON.stringify({name,...sum}));
  } else if(command==='create') {
    lock(()=>{
      validateName(name);
      for(const k of ['owner','baseline','bundle','branch','commit']) if(!opts[k]) fail(`Missing --${k}`);
      validateName(opts.baseline);
      if(!/^[0-9a-f]{40}$/.test(opts.commit)) fail('Use an exact 40-character Git commit');
      const base=`${ROOT}/baselines/${opts.baseline}`;
      const seal=read(`${base}/baseline.json`);
      const root=`${ROOT}/instances/${name}`;
      const record=`${ROOT}/control/${name}.json`;
      if(fs.existsSync(root)||fs.existsSync(record)) fail('Name already exists; never overwrite an instance');
      const size=Number(run('du',['-sb',`${base}/runtime`]).split(/\s/)[0]);
      if(freeDisk()-size-100*1024**2<MIN_FREE) fail('Copy would violate the 3 GiB free-space reserve');
      const current=fingerprint(`${base}/runtime`);
      if(current.sha256!==seal.sha256) fail('Baseline checksum changed');
      const used=new Set(manifests().map(m=>m.port)); let port=26100;
      while(used.has(port)||run('ss',['-ltnH',`sport = :${port}`])) port+=20;
      if(port>26900) fail('Development port range exhausted');
      const user=`lab-${name}`;
      try {run('id',['-u',user],{stdio:['ignore','pipe','ignore']});fail('Linux user already exists');}
      catch(e) {if(e.message==='Linux user already exists')throw e;}
      fs.mkdirSync(root,{mode:0o700});
      const m={name,owner:opts.owner,branch:opts.branch,commit:opts.commit,baseline:opts.baseline,baselineSha256:seal.sha256,root,user,port,unit:`openclaw-lab-${name}.service`,createdAt:new Date().toISOString(),state:'creating'};
      save(record,m);
      run('useradd',['--system','--user-group','--home-dir',root,'--shell','/usr/sbin/nologin',user]);
      run('setfacl',['-m',`u:${user}:--x`,'/srv/vlab-production-mirror']);
      run('cp',['-a','--reflink=auto',`${base}/runtime`,root],{timeout:300000});
      run('chmod',['-R','u+w',`${root}/runtime`]);
      for(const d of ['state','workspace','codex','cache','tmp'])fs.mkdirSync(`${root}/${d}`,{mode:0o700});
      run('git',['clone','--quiet','--no-hardlinks','--branch',opts.branch,opts.bundle,`${root}/source`]);
      const actual=run('git',['-C',`${root}/source`,'rev-parse','HEAD']);
      if(actual!==opts.commit)fail('Bundle HEAD does not match requested commit');
      let provider,secret='';
      if(opts['provider-config']) {
        provider=structuredClone(read(opts['provider-config']).models?.providers?.deepseek);
        if(!provider||typeof provider.apiKey!=='string'||provider.apiKey.includes('${')||/[\r\n"\\]/.test(provider.apiKey)) fail('Expected a directly available DeepSeek key; do not copy OAuth/session databases');
        secret=`DEEPSEEK_API_KEY="${provider.apiKey}"\n`;
        delete provider.apiKey;
      }
      const {config,overlay}=buildConfig(root,port,{provider,worker:opts.worker!=='false'});
      save(`${root}/state/openclaw.json`,config);save(`${root}/state/worker-openclaw.json`,overlay);
      fs.writeFileSync(`${root}/secrets.env`,secret,{mode:0o600});
      fs.writeFileSync(`${root}/workspace/AGENTS.md`,'This is an isolated development experiment. Work only inside this instance. No production business, messaging channels, external config edits, or shared Gateway restarts.\n');
      run('chown',['-R',`${user}:${user}`,root],{timeout:300000});
      m.state='created';save(record,m);audit('create',m);
      console.log(JSON.stringify({name,port,owner:m.owner,branch:m.branch,commit:m.commit,root}));
    });
  } else if(command==='lease') {
    lock(()=>{
      if(name!=='integration'||!opts.owner)fail('lease integration requires --owner');
      const p=`${ROOT}/control/integration.json`;
      const old=fs.existsSync(p)?read(p):null;
      if(opts.release==='true') {
        requireOwner(old??{},opts.owner);fs.unlinkSync(p);console.log('Integration lease released');return;
      }
      // No expiry stealing: an absent heartbeat does not prove a safe restart window.
      if(old&&old.owner!==opts.owner)fail(`Integration is leased by ${old.owner}; request an explicit handoff`);
      const lease={owner:opts.owner,at:new Date().toISOString(),service:'openclaw-vlab-production-mirror-v8.service',port:24993};
      save(p,lease);console.log(JSON.stringify(lease));
    });
  } else {
    validateName(name);
    const m=read(`${ROOT}/control/${name}.json`);
    requireOwner(m,opts.owner);
    if(command==='start')lock(()=>start(m));
    else if(command==='stop') {run('systemctl',['stop',m.unit]);audit('stop',m);console.log('Stopped only '+name);}
    else if(command==='restart')lock(()=>{check(m);run('systemctl',['stop',m.unit]);start(m);});
    else if(command==='status') {
      console.log(JSON.stringify({name,owner:m.owner,branch:m.branch,commit:m.commit,port:m.port,root:m.root}));
      console.log(run('systemctl',['show',m.unit,'-p','ActiveState,MainPID,NRestarts,MemoryCurrent,MemoryPeak,MemoryHigh,MemoryMax,CPUQuotaPerSecUSec']));
    } else if(command==='candidate') {
      check(m);
      if(!/^[0-9a-f]{40}$/.test(opts.commit??''))fail('Candidate requires exact --commit');
      const git=args=>run('runuser',['-u',m.user,'--','git','-C',`${m.root}/source`,...args]);
      if(git(['rev-parse','HEAD'])!==opts.commit)fail('Commit does not match instance source HEAD');
      if(git(['status','--porcelain']))fail('Commit source changes before recording a candidate');
      m.candidate={commit:opts.commit,branch:git(['branch','--show-current']),runtime:fingerprint(`${m.root}/runtime`),at:new Date().toISOString(),acceptance:'NOT_IMPLIED_BY_HASH'};
      save(`${ROOT}/control/${name}.json`,m);audit('candidate',m,{candidate:m.candidate});console.log(JSON.stringify(m.candidate));
    } else if(command==='cli') {
      check(m);if(!extra.length)fail('Use cli NAME --owner OWNER -- gateway health --json');
      run('systemd-run',['--quiet','--wait','--pipe','--collect',`--unit=lab-cli-${name}-${process.pid}`,...unitArgs(m),
        NODE,`${m.root}/runtime/openclaw/dist/index.js`,...extra],{stdio:'inherit',timeout:180000});
    } else fail('Commands: seal/create/list/start/stop/restart/status/cli/lease. Mutations require explicit instance + owner.');
  }
} catch(e) {console.error(e.message);process.exitCode=1;}
