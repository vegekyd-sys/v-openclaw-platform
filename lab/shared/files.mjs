import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
export function save(p, value) {
  fs.mkdirSync(path.dirname(p), {recursive:true, mode:0o700});
  fs.writeFileSync(p, JSON.stringify(value,null,2)+'\n', {flag:'wx',mode:0o600});
}
export function replace(p, value) {
  const tmp=p+'.'+process.pid+'.tmp'; save(tmp,value); fs.renameSync(tmp,p);
}
export function name(s) { assert(/^[a-z0-9][a-z0-9-]{0,79}$/.test(s??''),'Invalid name'); return s; }
export function relative(s) {
  assert(typeof s==='string' && s.length>0 && !s.includes('\\') && !s.includes('\0') && !path.isAbsolute(s));
  assert(s.split('/').every(x=>x && x!=='.' && x!=='..'), 'Invalid relative path'); return s;
}
export function target(root, rel) {
  relative(rel);
  assert(/^(openclaw|production-worker|worker|npm|codex-code-mode-host|codex-progress-[\w.-]+)\//.test(rel),'Not a runtime code target');
  assert(!/(^|\/)(\.env[^/]*|\.npmrc|auth[^/]*\.json|credentials[^/]*|state|sessions|browser)(\/|$)/i.test(rel),'State or credential target');
  assert(/\.(js|mjs|cjs|json|wasm|map|node|ts|md)$/.test(rel),'Unsupported code extension');
  const dest=path.join(root,rel); let ancestor=dest;
  while(!fs.existsSync(ancestor)) ancestor=path.dirname(ancestor);
  assert(fs.realpathSync(ancestor)===ancestor,'Symlink target or parent; use canonical runtime path');
  assert(fs.realpathSync(root)===root); return dest;
}
export function hashFile(p) {return fs.existsSync(p)?sha(fs.readFileSync(p)):null;}
export function validateFiles(root, files) {
  assert(Array.isArray(files)&&files.length>0&&files.length<=100,'Use 1..100 changed files');
  const seen=new Set(); let bytes=0;
  for(const f of files) {
    target(root,f.target); assert(!seen.has(f.target),'Duplicate target');seen.add(f.target);
    assert(f.before===null||/^[a-f0-9]{64}$/.test(f.before),'Invalid before hash');
    const content=Buffer.from(f.content,'base64');bytes+=content.length;
    assert(content.toString('base64')===f.content&&sha(content)===f.after,'Payload hash mismatch');
  }
  assert(bytes<=64*1024**2,'Release payload exceeds 64 MiB');
}
export function assertVersion(root, files, side) {
  for(const f of files) assert.equal(hashFile(target(root,f.target)),f[side],`Runtime drift: ${f.target}`);
}
// Copy-on-write per file. Never modify a hardlinked baseline inode in place.
export function installFiles(root, files, payloadDir, side) {
  for(const [i,f] of files.entries()) {
    const dest=target(root,f.target);
    if(f[side]===null) { if(fs.existsSync(dest))fs.unlinkSync(dest); continue; }
    const src=path.join(payloadDir,side,String(i)); assert.equal(hashFile(src),f[side]);
    let st=fs.statSync(path.dirname(dest)); if(fs.existsSync(dest))st=fs.statSync(dest);
    const tmp=dest+'.vlab-'+process.pid+'.tmp';
    fs.copyFileSync(src,tmp,fs.constants.COPYFILE_EXCL);
    fs.chmodSync(tmp,st.isDirectory()?0o644:st.mode&0o777);
    if(process.getuid?.()===0)fs.chownSync(tmp,st.uid,st.gid);
    fs.renameSync(tmp,dest);
  }
  assertVersion(root,files,side);
}
export function fingerprint(root) {
  const entries=[];
  function walk(dir) {
    for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
      const p=path.join(dir,e.name),rel=path.relative(root,p);
      if(e.name==='.env'||e.name.startsWith('.env.')||e.name==='.npmrc'||/\.(sqlite|jsonl)$/.test(e.name))continue;
      if(e.isDirectory())walk(p);
      else if(e.isSymbolicLink())entries.push([rel,'link',fs.readlinkSync(p)]);
      else if(e.isFile())entries.push([rel,'file',hashFile(p),fs.statSync(p).mode&0o777]);
      else throw Error('Unexpected non-code file: '+rel);
    }
  }
  walk(root);return {sha256:sha(JSON.stringify(entries)),files:entries.length};
}
export function suspensionReady(s, now=Date.now()) {
  assert(['ready','draining'].includes(s.status)&&s.expiresAtMs>now+5000,'Admission fence not held');
  // OpenClaw 9.1 omits activeCount from the ready status response.
  return s.status==='ready';
}
