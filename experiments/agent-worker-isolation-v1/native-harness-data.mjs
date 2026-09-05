import { PROCESS_LOCAL_HARNESS_OPTIONS, TRANSLATED_HARNESS_OPTIONS,
  inspectHarnessEventContract } from './harness-event-contract.mjs';

// Identity, authority handles, stores, deadlines and owner callbacks are rebuilt
// or bridged explicitly. Ordinary native data is not an ingress-CLI allowlist.
const owned = new Set([...PROCESS_LOCAL_HARNESS_OPTIONS, ...TRANSLATED_HARNESS_OPTIONS]);
export function cloneWireData(value, field = 'data', seen = new Set()) {
  if (value === undefined || value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || seen.has(value)) throw new Error(`Unreviewed non-data Worker field: ${field}`);
  const proto=Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto!==Object.prototype && proto!==null) throw new Error(`Unreviewed runtime object: ${field}`);
  if (Object.getOwnPropertySymbols(value).length) throw new Error(`Unreviewed symbol capability: ${field}`);
  seen.add(value);
  try {
    const out=Array.isArray(value)?[]:{};
    for(const key of Object.keys(value)) {
      if(['__proto__','constructor','prototype'].includes(key)) throw new Error(`Unsafe Worker field: ${field}.${key}`);
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      if(!Object.hasOwn(descriptor,'value')) throw new Error(`Unreviewed accessor: ${field}.${key}`);
      out[key]=cloneWireData(descriptor.value,`${field}.${key}`,seen);
    }
    return out;
  } finally {seen.delete(value);}
}
export function buildNativeHarnessData(params) {
  // Inspect descriptors before contract inspection, which reads callback values.
  // A runtime getter must not execute while validating an IPC envelope.
  if (Object.getOwnPropertySymbols(params ?? {}).length) throw new Error('Unreviewed symbol capability: params');
  for (const key of Object.keys(params ?? {})) {
    if (['__proto__','constructor','prototype'].includes(key)) throw new Error(`Unsafe Worker field: ${key}`);
    if (!Object.hasOwn(Object.getOwnPropertyDescriptor(params, key), 'value')) throw new Error(`Unreviewed accessor: ${key}`);
  }
  const events=inspectHarnessEventContract(params);
  if(events.unclassified.length) throw new Error(`Worker callback contract needs review: ${events.unclassified.join(', ')}`);
  const data={};
  for(const key of Object.keys(params??{})) {
    if(owned.has(key) || /^on[A-Z]/.test(key) || params[key]===undefined) continue;
    data[key]=cloneWireData(params[key],key);
  }
  return data;
}
export function applyNativeHarnessData(input, data) {
  // Recheck on receiving side. A wire envelope cannot overwrite local owners.
  const verified=cloneWireData(data??{});
  for(const key of Object.keys(verified)) if(owned.has(key) || /^on[A-Z]/.test(key)) throw new Error(`Worker local owner override: ${key}`);
  return {...input,...verified};
}
