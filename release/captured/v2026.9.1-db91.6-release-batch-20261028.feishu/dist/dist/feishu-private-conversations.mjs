import {constants} from 'node:fs';
import {open,rename,unlink} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';

const app=v=>/^cli_[A-Za-z0-9]+$/u.test(v??'');
const user=v=>/^ou_[A-Za-z0-9]+$/u.test(v??'');
const chat=v=>/^oc_[A-Za-z0-9]+$/u.test(v??'');
const maxBytes=2*1024*1024;
const pendingFiles=new Map();
export async function readPrivateConversations(file) {
  let handle;
  try {
    handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
    const stat=await handle.stat();
    if(!stat.isFile()||(stat.mode&0o777)!==0o600||stat.size>maxBytes)throw Error('invalid_private_directory');
    const value=JSON.parse(await handle.readFile('utf8'));
    if(value.version!==1||!Array.isArray(value.bindings)||value.bindings.length>8192||value.bindings.some(r=>!app(r.appId)||!user(r.openId)||!chat(r.chatId)||!Number.isSafeInteger(r.updatedAt)))throw Error('invalid_private_directory');
    return value;
  } catch(error) {if(error.code==='ENOENT')return {version:1,bindings:[]};throw error;}
  finally {await handle?.close();}
}

// Invoked only after the native event's p2p and operator membership checks.
// This is a locator, never an identity grant; Voice still verifies OAuth and
// Gateway still checks membership and the ordinary text-chat admission policy.
export function createPrivateConversationWriter({file,now=Date.now}) {
  return row=>{
    if(!file)return Promise.resolve();
    if(!app(row.appId)||!user(row.openId)||!chat(row.chatId))return Promise.reject(Error('invalid_private_directory'));
    const work=(pendingFiles.get(file)??Promise.resolve()).then(async()=>{
      const value=await readPrivateConversations(file),at=now();
      value.bindings=value.bindings.filter(r=>r.updatedAt>at-30*86400000&&!(r.appId===row.appId&&r.openId===row.openId));
      value.bindings.push({...row,updatedAt:at});value.bindings=value.bindings.slice(-8192);
      const tmp=file+'.'+randomBytes(8).toString('hex')+'.tmp';let handle;
      try {handle=await open(tmp,'wx',0o600);await handle.writeFile(JSON.stringify(value));await handle.sync();await handle.close();handle=null;await rename(tmp,file);}
      finally {await handle?.close();await unlink(tmp).catch(error=>{if(error.code!=='ENOENT')throw error;});}
    });
    const settled=work.catch(()=>{});pendingFiles.set(file,settled);
    void settled.then(()=>{if(pendingFiles.get(file)===settled)pendingFiles.delete(file);});return work;
  };
}
