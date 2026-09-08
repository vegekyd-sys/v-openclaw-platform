import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
const scope=new AsyncLocalStorage();
const hash=s=>createHash('sha256').update(s).digest('hex');
let previousSystem;
export const db91Deep={
  run(message,fn){return /^DB91_HI_[0-9]+_[a-z0-9_]+$/.test(message?.runId)&&message.sessionKey?.includes('db91-hi-')?scope.run(message.runId,fn):fn();},
  mark(stage,fields={}){const runId=scope.getStore();if(runId)globalThis[Symbol.for('db91.hi.trace')]?.mark(runId,'deep-'+stage,fields);},
  model(context){
    if(!scope.getStore())return;
    const system=typeof context?.systemPrompt==='string'?context.systemPrompt:JSON.stringify(context?.systemPrompt??null);
    const tools=JSON.stringify(context?.tools??[]);
    let sharedPrefixChars=null;
    if(previousSystem!==undefined){sharedPrefixChars=0;while(sharedPrefixChars<Math.min(system.length,previousSystem.length)&&system[sharedPrefixChars]===previousSystem[sharedPrefixChars])sharedPrefixChars++;}
    this.mark('context-shape',{systemChars:system.length,systemHash:hash(system),toolsChars:tools.length,toolsHash:hash(tools),sharedPrefixChars,
      messageChars:(context?.messages??[]).reduce((n,m)=>n+JSON.stringify(m).length,0),messages:context?.messages?.length??0});
    previousSystem=system;
  },
};
globalThis[Symbol.for('db91.hi.deep')]=db91Deep;
