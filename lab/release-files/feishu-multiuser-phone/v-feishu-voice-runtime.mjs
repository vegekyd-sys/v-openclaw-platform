import {createVoiceLoginGateway} from "./v-feishu-voice-login.mjs";
import {createVoiceActorMiddleware} from "./v-feishu-voice-actor.mjs";
import {createFeishuVoicePolicy} from "./v-feishu-voice-policy.mjs";
import {phoneLoginChallenges} from "../../npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/dist/v-feishu-phone-login-challenges.mjs";
import {resolveVoiceFeishuAccount,voiceFeishuPolicyDependencies} from "../../npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/dist/monitor.account-WFdlCDhR.js";
import {createFeishuPhoneTabClient} from "../../npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/dist/client-DMbIL3UH.js";
import {n as commandAuthorization} from "./command-auth-DmNN2m2f.js";
const api=account=>{const client=createFeishuPhoneTabClient(account);return async(method,url)=>{
  const result=await client.request({method,url,timeout:8000});
  if(result?.code!==0)throw Error("feishu_members_unconfirmed");
  return result.data;
}};
const resolvePolicy=createFeishuVoicePolicy(voiceFeishuPolicyDependencies({api,commandAuthorization}));
const prepareActor=createVoiceActorMiddleware({resolveAccount:resolveVoiceFeishuAccount,resolvePolicy});
export const prepareVoiceActor=createVoiceLoginGateway({phoneLoginChallenges,resolveAccount:resolveVoiceFeishuAccount,resolvePolicy,api,prepareActor});
