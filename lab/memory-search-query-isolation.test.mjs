import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { patchMemorySearchManager, patchMemorySearchTools } from './patch-memory-search-query-isolation.mjs';

const tools = fs.readFileSync(new URL('./release-files/memory-search-timeout-tools.js', import.meta.url), 'utf8');
const manager = fs.readFileSync(new URL('./release-files/memory-vector-chunks-manager.js', import.meta.url), 'utf8');
const originalTools = tools
  .replace('const memoryManagerPurpose = options.oneShotCliRun ? "cli" : "search";', 'const memoryManagerPurpose = options.oneShotCliRun ? "cli" : void 0;')
  .replace('if (isActiveMemoryManagerContext(context)) {', 'if (memoryManagerPurpose === "cli" && isActiveMemoryManagerContext(context)) {');
const originalManager = manager
  .replace('return purpose === "status" || purpose === "cli" || purpose === "maintenance" || purpose === "search" ? purpose : "default";', 'return purpose === "status" || purpose === "cli" || purpose === "maintenance" ? purpose : "default";')
  .replace('\t\t\tif (!hasIndexedContent && this.purpose === "search") return [];\n', '')
  .replace('\t\t\tconst canRepairMissingIdentity = indexIdentity.status === "missing" && hasIndexedContent && this.purpose !== "search";\n\t\t\tif (canRepairMissingIdentity) await this.syncAdmitted({', '\t\t\tif (indexIdentity.status === "missing" && hasIndexedContent) await this.syncAdmitted({')
  .replace('\t\t\tlet repairedIndexIdentity = canRepairMissingIdentity ?', '\t\t\tlet repairedIndexIdentity = indexIdentity.status === "missing" && hasIndexedContent ?');

test('patches both deployed inputs exactly and rejects a second application', () => {
  assert.equal(patchMemorySearchTools(originalTools), tools);
  assert.equal(patchMemorySearchManager(originalManager), manager);
  assert.throws(() => patchMemorySearchTools(tools), /manager purpose/);
  assert.throws(() => patchMemorySearchManager(manager), /purpose normalizer/);
});

test('agent memory_search uses a transient manager and closes it', () => {
  assert.match(tools, /const memoryManagerPurpose = options\.oneShotCliRun \? "cli" : "search";/);
  assert.match(tools, /if \(isActiveMemoryManagerContext\(context\)\) \{/);
  assert.doesNotMatch(tools, /memoryManagerPurpose === "cli" && isActiveMemoryManagerContext/);
});

test('search is a normalized transient purpose', () => {
  const start = manager.indexOf('function isTransientMemoryIndexManagerPurpose(purpose) {');
  const end = manager.indexOf('\nfunction resolveMemoryIndexManagerCacheKey(', start);
  const api = vm.runInNewContext(`${manager.slice(start, end)}\n({isTransientMemoryIndexManagerPurpose,normalizeMemoryIndexManagerPurpose})`);
  assert.equal(api.normalizeMemoryIndexManagerPurpose('search'), 'search');
  assert.equal(api.isTransientMemoryIndexManagerPurpose('search'), true);
  assert.equal(api.normalizeMemoryIndexManagerPurpose('unknown'), 'default');
});

test('search purpose cannot start a source sync or identity rebuild', () => {
  const start = manager.indexOf('\tasync searchCandidates(normalizedQuery, opts) {');
  const end = manager.indexOf('\n\thasIndexedContent() {', start);
  const search = manager.slice(start, end);
  assert.match(search, /if \(!hasIndexedContent && this\.purpose === "search"\) return \[\];/);
  assert.match(search, /canRepairMissingIdentity = indexIdentity\.status === "missing" && hasIndexedContent && this\.purpose !== "search"/);
  assert.match(search, /enabled: .*this\.purpose === "default" \|\| this\.purpose === "cli"/);
});
