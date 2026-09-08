import assert from 'node:assert/strict';
// Apply only the exact affinity delta from the accepted source, preserving other runtime fixes.
export function planAffinity(before,accepted){
 assert(!before.includes('worker-affinity.1'));
 const between=(a,b)=>{const i=accepted.indexOf(a);assert(i>=0&&accepted.indexOf(a,i+a.length)<0);const j=accepted.indexOf(b,i+a.length);assert(j>i);return accepted.slice(i+a.length,j);};
 const changes=[
 ['    this.sessionOwners = new Map();\n','    this.sessionOwners = new Map();\n'+between('    this.sessionOwners = new Map();\n','    this.pending = [];')],
 ['  async pump() {',between('  preferredSessionWorker(key) {','  async pump() {').replace(/^/,'  preferredSessionWorker(key) {')+'  async pump() {'],
 ['          worker = [...this.workers.values()].find(','          worker = this.preferredSessionWorker(job.sessionOwnerKey) ?? [...this.workers.values()].find('],
 ['        this.pending.shift();\n','        this.pending.shift();\n        this.rememberSessionWorker(job.sessionOwnerKey, worker);\n'],
 ['  onExit(worker, code, signal) {\n','  onExit(worker, code, signal) {\n    for (const [key, hint] of this.sessionAffinity)\n      if (hint.worker === worker) this.sessionAffinity.delete(key);\n'],
 ['    this.workers.clear();\n    this.sessionOwners.clear();','    this.workers.clear();\n    this.sessionOwners.clear();\n    this.sessionAffinity.clear();']
 ];
 let next=before;for(const [a,b]of changes){assert.equal(next.split(a).length,2,'unique affinity anchor');next=next.replace(a,b);}
 let restored=next;for(const[a,b]of [...changes].reverse()){assert.equal(restored.split(b).length,2);restored=restored.replace(b,a);}assert.equal(restored,before);
 return next;
}
