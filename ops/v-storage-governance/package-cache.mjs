import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {GIB,processReferences,writeJsonAtomic} from './core.mjs';

const npmRoot='/home/openclaw/.npm';
const npmCache=npmRoot+'/_cacache';
const pnpmRoot='/home/openclaw/.local/share/pnpm/store';
const node='/opt/node-v22.23.1/bin/node';
const npmCli='/opt/node-v22.23.1/lib/node_modules/npm/bin/npm-cli.js';
const pnpmClis=['/opt/pnpm-10.32.1/lib/node_modules/pnpm/bin/pnpm.cjs','/home/openclaw/.local/share/pnpm/.tools/pnpm/11.2.2_tmp_62272_0/node_modules/pnpm/bin/pnpm.mjs'];
const bytes=p=>fs.existsSync(p)?Number(execFileSync('du',['-s','-B1',p],{encoding:'utf8'}).split(/\s/)[0]):0;
export function prunePackageCaches(policy,{apply,rootPressure}){
  const before={npmBytes:bytes(npmCache),pnpmBytes:bytes(pnpmRoot)};
  const total=before.npmBytes+before.pnpmBytes;
  if(total<GIB||(!rootPressure&&total<4*GIB))return{action:'package-cache-below-limit',...before};
  const stamp=path.join(policy.stateRoot,'last-package-gc.json');
  if(!rootPressure&&fs.existsSync(stamp)&&Date.now()-Date.parse(JSON.parse(fs.readFileSync(stamp,'utf8')).at)<7*24*3600_000)return{action:'package-cache-cooldown',...before};
  for(const p of [npmRoot,pnpmRoot])if(fs.existsSync(p))assert.equal(fs.realpathSync(p),p,'Package cache root must not be a symlink');
  const busy=processReferences([npmCache,pnpmRoot]);
  if(busy.length)return{action:'package-cache-busy',processes:busy,...before};
  for(const pid of fs.readdirSync('/proc').filter(p=>/^\d+$/.test(p))){
    let cmd;try{cmd=fs.readFileSync('/proc/'+pid+'/cmdline','utf8').replaceAll('\0',' ');}catch(e){if(['ENOENT','ESRCH'].includes(e.code))continue;throw e;}
    if(/(?:npm|pnpm|yarn)(?:-cli\.js|\.cjs|\.mjs)?\s+(?:install|i|add|update|rebuild|cache|store)(?:\s|$)/.test(cmd))return{action:'package-manager-operation-in-progress',pid:Number(pid),...before};
  }
  if(!apply)return{action:'would-prune-native-package-caches',...before};
  const npx=path.join(npmRoot,'_npx'),npxInode=fs.existsSync(npx)?fs.statSync(npx).ino:null;
  const commands=[];
  const asUser=args=>execFileSync('runuser',['-u','openclaw','--',node,...args],{cwd:'/tmp',encoding:'utf8',timeout:180_000,maxBuffer:1024*1024});
  if(before.npmBytes>GIB&&fs.existsSync(npmCli)){
    // The installed npm implementation was inspected: cache clean only removes _cacache.
    const implementation=fs.readFileSync('/opt/node-v22.23.1/lib/node_modules/npm/lib/commands/cache.js','utf8');
    assert(implementation.includes("join(this.npm.cache, '_cacache')")&&implementation.includes('return fs.rm(cachePath, { recursive: true, force: true })'),'npm cache implementation changed; review required');
    asUser([npmCli,'cache','clean','--force','--cache',npmRoot]);commands.push('npm-cache-clean-only-cacache');
  }
  if(before.pnpmBytes>GIB)for(const cli of pnpmClis){
    if(!fs.existsSync(cli))continue;
    const storePath=asUser([cli,'store','path']).trim();
    assert(storePath===pnpmRoot||storePath.startsWith(pnpmRoot+'/'),'pnpm store changed; review required');
    asUser([cli,'store','prune']);commands.push('pnpm-native-unreferenced-store-prune');
  }
  if(npxInode!==null)assert.equal(fs.statSync(npx).ino,npxInode,'_npx installs must remain');
  const result={at:new Date().toISOString(),action:'native-package-cache-prune',before,after:{npmBytes:bytes(npmCache),pnpmBytes:bytes(pnpmRoot)},commands};
  writeJsonAtomic(stamp,result);return result;
}
