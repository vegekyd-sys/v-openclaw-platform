// Lab-only diagnostic. No remote browser credentials or browser control.
import {definePluginEntry} from 'openclaw/plugin-sdk/plugin-entry';
import {randomUUID} from 'node:crypto';
import {createPluginRuntimeStore} from 'openclaw/plugin-sdk/runtime-store';
export default definePluginEntry({id:'lab-browser-routing-probe',register(api){
 const store=createPluginRuntimeStore({key:`lab-browser-routing-probe:${process.env.OPENCLAW_CONFIG_PATH}`,errorMessage:'Lab browser runtime not initialized'});
 if(!store.tryGetRuntime())store.setRuntime({id:randomUUID().slice(0,8),seen:new Set()});
 const {id,seen}=store.getRuntime();
 const log=(event,ctx={})=>api.logger.warn(JSON.stringify({probe:true,event,id,mode:api.registrationMode,hasSession:!!ctx.sessionKey,seen:seen.has(ctx.sessionKey)}));
 log('register');
 api.registerTool(ctx=>({name:'lab_browser_mark',description:'Mark this Lab session for the browser hook diagnostic. No browser control.',parameters:{type:'object',properties:{},additionalProperties:false},async execute(){seen.add(ctx.sessionKey);log('mark',ctx);return {content:[{type:'text',text:'LAB_BROWSER_MARK_OK'}]};}}),{name:'lab_browser_mark'});
 api.on('before_tool_call',(event,ctx)=>{if(event.toolName!=='browser')return;log('before-browser',ctx);return {block:true,blockReason:seen.has(ctx.sessionKey)?'LAB_BROWSER_SAME_MANAGER':'LAB_BROWSER_DIFFERENT_MANAGER'};},{priority:100});
}});
