// Shared by all voice providers. Coalesce streaming captions, never await on
// the speech/tool path. Only spoken rows enter this in-memory context.
export function createAvatarReactions({request,apply,isCurrent=()=>true,isVisible=()=>true,now=Date.now}) {
 let closed=false,busy=false,timer=null,latest=null,epoch='',revision=0,lastSent=-Infinity,lastSignature='',controller;
 const schedule=()=>{if(closed||busy||timer||!latest||!isVisible())return;timer=setTimeout(run,Math.max(650,5000-(now()-lastSent)));};
 async function run(){
  timer=null;if(closed||!isCurrent()||!isVisible()||!latest)return;
  const signature=JSON.stringify(latest.context);if(signature===lastSignature)return;
  const ownEpoch=epoch,payload=latest.context;lastSignature=signature;lastSent=now();busy=true;controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),2500);
  try{const result=await request({...payload,revision:++revision},{signal:controller.signal});if(!closed&&!controller.signal.aborted&&isCurrent()&&epoch===ownEpoch&&result?.picture)apply(result.picture);}catch{}finally{clearTimeout(timeout);busy=false;if(!closed&&JSON.stringify(latest?.context)!==lastSignature)schedule();}
 }
 return {
  update({snapshot,activity='idle',taskOutcome='none'}){
   if(closed)return;
   const rows=[...(snapshot?.history??[]),...(snapshot?.current??[])].filter(r=>['user','assistant'].includes(r.role)&&r.speaker!=='V · 完整方案'&&typeof r.text==='string'&&r.text.trim()).slice(-6);
   const last=rows.at(-1);epoch=`${last?.key??''}:${activity}:${taskOutcome}`;
   latest={context:{turns:rows.map(r=>({role:r.role,text:r.text.slice(-600)})),activity,taskOutcome}};schedule();
  },
  resume(){schedule();},
  dispose(){closed=true;clearTimeout(timer);controller?.abort();latest=null;},
 };
}
