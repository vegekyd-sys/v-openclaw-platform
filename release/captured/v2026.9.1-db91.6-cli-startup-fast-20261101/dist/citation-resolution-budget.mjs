// Citation URL resolution is optional enrichment, not another unbounded search.
export async function resolveCitationsWithinBudget(citations, resolveUrl, options={}) {
 const started=Date.now();
 const budgetMs=Math.max(0,Math.min(options.budgetMs??2000,(options.deadlineAt??Infinity)-started));
 const deadlineAt=started+budgetMs;
 const controller=new AbortController();
 const signal=options.signal?AbortSignal.any([options.signal,controller.signal]):controller.signal;
 options.signal?.throwIfAborted();
 const result=citations.map(citation=>({...citation,resolution:'unresolved'}));
 if(!citations.length||budgetMs===0)return {citations:result,resolved:0,unresolved:result.length,elapsedMs:0};
 const timer=setTimeout(()=>controller.abort(new DOMException('Citation enrichment budget exceeded','TimeoutError')),budgetMs);
 const unique=new Map();
 for(let i=0;i<citations.length;i++){
  const url=citations[i].url;
  if(!unique.has(url))unique.set(url,[]);
  unique.get(url).push(i);
 }
 const jobs=[...unique];let cursor=0;
 const worker=async()=>{
  while(cursor<jobs.length&&!signal.aborted){
   const remaining=deadlineAt-Date.now();if(remaining<=0)return;
   const [url,indices]=jobs[cursor++];
   try{
    const resolved=await resolveUrl(url,{signal,timeoutMs:Math.max(1,Math.ceil(remaining))});
    if(typeof resolved==='string'&&resolved){
     for(const i of indices)result[i]={...citations[i],url:resolved,resolution:resolved===url?'unresolved':'resolved'};
    }
   }catch{
    options.signal?.throwIfAborted();
    // Keep the original citation on timeout, guard rejection or transport error.
   }
  }
 };
 try{
  await Promise.all(Array.from({length:Math.min(10,jobs.length)},worker));
  options.signal?.throwIfAborted();
  const resolved=result.filter(x=>x.resolution==='resolved').length;
  return {citations:result,resolved,unresolved:result.length-resolved,elapsedMs:Date.now()-started};
 }finally{clearTimeout(timer);controller.abort();}
}
