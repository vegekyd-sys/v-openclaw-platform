import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export const TESTED_CODEX_SHA256='56ef98ab4032d317ab26e9b5e5a175650717351edb16ed9cde0cb6d1734d62da';
export function setCommand(config, command) {
  config.plugins??={};config.plugins.entries??={};config.plugins.entries.codex??={};
  config.plugins.entries.codex.config??={};config.plugins.entries.codex.config.appServer??={};
  const server=config.plugins.entries.codex.config.appServer;
  const before={existed:Object.hasOwn(server,'command'),value:server.command};
  server.command=command;return before;
}
function write(file,c) {
  const stat=fs.statSync(file),tmp=`${file}.astra-cli-${process.pid}.tmp`;
  fs.writeFileSync(tmp,JSON.stringify(c,null,2)+'\n',{flag:'wx',mode:stat.mode&0o777});
  fs.chownSync(tmp,stat.uid,stat.gid);fs.renameSync(tmp,file);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [action,main,overlay,binary,backup]=process.argv.slice(2);
  assert(['apply','rollback'].includes(action));assert(main&&overlay&&binary&&backup);
  if(action==='apply') {
    assert(!fs.existsSync(backup),'Fresh backup path required');
    assert.equal(createHash('sha256').update(fs.readFileSync(binary)).digest('hex'),TESTED_CODEX_SHA256,'Binary differs from accepted Linux x64 Codex 0.153.4');
    assert.equal(execFileSync(binary,['--version'],{encoding:'utf8',timeout:10000}).trim(),'codex-cli 0.153.4');
    const plan=[main,overlay].map(file=>{
      const config=JSON.parse(fs.readFileSync(file)),before=setCommand(config,binary);
      return {file,config,before,after:binary};
    });
    fs.mkdirSync(backup,{recursive:true,mode:0o700});
    for(const [i,item] of plan.entries()) {fs.copyFileSync(item.file,`${backup}/${i}.before.json`);fs.chmodSync(`${backup}/${i}.before.json`,0o600);}
    fs.writeFileSync(`${backup}/command-policy.json`,JSON.stringify(plan.map(({config,...p})=>p),null,2),{mode:0o600});
    for(const p of plan)write(p.file,p.config);
  } else {
    const plan=JSON.parse(fs.readFileSync(`${backup}/command-policy.json`));assert.deepEqual(plan.map(p=>p.file),[main,overlay]);
    const prepared=plan.map(p=>{
      const config=JSON.parse(fs.readFileSync(p.file)),server=config.plugins?.entries?.codex?.config?.appServer;
      assert.equal(server?.command,p.after,'Concurrent Codex command change; rollback refused');
      if(p.before.existed)server.command=p.before.value;else delete server.command;
      return {file:p.file,config};
    });
    for(const p of prepared)write(p.file,p.config);
  }
  console.log(JSON.stringify({action,codexVersion:'0.153.4',defaultModelsChanged:false,credentialsChanged:false,backup}));
}
