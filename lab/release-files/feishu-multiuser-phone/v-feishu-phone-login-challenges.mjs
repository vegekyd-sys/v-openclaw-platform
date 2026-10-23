import {randomBytes} from 'node:crypto';
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/u.test(value);
const fail=()=>{throw Error('phone_login_unavailable');};

// Only the authenticated Feishu message dispatcher may confirm a challenge.
// The code proves interaction with that bot; native policy still admits the
// subject to the requested conversation before identity reaches the web host.
export function createPhoneLoginChallenges({now=Date.now,ttlMs=300000,maxPending=512}={}) {
  const pending=new Map(),codes=new Map(),limits=new Map();
  const remove=ticket=>{const row=pending.get(ticket);if(row)codes.delete(row.code);pending.delete(ticket);};
  const sweep=()=>{for(const [ticket,row] of pending)if(row.expiresAt<=now())remove(ticket);
    for(const [key,row] of limits)if(row.until<=now())limits.delete(key);};
  return {
    begin({accountId,appId,chatId,clientId}) {
      sweep();
      if(!id(accountId)||!/^cli_[A-Za-z0-9]+$/u.test(appId??'')||!/^oc_[A-Za-z0-9]+$/u.test(chatId??'')||!clientId)fail();
      const key=accountId+':'+chatId,limit=limits.get(key);
      if(pending.size>=maxPending||(limit?.count??0)>=3)fail();
      limits.set(key,{count:(limit?.count??0)+1,until:limit?.until??now()+60000});
      const ticket=randomBytes(32).toString('base64url');
      let code;do{code=randomBytes(6).toString('hex').toUpperCase();}while(codes.has(code));
      const expiresAt=now()+ttlMs;
      pending.set(ticket,{accountId,appId,chatId,clientId,code,expiresAt,identity:null});codes.set(code,ticket);
      return {ticket,code:code.match(/.{4}/g).join('-'),expiresAt};
    },
    // A recognizable login command is always consumed, including expired or
    // wrong-account codes. It must never become a paid model/tool request.
    observe({accountId,appId,event}) {
      if(event?.message?.message_type!=='text')return false;
      let text;try{text=JSON.parse(event.message.content).text?.trim();}catch{return false;}
      if(typeof text!=='string'||!/^电话登录(?:\s|$)/u.test(text))return false;
      sweep();
      const match=/^电话登录\s+([A-Fa-f0-9]{4}-?[A-Fa-f0-9]{4}-?[A-Fa-f0-9]{4})$/u.exec(text);
      if(!match||event.message.chat_type!=='p2p'||event.sender?.sender_type!=='user')return true;
      const code=match[1].replaceAll('-','').toUpperCase(),row=pending.get(codes.get(code));
      if(!row||row.identity||row.accountId!==accountId||row.appId!==appId)return true;
      const sender=event.sender,openId=sender.sender_id?.open_id,tenantKey=sender.tenant_key;
      if(!/^ou_[A-Za-z0-9]+$/u.test(openId??'')||!id(tenantKey)||!/^oc_[A-Za-z0-9]+$/u.test(event.message.chat_id??''))return true;
      const created=Number(event.message.create_time);
      if(!Number.isSafeInteger(created)||created<row.expiresAt-ttlMs-5000||created>now()+5000)return true;
      row.identity={openId,tenantKey,...(id(sender.sender_id?.user_id)?{userId:sender.sender_id.user_id}:{}),dynamic:true};
      row.sourceChatId=event.message.chat_id;
      return true;
    },
    take({ticket,clientId}) {
      sweep();const row=pending.get(ticket);
      if(!row||row.clientId!==clientId)fail();
      if(!row.identity)return {status:'pending'};
      remove(ticket);return {status:'confirmed',...row};
    },
  };
}
export const phoneLoginChallenges=createPhoneLoginChallenges();
