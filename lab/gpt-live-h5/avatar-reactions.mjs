// Cosmetic only: coalesce stable phrases, never await on the speech/tool path.
// Picture variation is local; quiet waiting never polls the model.
export function createAvatarReactions({request,apply,attend=()=>{},current=()=>({}),isCurrent=()=>true,isVisible=()=>true,now=Date.now,observe=()=>{}}) {
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
  const ownEpoch=epoch,ownUser=latest.userSignature,payload={...latest.context,...current()};lastSignature=signature;lastSent=now();dirtySince=null;busy=true;
  const ownController=controller=new AbortController();const timeout=setTimeout(()=>ownController.abort(),1800);
  try{
   observe({type:'requested',revision:++revision});
   const result=await request({...payload,revision},{signal:ownController.signal});
   // Streaming V's reply does not invalidate a reaction to the same user's
   // completed meaning. Revised/new user speech still invalidates it.
   const valid=!closed&&!ownController.signal.aborted&&isCurrent()&&epoch===ownEpoch&&ownUser===latest?.userSignature;
   if(valid&&result?.picture){apply(result);observe({type:'applied',revision,picture:result.picture});}
   else observe({type:valid?'uncertain':'superseded',revision});
  }catch{observe({type:ownController.signal.aborted?'aborted':'failed',revision});}finally{
   clearTimeout(timeout);busy=false;
   if(!closed&&JSON.stringify(latest?.context)!==lastSignature){dirtySince??=now();schedule();}
  }
 }
 return {
  update({snapshot,activity='idle',taskOutcome='none'}){
   if(closed)return;
   const rows=[...(snapshot?.history??[]),...(snapshot?.current??[])].filter(r=>['user','assistant'].includes(r.role)&&r.speaker!=='V · 完整方案'&&typeof r.text==='string'&&r.text.trim());
   // snapshot splits finished/history from unfinished/current; concatenation
   // alone can put an old unfinished user after V's newer completed reply.
   rows.sort((a,b)=>{const na=/^turn-(\d+)$/.exec(a.key),nb=/^turn-(\d+)$/.exec(b.key);return na&&nb?Number(na[1])-Number(nb[1]):Number.isFinite(a.at)&&Number.isFinite(b.at)?a.at-b.at:0;});
   const user=rows.filter(r=>r.role==='user').at(-1),nextEpoch=user?.key??'';
   const last=rows.at(-1);
   if(nextEpoch!==epoch){controller?.abort();if(user)attend();}
   epoch=nextEpoch;
   const context={turns:rows.slice(-6).map(r=>({role:r.role,text:r.text.slice(-600)})),activity,taskOutcome,speaker:last?.role??null};
   if(JSON.stringify(context)===JSON.stringify(latest?.context))return;
   latest={context,userSignature:JSON.stringify(user?{key:user.key,text:user.text}:null)};dirtySince??=now();schedule();
  },
  resume(){if(latest){dirtySince=now();schedule();}},
  dispose(){closed=true;clearTimeout(timer);controller?.abort();latest=null;},
 };
}
