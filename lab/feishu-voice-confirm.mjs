import {createHmac} from 'node:crypto';
import {readPhoneTabSettings} from './feishu-phone-tabs.mjs';

export const VOICE_CONFIRM_ACTION='v.voice.confirm.v1';
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/u.test(value);
// Called only inside the native SDK's authenticated card.action.trigger ingress.
// Never register this parser as a public HTTP endpoint.
export function voiceConfirmationIdentity(data,account) {
  const event=data?.event??data,value=event?.action?.value;
  if(value?.action!==VOICE_CONFIRM_ACTION)return null;
  if(data?.header?.app_id&&data.header.app_id!==account.appId)throw Error('invalid_confirmation');
  const operator=event.operator,context=event.context;
  if(!/^[A-Za-z0-9_-]{43}$/u.test(value.request??'')||!id(operator?.tenant_key)||
    !/^ou_[A-Za-z0-9]+$/u.test(operator?.open_id??'')||!/^oc_[A-Za-z0-9]+$/u.test(context?.open_chat_id??'')||
    !/^om_[A-Za-z0-9]+$/u.test(context?.open_message_id??''))throw Error('invalid_confirmation');
  return {version:1,request:value.request,accountId:account.accountId,appId:account.appId,
    tenantKey:operator.tenant_key,openId:operator.open_id,...(id(operator.user_id)?{userId:operator.user_id}:{}),
    chatId:context.open_chat_id,messageId:context.open_message_id};
}
export async function confirmVoiceCard(data,{account,settings,fetchImpl=fetch,now=Date.now}) {
  let identity;
  try {identity=voiceConfirmationIdentity(data,account);} catch {return {toast:{type:'error',content:'身份确认无效，请从电话页重新发起。'}};}
  if(!identity)return null;
  if(settings?.cardConfirmation!==true||settings.appId!==account.appId)return {toast:{type:'error',content:'此电话入口尚未开启飞书确认。'}};
  // The destination is operator-managed configuration, never a card value.
  const url=new URL(settings.url);url.search='';url.pathname+='/confirm/callback';
  const raw=JSON.stringify({...identity,issuedAt:now()});
  const signature=createHmac('sha256',account.appSecret).update('voice-card-confirm-v1\n'+raw).digest('base64url');
  try {
    const response=await fetchImpl(url,{method:'POST',headers:{'content-type':'application/json','x-voice-confirm-signature':signature},body:raw,redirect:'error',signal:AbortSignal.timeout(2200)});
    const result=await response.json();
    return {toast:response.ok&&result.confirmed===true?{type:'success',content:'已确认，请回到刚才的电话页面。'}:{type:'error',content:'请求已失效或没有此会话权限，请回到电话页重试。'}};
  } catch {return {toast:{type:'error',content:'暂时未能确认，请稍后再点一次。'}};}
}
export async function runtimeVoiceCardConfirmation(data,{account}) {
  if((data?.event??data)?.action?.value?.action!==VOICE_CONFIRM_ACTION)return null;
  try {return await confirmVoiceCard(data,{account,settings:await readPhoneTabSettings(process.env.OPENCLAW_FEISHU_PHONE_TABS_FILE,account)});}
  catch{return {toast:{type:'error',content:'电话身份确认暂不可用。'}};}
}
