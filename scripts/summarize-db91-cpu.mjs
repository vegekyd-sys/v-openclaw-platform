import fs from 'node:fs';import assert from 'node:assert/strict';
const file=process.argv[2];assert(/\/db91-cpu-\d+\.cpuprofile$/.test(file));
const p=JSON.parse(fs.readFileSync(file)),nodes=new Map(p.nodes.map(n=>[n.id,n])),parents=new Map();
for(const n of p.nodes)for(const child of n.children??[])parents.set(child,n.id);
const self=new Map(),inclusive=new Map();
for(let i=0;i<p.samples.length;i++){
 const id=p.samples[i],ms=(p.timeDeltas[i]??0)/1000;self.set(id,(self.get(id)??0)+ms);
 for(let key=id;key!==undefined;key=parents.get(key))inclusive.set(key,(inclusive.get(key)??0)+ms);
}
const describe=id=>{const n=nodes.get(id),c=n.callFrame;return {id,name:c.functionName,url:c.url,line:c.lineNumber+1,selfMs:Math.round(self.get(id)??0),inclusiveMs:Math.round(inclusive.get(id)??0)};};
const top=[...self].sort((a,b)=>b[1]-a[1]).slice(0,18).map(([id])=>{const stack=[];for(let k=id;k!==undefined&&stack.length<12;k=parents.get(k))stack.push(describe(k));return stack;});
console.log(JSON.stringify({file,durationMs:Math.round((p.endTime-p.startTime)/1000),top},null,2));
