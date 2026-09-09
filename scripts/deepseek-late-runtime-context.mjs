// Experimental transport-only layout. Core prompt and transcript are never edited.
export const cacheBoundary='\n<!-- OPENCLAW_CACHE_BOUNDARY -->\n';
export function placeDeepSeekRuntimeContext(messages,context,model,enabled=process.env.OPENCLAW_DEEPSEEK_LATE_RUNTIME_CONTEXT==='1'){
 if(!enabled||model?.provider!=='deepseek'||model?.id!=='deepseek-v4-pro')return messages;
 const prompt=context?.systemPrompt;
 if(typeof prompt!=='string'||!Array.isArray(messages))return messages;
 const at=prompt.indexOf(cacheBoundary);
 if(at<=0||prompt.indexOf(cacheBoundary,at+cacheBoundary.length)!==-1)return messages;
 const first=messages[0],prefix=prompt.slice(0,at),suffix='\n'+prompt.slice(at+cacheBoundary.length);
 // Only a single, byte-identical native system message is eligible. Do not
 // reinterpret provider sanitization, structured text, or existing instructions.
 if(first?.role!=='system'||first.content!==prefix+suffix||!suffix.trim())return messages;
 if(messages.slice(1).some(m=>m.role==='system'||m.role==='developer'))return messages;
 const lastUser=messages.findLastIndex(m=>m.role==='user');
 if(lastUser<2||!messages.slice(1,lastUser).some(m=>m.role==='assistant'))return messages;
 // Short/new conversations must retain the existing cache layout. Moving their
 // small prefix costs more than it saves on the first subsequent turn.
 let historyChars=0;
 for(let i=1;i<lastUser&&historyChars<131072;i++){
  const content=messages[i].content;
  if(typeof content==='string')historyChars+=content.length;
  else if(Array.isArray(content))for(const part of content)if(part.type==='text'&&typeof part.text==='string')historyChars+=part.text.length;
 }
 if(historyChars<131072)return messages;
 try{globalThis[Symbol.for('db91.hi.deep')]?.mark('runtime-context-layout',{stableSystemChars:prefix.length,dynamicSystemChars:suffix.length,historyPrefixMessages:lastUser-1,nativeMessageCount:messages.length,requestMessageCount:messages.length+1});}catch{/* No diagnostic failure may affect the request. */}
 // Keep current user + subsequent tool continuation contiguous. Dynamic context
 // retains the same system authority and every original character. No histories,
 // tool definitions, reasoning settings, safety policy, or user bytes are removed.
 return [{...first,content:prefix},...messages.slice(1,lastUser),{...first,content:suffix},...messages.slice(lastUser)];
}
