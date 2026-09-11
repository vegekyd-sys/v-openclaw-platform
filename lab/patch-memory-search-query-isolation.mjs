import assert from 'node:assert/strict';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchMemorySearchTools(source) {
  let out = replaceExactlyOnce(
    source,
    'const memoryManagerPurpose = options.oneShotCliRun ? "cli" : void 0;',
    'const memoryManagerPurpose = options.oneShotCliRun ? "cli" : "search";',
    'memory tool manager purpose',
  );
  out = replaceExactlyOnce(
    out,
    'if (memoryManagerPurpose === "cli" && isActiveMemoryManagerContext(context)) {',
    'if (isActiveMemoryManagerContext(context)) {',
    'transient memory manager cleanup guard',
  );
  return out;
}

export function patchMemorySearchManager(source) {
  let out = replaceExactlyOnce(
    source,
    'return purpose === "status" || purpose === "cli" || purpose === "maintenance" ? purpose : "default";',
    'return purpose === "status" || purpose === "cli" || purpose === "maintenance" || purpose === "search" ? purpose : "default";',
    'memory manager purpose normalizer',
  );

  const searchStart = out.indexOf('\tasync searchCandidates(normalizedQuery, opts) {');
  const searchEnd = out.indexOf('\n\thasIndexedContent() {', searchStart);
  assert(searchStart >= 0 && searchEnd > searchStart, 'Memory search implementation not found');
  let search = out.slice(searchStart, searchEnd);

  search = replaceExactlyOnce(
    search,
    '\t\t\tlet hasIndexedContent = this.hasIndexedContent();\n\t\t\tif (!hasIndexedContent) {\n\t\t\t\ttry {',
    '\t\t\tlet hasIndexedContent = this.hasIndexedContent();\n\t\t\tif (!hasIndexedContent && this.purpose === "search") return [];\n\t\t\tif (!hasIndexedContent) {\n\t\t\t\ttry {',
    'read-only search bootstrap guard',
  );

  search = replaceExactlyOnce(
    search,
    '\t\t\tif (indexIdentity.status === "missing" && hasIndexedContent) await this.syncAdmitted({',
    '\t\t\tconst canRepairMissingIdentity = indexIdentity.status === "missing" && hasIndexedContent && this.purpose !== "search";\n\t\t\tif (canRepairMissingIdentity) await this.syncAdmitted({',
    'read-only missing identity repair guard',
  );
  search = replaceExactlyOnce(
    search,
    '\t\t\tlet repairedIndexIdentity = indexIdentity.status === "missing" && hasIndexedContent ? embeddingBootstrapKeywordOnly ? this.refreshKeywordFallbackIndexIdentity() : this.refreshIndexIdentityDirty({ providerKeyKnown: this.providerInitialized }) : indexIdentity;',
    '\t\t\tlet repairedIndexIdentity = canRepairMissingIdentity ? embeddingBootstrapKeywordOnly ? this.refreshKeywordFallbackIndexIdentity() : this.refreshIndexIdentityDirty({ providerKeyKnown: this.providerInitialized }) : indexIdentity;',
    'missing identity refresh guard',
  );

  return out.slice(0, searchStart) + search + out.slice(searchEnd);
}
