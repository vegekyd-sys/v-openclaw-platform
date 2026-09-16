import assert from 'node:assert/strict';

function once(source, before, after) {
  assert.equal(source.split(before).length, 2, `Source anchor drift: ${before.slice(0, 100)}`);
  return source.replace(before, after);
}

export function patchPluginState(source) {
  assert(!source.includes('function pluginStateRegisterBatch('), 'Plugin state batch patch already applied');
  source = once(source, 'function pluginStateRegister(params) {', `// Bounded native batches share retention only while the SQLite writer is held.
function pluginStateRegisterBatch(params, entries) {
\tif (entries.length === 0) return;
\tif (entries.length > 32) throw new RangeError("Plugin state batch exceeds 32 rows");
\ttry {
\t\trunWriteTransaction("register", (store) => {
\t\t\tconst retention = readPluginStateRetention(store.db, { ...params, now: Date.now() });
\t\t\tfor (const entry of entries) registerPluginStateEntry(store, { ...params, ...entry }, retention);
\t\t}, envOptions(params.env));
\t} catch (error) {
\t\tthrow wrapPluginStateError(error, "register", "PLUGIN_STATE_WRITE_FAILED", "Failed to register plugin state batch.");
\t}
}
// One batch per event-loop turn, even when many callers await batches at once.
// A failed batch must not poison the queue. No writer lock spans this wait.
let pluginStateBatchTail = Promise.resolve();
function schedulePluginStateBatch(run) {
\tconst pending = pluginStateBatchTail.then(() => new Promise((resolve, reject) => {
\t\tsetImmediate(() => { try { resolve(run()); } catch (error) { reject(error); } });
\t}));
\tpluginStateBatchTail = pending.catch(() => {});
\treturn pending;
}
function pluginStateRegister(params) {`);
  source = once(source, '\t\tregister: async (...args) => store.register(...args),', `\t\tregister: async (...args) => store.register(...args),
\t\t// Each chunk is atomic; earlier committed chunks remain if a later one fails.
\t\tasync registerMany(entries) {
\t\t\tif (!Array.isArray(entries)) throw invalidInput("plugin state batch must be an array");
\t\t\tfor (let offset = 0; offset < entries.length; offset += 32) {
\t\t\t\tconst batch = entries.slice(offset, offset + 32);
\t\t\t\tawait schedulePluginStateBatch(() => store.registerMany(batch));
\t\t\t}
\t\t},`);
  source = once(source, '\t\tregister(key, value, opts) {', `\t\tregisterMany(entries) {
\t\t\tif (!Array.isArray(entries) || entries.length > 32) throw invalidInput("plugin state sync batch requires at most 32 rows");
\t\t\t// Validate and serialize before BEGIN; do not run caller accessors in a transaction.
\t\t\tconst prepared = entries.map(entry => prepareRegisterParams(entry.key, entry.value, defaultTtlMs, entry.options));
\t\t\tpluginStateRegisterBatch({pluginId, namespace, maxEntries, overflowPolicy, ...env ? {env} : {}}, prepared);
\t\t},
\t\tregister(key, value, opts) {`);
  source = once(source, '\t\tentries: async () => store.entries(),', '\t\tentries: async () => store.entries(),\n\t\tentriesInKeyRange: async range => store.entriesInKeyRange(range),');
  source = once(source, '\t\tentries() {\n\t\t\treturn pluginStateEntries({', `\t\tentriesInKeyRange(range) {
\t\t\tconst keyStartInclusive = validateKey(range.keyStartInclusive, "entries");
\t\t\tconst keyEndExclusive = validateKey(range.keyEndExclusive, "entries");
\t\t\tif (!Number.isSafeInteger(range.limit) || range.limit < 1 || range.limit > maxEntries) throw invalidInput("plugin state range limit exceeds namespace capacity", "entries");
\t\t\treturn pluginStateEntriesInKeyRange({pluginId, namespace, keyStartInclusive, keyEndExclusive, limit: range.limit, ...env ? {env} : {}});
\t\t},
\t\tentries() {
\t\t\treturn pluginStateEntries({`);
  return source;
}

export function patchDreamingState(source) {
  assert(!source.includes('async function listMemoryCoreWorkspaceEntries('), 'Memory state patch already applied');
  source = once(source, 'async function readMemoryCoreWorkspaceEntries(params) {', `async function listMemoryCoreWorkspaceEntries(store, workspaceKey) {
\tif (typeof store.entriesInKeyRange !== "function") return await store.entries();
\t// Keys are SHA256(workspace) + ':' + SHA256(logical key); ';' is exclusive.
\tconst entries = await store.entriesInKeyRange({keyStartInclusive: workspaceKey + ":", keyEndExclusive: workspaceKey + ";", limit: DREAMING_WORKSPACE_STATE_MAX_ENTRIES});
\t// Keep the original entries() age/key ordering for memory consumers.
\treturn entries.sort((a, b) => a.createdAt - b.createdAt || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
async function readMemoryCoreWorkspaceEntries(params) {`);
  source = once(source, '(await openWorkspaceStore(params.namespace).entries()).filter', '(await listMemoryCoreWorkspaceEntries(openWorkspaceStore(params.namespace), workspaceKey)).filter');
  source = once(source, '\tconst replacementKeys = /* @__PURE__ */ new Set();\n\tfor (const entry of params.entries) {', `\tconst replacementKeys = /* @__PURE__ */ new Set();
\tlet batch = [];
\tconst flush = async () => {
\t\tif (typeof store.registerMany === "function") await store.registerMany(batch);
\t\telse {
\t\t\tfor (const entry of batch) await store.register(entry.key, entry.value);
\t\t\tawait new Promise(resolve => setImmediate(resolve));
\t\t}
\t\tbatch = [];
\t};
\tfor (const entry of params.entries) {`);
  source = once(source, '\t\tawait store.register(stateKey, {\n\t\t\tversion: 1,', '\t\tbatch.push({key: stateKey, value: {\n\t\t\tversion: 1,');
  source = once(source, '\t\t\tvalue: entry.value\n\t\t});\n\t}\n\tfor (const entry of await store.entries()) if (entry.key.startsWith(prefix) && !replacementKeys.has(entry.key)) await store.delete(entry.key);', `\t\t\tvalue: entry.value
\t\t}});
\t\tif (batch.length === 32) await flush();
\t}
\tif (batch.length) await flush();
\tlet deleted = 0;
\tfor (const entry of await listMemoryCoreWorkspaceEntries(store, workspaceKey)) if (entry.key.startsWith(prefix) && !replacementKeys.has(entry.key)) {
\t\tawait store.delete(entry.key);
\t\tif (++deleted % 32 === 0) await new Promise(resolve => setImmediate(resolve));
\t}`);
  return source;
}
