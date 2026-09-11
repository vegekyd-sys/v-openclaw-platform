import assert from 'node:assert/strict';
export function patchMemorySearchTimeout(source){
 const marker='const DEFAULT_MEMORY_SEARCH_TIMEOUT_MS = 15e3;';
 assert.equal(source.split(marker).length,2,'Expected exactly one original 15-second deadline');
 let out=source.replace(marker,'const DEFAULT_MEMORY_SEARCH_TIMEOUT_MS = 25e3;\nconst DEFAULT_MEMORY_NON_SEARCH_TIMEOUT_MS = 15e3;');
 const start=out.indexOf('async function runMemoryCorpusDeadline(params) {'),end=out.indexOf('\nfunction composeMemoryCorpusMetadata(',start);
 assert(start>=0&&end>start,'Corpus deadline implementation not found');
 const old=out.slice(start,end);assert.equal(old.split('DEFAULT_MEMORY_SEARCH_TIMEOUT_MS').length,3,'Unexpected corpus timeout references');
 const next=old.replace('async function runMemoryCorpusDeadline(params) {','async function runMemoryCorpusDeadline(params) {\n\tconst timeoutMs = params.operation === "memory_search" ? DEFAULT_MEMORY_SEARCH_TIMEOUT_MS : DEFAULT_MEMORY_NON_SEARCH_TIMEOUT_MS;').replace('${DEFAULT_MEMORY_SEARCH_TIMEOUT_MS / 1e3}','${timeoutMs / 1e3}').replace('}, DEFAULT_MEMORY_SEARCH_TIMEOUT_MS);','}, timeoutMs);');
 out=out.slice(0,start)+next+out.slice(end);
 const closeStart=out.indexOf('async function closeMemoryManagers('),closeEnd=out.indexOf('\nfunction mergeRankedMemorySearchToolStreams(',closeStart);assert(closeStart>=0&&closeEnd>closeStart,'Cleanup deadline implementation not found');
 const close=out.slice(closeStart,closeEnd);assert.equal(close.split('DEFAULT_MEMORY_SEARCH_TIMEOUT_MS').length,2);
 return out.slice(0,closeStart)+close.replace('DEFAULT_MEMORY_SEARCH_TIMEOUT_MS','DEFAULT_MEMORY_NON_SEARCH_TIMEOUT_MS')+out.slice(closeEnd);
}
