import fs from "node:fs";
const [file,a,b,topN=40,filter=""]=process.argv.slice(2);
const p=JSON.parse(fs.readFileSync(file,"utf8"));
const nodes=new Map(p.nodes.map(n=>[n.id,n])); const parent=new Map(); for(const n of p.nodes) for(const c of n.children||[]) parent.set(c,n.id);
const short=u=>(u||"").replace(/^file:\/\/.*?\/dist\//,"dist/");
const key=n=>`${n.callFrame.functionName||"(anon)"} ${short(n.callFrame.url)}:${n.callFrame.lineNumber+1}`;
let t=0; const incl=new Map(); let tot=0;
for(let i=0;i<p.samples.length;i++){ t+=p.timeDeltas[i]/1000; const d=(p.timeDeltas[i+1]??0)/1000; if(t<+a||t>=+b) continue; tot+=d;
 const seen=new Set(); let id=p.samples[i]; while(id!=null){const k=key(nodes.get(id)); if(!seen.has(k)){seen.add(k); incl.set(k,(incl.get(k)||0)+d);} id=parent.get(id);} }
console.log("window",a,b,"ms",tot.toFixed(0));
[...incl].filter(([k])=>!k.includes("node:internal")&&k.includes(filter)).sort((x,y)=>y[1]-x[1]).slice(0,+topN).forEach(([k,v])=>console.log(v.toFixed(0).padStart(6),k));
