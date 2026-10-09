// Cosmetic only: coalesce stable phrases, never await on the speech/tool path.
// Picture variation is local; quiet waiting never polls the model.
export function createAvatarReactions({request,apply,attend=()=>{},current=()=>({}),isCurrent=()=>true,isVisible=()=>true,now=Date.now}) {
 let closed=false,busy=false,timer=null,latest=null,epoch='',revision=0,lastSent=-Infinity,lastSignature='',controller,dirtySince=null;
 const schedule=()=>{
  if(closed||busy||!latest||!isVisible())return;
  clearTimeout(timer);
  // Wait for a stable phrase, but don't defer forever while captions stream.
  const wait=Math.max(0,250-(now()-lastSent),Math.min(400,900-(now()-dirtySince)));
  timer=setTimeout(run,wait);
 };
 async function run(){
  timer=null;if(closed||!isCurrent()||!isVisible()||!latest)return;
  const signature=JSON.stringify(latest.context);if(signature===lastSignature)return;
  const ownEpoch=epoch,payload={...latest.context,...current()};lastSignature=signature;lastSent=now();dirtySince=null;busy=true;
  const ownController=controller=new AbortController();const timeout=setTimeout(()=>ownController.abort(),1800);
  try{
   const result=await request({...payload,revision:++revision},{signal:ownController.signal});
   // Don't display a reaction to an obsolete partial phrase or a previous turn.
   if(!closed&&!ownController.signal.aborted&&isCurrent()&&epoch===ownEpoch&&signature===JSON.stringify(latest?.context)&&result?.picture)apply(result);
  }catch{}finally{
   clearTimeout(timeout);busy=false;
   if(!closed&&JSON.stringify(latest?.context)!==lastSignature){dirtySince??=now();schedule();}
  }
 }
 return {
  update({snapshot,activity='idle',taskOutcome='none'}){
   if(closed)return;
   const rows=[...(snapshot?.history??[]),...(snapshot?.current??[])].filter(r=>['user','assistant'].includes(r.role)&&r.speaker!=='V · 完整方案'&&typeof r.text==='string'&&r.text.trim()).slice(-6);
   const last=rows.at(-1),nextEpoch=`${last?.key??''}:${last?.role??''}`;
   if(nextEpoch!==epoch){controller?.abort();if(last?.role==='user')attend();}
   epoch=nextEpoch;
   const context={turns:rows.map(r=>({role:r.role,text:r.text.slice(-600)})),activity,taskOutcome,speaker:last?.role??null};
   if(JSON.stringify(context)===JSON.stringify(latest?.context))return;
   latest={context};dirtySince??=now();schedule();
  },
  resume(){if(latest){dirtySince=now();schedule();}},
  dispose(){closed=true;clearTimeout(timer);controller?.abort();latest=null;},
 };
}
