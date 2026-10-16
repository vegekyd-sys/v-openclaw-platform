import { PROCESS_LOCAL_HARNESS_OPTIONS, TRANSLATED_HARNESS_OPTIONS,
  inspectHarnessEventContract } from './harness-event-contract.mjs';

// Identity, authority handles, stores, deadlines and owner callbacks are rebuilt
// or bridged explicitly. Ordinary native data is not an ingress-CLI allowlist.
const owned = new Set([...PROCESS_LOCAL_HARNESS_OPTIONS, ...TRANSLATED_HARNESS_OPTIONS]);
const IMAGE_FACTS=Symbol.for('openclaw.runtimePromptImageFactIndexes');
const ANNOTATIONS='$vlabNativeImageFacts';
const validFacts=(value,length)=>Array.isArray(value)&&value.length===length&&value.every(x=>x===null||(Number.isSafeInteger(x)&&x>=0));
export function cloneWireData(value, field = 'data', seen = new Set(), annotations, path = []) {
  if (value === undefined || value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || seen.has(value)) throw new Error(`Unreviewed non-data Worker field: ${field}`);
  const proto=Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto!==Object.prototype && proto!==null) throw new Error(`Unreviewed runtime object: ${field}`);
  for(const symbol of Object.getOwnPropertySymbols(value)) {
    const descriptor=Object.getOwnPropertyDescriptor(value,symbol);
    if(symbol!==IMAGE_FACTS || !Array.isArray(value) || !annotations || !Object.hasOwn(descriptor,'value') || !validFacts(descriptor.value,value.length)) throw new Error(`Unreviewed symbol capability: ${field}`);
    // Native 9.1 image-fact ownership is data, not an authority handle. Carry
    // it as validated sidecar data because JSON IPC omits Symbol properties.
    annotations.push({path:[...path],factIndexes:[...descriptor.value]});
  }
  seen.add(value);
  try {
    const out=Array.isArray(value)?[]:{};
    for(const key of Object.keys(value)) {
      if(['__proto__','constructor','prototype'].includes(key)) throw new Error(`Unsafe Worker field: ${field}.${key}`);
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      if(!Object.hasOwn(descriptor,'value')) throw new Error(`Unreviewed accessor: ${field}.${key}`);
      out[key]=cloneWireData(descriptor.value,`${field}.${key}`,seen,annotations,[...path,key]);
    }
    return out;
  } finally {seen.delete(value);}
}
export function buildNativeHarnessData(params) {
  // Inspect descriptors before contract inspection, which reads callback values.
  // A runtime getter must not execute while validating an IPC envelope.
  if (Object.getOwnPropertySymbols(params ?? {}).length) throw new Error('Unreviewed symbol capability: params');
  for (const key of Object.keys(params ?? {})) {
    if (['__proto__','constructor','prototype',ANNOTATIONS].includes(key)) throw new Error(`Unsafe Worker field: ${key}`);
    if (!Object.hasOwn(Object.getOwnPropertyDescriptor(params, key), 'value')) throw new Error(`Unreviewed accessor: ${key}`);
  }
  const events=inspectHarnessEventContract(params);
  if(events.unclassified.length) throw new Error(`Worker callback contract needs review: ${events.unclassified.join(', ')}`);
  const data={},annotations=[];
  for(const key of Object.keys(params??{})) {
    if(owned.has(key) || /^on[A-Z]/.test(key) || params[key]===undefined) continue;
    data[key]=cloneWireData(params[key],key,new Set(),annotations,[key]);
  }
  if(annotations.length)data[ANNOTATIONS]=annotations;
  return data;
}
export function applyNativeHarnessData(input, data) {
  // Recheck on receiving side. A wire envelope cannot overwrite local owners.
  const verified=cloneWireData(data??{});
  const annotations=verified[ANNOTATIONS]??[];delete verified[ANNOTATIONS];
  for(const key of Object.keys(verified)) if(owned.has(key) || /^on[A-Z]/.test(key)) throw new Error(`Worker local owner override: ${key}`);
  if(!Array.isArray(annotations))throw new Error('Invalid native image fact annotations');
  const targets=new Set();
  for(const annotation of annotations) {
    if(!Array.isArray(annotation?.path)||!annotation.path.length)throw new Error('Invalid native image fact path');
    let target=verified;
    for(const key of annotation.path) {
      if(typeof key!=='string'||['__proto__','constructor','prototype'].includes(key)||!target||!Object.hasOwn(target,key))throw new Error('Invalid native image fact path');
      target=target[key];
    }
    if(!Array.isArray(target)||targets.has(target)||!validFacts(annotation.factIndexes,target.length))throw new Error('Invalid native image fact ownership');
    targets.add(target);
    Object.defineProperty(target,IMAGE_FACTS,{configurable:true,value:[...annotation.factIndexes]});
  }
  return {...input,...verified};
}
