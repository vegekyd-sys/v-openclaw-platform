// Read only the published project-memory snapshot on the prompt critical path.
// Full database verification, indexing and explicit search keep their own lifecycle.
const WAIT_BUDGET_MS = 5000;
export const PROJECT_MEMORY_UNAVAILABLE = [
 '## Project Memory',
 'Project memory is temporarily unavailable. Do not claim that project history was checked. If this answer depends on that history, explicitly retrieve it or tell the user it could not be verified.',
 ''
];

function closeLookup(lookup) { return Promise.resolve(lookup?.manager?.close?.()); }

// Acquisition can finish after cancellation (for example, a shared module import).
// Dispose that late transient handle; never start its query after the caller left.
function acquireTransient(acquire, signal, onLateCloseError) {
 return new Promise((resolve, reject) => {
  let settled = false;
  const abort = () => {
   if (settled) return;
   settled = true;
   signal.removeEventListener('abort', abort);
   reject(signal.reason);
  };
  if (signal.aborted) { reject(signal.reason); return; }
  signal.addEventListener('abort', abort, {once:true});
  Promise.resolve().then(() => { signal.throwIfAborted(); return acquire(); }).then(lookup => {
   signal.removeEventListener('abort', abort);
   if (settled) { closeLookup(lookup).catch(onLateCloseError); return; }
   settled = true;
   resolve(lookup);
  }, error => {
   signal.removeEventListener('abort', abort);
   if (!settled) { settled = true; reject(error); }
  });
 });
}

export async function prepareReadonlyProjectMemory(params, dependencies) {
 const {getRuntime, build, log = () => {}, budgetMs = WAIT_BUDGET_MS} = dependencies;
 params.abortSignal?.throwIfAborted();
 if (!params.activeProjectKeys.length) return [];
 const runtime = getRuntime();
 if (!runtime) return [];
 const controller = new AbortController();
 const timeoutError = new Error('Project memory preparation budget exceeded');
 timeoutError.name = 'TimeoutError';
 const timer = setTimeout(() => controller.abort(timeoutError), budgetMs);
 const signal = params.abortSignal ? AbortSignal.any([params.abortSignal,controller.signal]) : controller.signal;
 const started = performance.now();
 const deadlineAt = Date.now()+budgetMs;
 let phase = 'manager', last = started, lookup;
 const stamp = outcome => {
  const now = performance.now();
  log({pid:process.pid,runId:params.runId??null,stage:phase,outcome,ms:Math.round((now-last)*10)/10});
  last=now;
 };
 try {
  lookup = await acquireTransient(() => runtime.getMemorySearchManager({
   cfg:params.cfg,agentId:params.agentId,purpose:'status',signal
  }),signal,() => log({pid:process.pid,runId:params.runId??null,stage:'late-close',outcome:'error'}));
  stamp('ok');phase='candidates';
  signal.throwIfAborted();
  if (!lookup.manager?.listCuratedProjectCandidates || lookup.manager.memorySourceProvenanceRepairPending) return [...PROJECT_MEMORY_UNAVAILABLE];
  // status owns a fresh query-only handle, never a shared writable connection.
  lookup.manager.db?.exec('PRAGMA busy_timeout = 250');
  const entries = await lookup.manager.listCuratedProjectCandidates({
   activeProjectKeys:[...params.activeProjectKeys],limit:48,signal,deadlineAt
  });
  signal.throwIfAborted();
  if(Date.now()>=deadlineAt)throw timeoutError;
  stamp('ok');phase='build';
  return build({entries,activeProjectKeys:params.activeProjectKeys});
 } catch (error) {
  stamp(error?.name === 'TimeoutError' ? 'timeout' : 'unavailable');
  params.abortSignal?.throwIfAborted();
  return [...PROJECT_MEMORY_UNAVAILABLE];
 } finally {
  clearTimeout(timer);
  if (lookup) {
   try { await closeLookup(lookup); }
   catch { log({pid:process.pid,runId:params.runId??null,stage:'close',outcome:'error'}); }
  }
 }
}
