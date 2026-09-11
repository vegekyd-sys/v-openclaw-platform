import test from 'node:test';import assert from 'node:assert/strict';
import {patchMemoryVectorChunks} from './patch-memory-vector-chunks.mjs';
const fixture='unchanged header\n\tensureVectorTable(dimensions) {\n\t\tif (this.vector.dims === dimensions && memoryTableExists(this.db, VECTOR_TABLE$2)) return;\n\t\tif (!this.dropVectorTable()) throw new Error("drop failed");\n\t\tthis.db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS ${VECTOR_TABLE$2} USING vec0(\\n  id TEXT PRIMARY KEY,\\n  embedding FLOAT[${dimensions}]\\n)`);\n\t\tthis.vector.dims = dimensions;\n\t}\n\tdropLegacyVectorTable() {}\nunchanged footer';
const patched=patchMemoryVectorChunks(fixture);
function harness({dims,exists=false,dropOk=true}={}){
 const start=patched.indexOf('\tensureVectorTable('),end=patched.indexOf('\n\tdropLegacyVectorTable()',start);
 const method=patched.slice(start,end).trim().replace(/^ensureVectorTable/,'function');
 const run=new Function('memoryTableExists','VECTOR_TABLE$2','return ('+method+');')(()=>exists,'memory_index_chunks_vec');
 const observed={sql:[],drops:0},manager={vector:{dims},db:{exec:s=>observed.sql.push(s)},dropVectorTable(){observed.drops++;return dropOk;}};
 return{run:n=>run.call(manager,n),observed,manager};
}
test('3072-dimensional FP32 vectors use 64 slots / 768 KiB',()=>{const h=harness();h.run(3072);assert.match(h.observed.sql[0],/FLOAT\[3072\]/);assert.match(h.observed.sql[0],/chunk_size=64/);assert.equal(h.manager.vector.dims,3072);});
test('smaller embeddings retain power-of-two cache-bounded chunks',()=>{for(const [dimension,size] of [[1536,128],[768,256],[384,512],[128,1024],[8192,16]]){const h=harness();h.run(dimension);assert.match(h.observed.sql[0],new RegExp('chunk_size='+size+'\\b'));}});
test('healthy existing vectors are never dropped or reindexed on code upgrade',()=>{const h=harness({dims:3072,exists:true});h.run(3072);assert.equal(h.observed.drops,0);assert.equal(h.observed.sql.length,0);});
test('a missing vector table is recreated even when dimensions match metadata',()=>{const h=harness({dims:3072});h.run(3072);assert.equal(h.observed.drops,1);assert.equal(h.observed.sql.length,1);});
test('invalid dimensions fail before destructive reset',()=>{for(const dimension of [0,-1,1.5,NaN,Infinity]){const h=harness();assert.throws(()=>h.run(dimension),/Invalid memory vector dimensions/);assert.equal(h.observed.drops,0);}});
test('failed reset does not create a second table',()=>{const h=harness({dropOk:false});assert.throws(()=>h.run(3072),/drop failed/);assert.equal(h.observed.sql.length,0);});
test('the patch leaves search orchestration and all unrelated source untouched',()=>{assert(patched.startsWith('unchanged header'));assert(patched.endsWith('unchanged footer'));assert(!patched.includes('lexicalOnly'));assert(!patched.includes('withMemorySemanticBudget'));});
test('repeat patch and schema drift fail closed',()=>{assert.throws(()=>patchMemoryVectorChunks(patched),/already explicit/);assert.throws(()=>patchMemoryVectorChunks(fixture.replace('FLOAT[${dimensions}]','FLOAT[1536]')),/Unexpected vector schema/);});
