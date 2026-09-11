import assert from 'node:assert/strict';

export function patchMemoryVectorChunks(source){
 assert(!source.includes('withMemorySemanticBudget'),'Refusing the shelved keyword fallback candidate');
 const begin=source.indexOf('\tensureVectorTable(dimensions) {');
 const end=source.indexOf('\n\tdropLegacyVectorTable()',begin);
 assert(begin>=0&&end>begin,'Vector-table creation method not found');
 const original=source.slice(begin,end);assert(!original.includes('chunk_size'),'Vector chunk layout is already explicit');
 const marker='embedding FLOAT[${dimensions}]\\n)';
 assert.equal(original.split(marker).length,2,'Unexpected vector schema');
 let method=original.replace('\t\tif (!this.dropVectorTable())','\t\tif (!Number.isSafeInteger(dimensions) || dimensions < 1) throw new Error("Invalid memory vector dimensions");\n\t\tif (!this.dropVectorTable())');
 assert.notEqual(method,original,'Dimension guard insertion failed');
 method=method.replace('\t\tthis.db.exec(', '\t\t// Keep a vector blob below the ordinary SQLite page-cache budget (768 KiB).\n\t\tconst chunkSize = Math.max(8, Math.min(1024, 2 ** Math.floor(Math.log2(786432 / (dimensions * 4)))));\n\t\tthis.db.exec(');
 method=method.replace(marker,'embedding FLOAT[${dimensions}],\\n  chunk_size=${chunkSize}\\n)');
 return source.slice(0,begin)+method+source.slice(end);
}
