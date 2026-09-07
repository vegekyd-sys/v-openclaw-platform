import fs from 'node:fs';
// A systemd UMask=0077 must not silently make installed public code unreadable.
export function replacePublicCode(filename, bytes, metadata) {
 const tmp=filename+'.firstword-'+process.pid+'.tmp';
 fs.writeFileSync(tmp,bytes,{mode:metadata.mode,flag:'wx'});
 fs.chmodSync(tmp,metadata.mode);
 fs.chownSync(tmp,metadata.uid,metadata.gid);
 fs.renameSync(tmp,filename);
}
