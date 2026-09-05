import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Only disposable profiles created by live-official-fusion-device.mjs.
const root = '/srv/vlab-browser/tmp';
const names = ['2C5GW1','2IMhHA','35ykth','3zEyBK','5ldlrF','aimFN0','AsNtSx','e7WaEk','esZj7C','EUv1fZ','F7K5qr','FUN5ME','iQBIk3','jazrDC','m9ms2B','qA4K38','SN6Ont','u8IUq6','wZoLeH'].map(s => 'vbrowser-official-fusion-chrome-' + s);
if (os.hostname() !== 'VM-0-4-ubuntu') throw new Error('Not the authorized VLab host');
if (fs.realpathSync(root) !== root) throw new Error('Unexpected parent symlink');
const processes = () => fs.readdirSync('/proc').filter(n => /^\d+$/.test(n)).flatMap(pid => {
  try { return [fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0',' ')]; } catch { return []; }
});
const targets = names.map(n => path.join(root,n)).filter(p => fs.existsSync(p));
const rows = targets.map(p => {
  if (fs.lstatSync(p).isSymbolicLink() || fs.realpathSync(p) !== p || path.dirname(p) !== root) throw new Error('Unsafe path');
  if (!fs.existsSync(path.join(p,'Default'))) throw new Error('Not a Chrome test profile');
  if (Date.now() - fs.statSync(p).mtimeMs < 3600000) throw new Error('Recently modified profile');
  if (processes().some(cmd => cmd.includes(p))) throw new Error('Profile still referenced by a process');
  const allocatedBytes = Number(execFileSync('du',['-s','-B1',p],{encoding:'utf8'}).split(/\s+/)[0]);
  return {path:p,allocatedBytes};
});
console.log(JSON.stringify({mode:process.argv.includes('--apply')?'apply':'dry-run',rows,totalAllocatedBytes:rows.reduce((a,b)=>a+b.allocatedBytes,0)}));
if (process.argv.includes('--apply')) for (const row of rows) {
  if (processes().some(cmd => cmd.includes(row.path))) throw new Error('New live reference; stopping cleanup');
  fs.rmSync(row.path,{recursive:true});
}
