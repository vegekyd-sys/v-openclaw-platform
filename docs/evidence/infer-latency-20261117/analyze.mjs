import fs from "node:fs";
const file = process.argv[2]; const topN = +(process.argv[3]||25);
const p = JSON.parse(fs.readFileSync(file,"utf8"));
const nodes = new Map(p.nodes.map(n=>[n.id,n]));
const parent = new Map(); for (const n of p.nodes) for (const c of n.children||[]) parent.set(c,n.id);
const wall=(p.endTime-p.startTime)/1000;
const self=new Map(), selfFile=new Map(), incl=new Map();
const short=u=>(u||"").replace(/^file:\/\/.*?\/dist\//,"dist/").replace(/^file:\/\/.*?node_modules\//,"nm/");
const fnKey=n=>`${n.callFrame.functionName||"(anon)"} ${short(n.callFrame.url)}:${n.callFrame.lineNumber+1}`;
const dt=p.timeDeltas; let total=0;
const timeline=[]; let t=0;
for (let i=0;i<p.samples.length;i++){ const d=(dt[i+1]??0)/1000; t+=dt[i]/1000; const n=nodes.get(p.samples[i]); total+=d;
  const k=fnKey(n); self.set(k,(self.get(k)||0)+d); const fk=short(n.callFrame.url)||n.callFrame.functionName; selfFile.set(fk,(selfFile.get(fk)||0)+d);
  const seen=new Set(); let id=n.id; while(id!=null){const nn=nodes.get(id); const kk=fnKey(nn); if(!seen.has(kk)){seen.add(kk); incl.set(kk,(incl.get(kk)||0)+d);} id=parent.get(id);}
  timeline.push([t,n]); }
const pr=(m,title)=>{console.log(`\n== ${title}`); [...m].sort((a,b)=>b[1]-a[1]).slice(0,topN).forEach(([k,v])=>console.log(v.toFixed(0).padStart(7),"ms ",k));};
console.log("wall ms",wall.toFixed(0),"sampled",total.toFixed(0));
pr(selfFile,"self by file"); pr(self,"self by function"); pr(incl,"inclusive by function");
// timeline: per 500ms bucket, dominant non-idle frame (deepest dist frame)
const B=+(process.argv[4]||500); const buckets=new Map();
for (const [tt,n] of timeline){ const b=Math.floor(tt/B); let id=n.id, lab=null; const stack=[]; while(id!=null){stack.push(nodes.get(id)); id=parent.get(id);} 
 const top=stack[0].callFrame.functionName; if(top==="(idle)"){lab="(idle)";} else { const fr=stack.find(s=>/dist\//.test(short(s.callFrame.url))); lab=fr?fnKey(fr):fnKey(stack[0]); }
 const m=buckets.get(b)||new Map(); m.set(lab,(m.get(lab)||0)+1); buckets.set(b,m);}
console.log("\n== timeline");
for (const [b,m] of [...buckets].sort((a,b)=>a[0]-b[0])){ const tot=[...m.values()].reduce((a,c)=>a+c,0); const top=[...m].sort((a,b)=>b[1]-a[1]).slice(0,2).map(([k,v])=>`${(100*v/tot).toFixed(0)}% ${k}`).join(" | "); console.log(String(b*B).padStart(6), top);}
