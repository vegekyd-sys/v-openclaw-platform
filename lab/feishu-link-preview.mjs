// Feishu's url.preview.get arrives on the Gateway's long connection, the only
// one an app may hold without losing events. Forward it to v-link-preview and
// return whatever comes back; on any failure return nothing, so the link stays
// a plain link. Awaits only network I/O: never read Gateway state here.
const MAX_RESPONSE=30*1024;
export async function feishuLinkPreview(data,{endpoint=process.env.OPENCLAW_FEISHU_LINK_PREVIEW_URL,fetchImpl=fetch,timeoutMs=2000,log=()=>{}}={}) {
  if(!endpoint)return undefined;
  const context=(data?.event??data)?.context,url=context?.url;
  if(typeof url!=='string'||url.length>4096)return undefined;
  const started=Date.now();
  try {
    const response=await fetchImpl(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url,previewToken:context.preview_token}),redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
    if(response.status!==200)return undefined;
    const text=await response.text();
    if(text.length>MAX_RESPONSE)throw Error('response too large');
    return JSON.parse(text);
  } catch(error) {
    log(`feishu: link preview unavailable after ${Date.now()-started} ms: ${error.message}`);
    return undefined;
  }
}
