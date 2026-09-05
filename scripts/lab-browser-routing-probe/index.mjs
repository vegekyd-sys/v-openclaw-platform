// Lab-only diagnostic. No remote browser credentials or browser control.
import {definePluginEntry} from 'openclaw/plugin-sdk/plugin-entry';
import {randomUUID} from 'node:crypto';
export default definePluginEntry({id:'lab-browser-routing-probe',register(api){
 const id=randomUUID().slice(0,8), seen=new Set();
 const log=(event,ctx={})=>api.logger.warn(JSON.stringify({probe:true,event,id,mode:api.registrationMode,hasSession:!!ctx.sessionKey,seen:seen.has(ctx.sessionKey)}));
 log('register');
 api.registerTool(ctx=>({name:'lab_browser_mark',description:'Mark this Lab session for the browser hook diagnostic. No browser control.',parameters:{type:'object',properties:{},additionalProperties:false},async execute(){seen.add(ctx.sessionKey);log('mark',ctx);return {content:[{type:'text',text:'LAB_BROWSER_MARK_OK'}]};}}),{name:'lab_browser_mark'});
 api.on('before_tool_call',(event,ctx)=>{if(event.toolName!=='browser')return;log('before-browser',ctx);return {block:true,blockReason:seen.has(ctx.sessionKey)?'LAB_BROWSER_SAME_MANAGER':'LAB_BROWSER_DIFFERENT_MANAGER'};},{priority:100});
}});
