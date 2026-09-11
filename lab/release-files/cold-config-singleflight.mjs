// Process-local, in-flight-only sharing of identical non-delivery preparation.
// No settled cache, cross-generation reuse, credentials serialization or retries.
const pending = new WeakMap();
const object = value => value !== null && (typeof value === 'object' || typeof value === 'function');
export function shareColdConfigPreparation(config, generation, runtime, prepare) {
  if (![config,generation,runtime].every(object)) return prepare();
  let generations=pending.get(config);
  if (!generations) pending.set(config,generations=new WeakMap());
  let runtimes=generations.get(generation);
  if (!runtimes) generations.set(generation,runtimes=new WeakMap());
  const existing=runtimes.get(runtime);
  if (existing) return existing;
  const promise=Promise.resolve().then(prepare);
  runtimes.set(runtime,promise);
  const clear=()=>{if(runtimes.get(runtime)===promise) runtimes.delete(runtime);};
  // Two-argument then avoids an unhandled rejection from a discarded finally.
  void promise.then(clear,clear);
  return promise;
}
