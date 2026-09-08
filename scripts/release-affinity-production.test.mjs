import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
test('atomic production writes retain readable mode despite service umask 0077',()=>{
 const source=fs.readFileSync(new URL('./release-affinity-production.mjs',import.meta.url),'utf8');
 const declaration=source.split('\n').find(x=>x.startsWith('const atomic='));assert(declaration);
 const atomic=new Function('fs',declaration+';return atomic;')(fs),dir=fs.mkdtempSync(path.join(os.tmpdir(),'affinity-mode-')),file=path.join(dir,'pool.mjs');const mask=process.umask();
 try{fs.writeFileSync(file,'before');fs.chmodSync(file,0o644);process.umask(0o077);atomic(file,'after');assert.equal(fs.statSync(file).mode&0o777,0o644);assert.equal(fs.readFileSync(file,'utf8'),'after');}
 finally{process.umask(mask);fs.rmSync(dir,{recursive:true});}
});
