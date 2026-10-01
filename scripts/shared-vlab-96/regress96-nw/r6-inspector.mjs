// Read-only in-process probes of the live Gateway over its localhost inspector (the unit runs
// with --inspect=127.0.0.1:9229). Only side-effect-free expressions are evaluated: global symbol
// lookups, Object.isFrozen, typeof, process.memoryUsage. Nothing is called on the bridge.
//   node r6-inspector.mjs <label> <outDir>
import fs from "node:fs";
import { discoverGateway, writeReceipt } from "./lib.mjs";

const [label, outDir] = process.argv.slice(2);
const gw = discoverGateway();
const port = Number((gw.cmdline.find((a) => a.startsWith("--inspect")) ?? "").split(":").pop());
if (!port) throw new Error("gateway not started with --inspect");
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, silent: true, timeout: 5_000 });
  return r.result?.exceptionDetails ? { error: r.result.exceptionDetails.exception?.description?.slice(0, 300) } : r.result?.result?.value;
};
const probes = {
  hostBridge: `(()=>{const b=globalThis[Symbol.for("versa.openclaw.host-gateway-bridge.v1")];if(!b)return null;return {contract:b.contract??b.version??null,frozen:Object.isFrozen(b),functions:Object.keys(b).filter(k=>typeof b[k]==="function").sort(),keys:Object.keys(b).sort()};})()`,
  revertedCallerStorage: `Symbol.for("openclaw.v.gatewayToolCallerStorage") in globalThis`,
  revertedContextBinding: `Symbol.for("openclaw.v.gatewayContextBinding") in globalThis`,
  nativeAttemptHooks: `(()=>{const h=globalThis[Symbol.for("versa.vlab.native-attempt-91-v1")];return h?{keys:Object.keys(h).sort()}:null;})()`,
  workerEventBridge: `(()=>{const h=globalThis[Symbol.for("versa.vlab-worker.gateway-event-bridge-v1")];return h?{type:typeof h,keys:Object.keys(h).sort()}:null;})()`,
  gatewayOwnedToolProxy: `(()=>{const h=globalThis[Symbol.for("versa.vlab.gateway-owned-tool-proxy-v1")];return h?{type:typeof h}:null;})()`,
  progressCardListeners: `(()=>{const s=globalThis[Symbol.for("openclaw.v.progressCardChangedListeners")];return s?{type:Object.prototype.toString.call(s),size:s.size??null}:null;})()`,
  sharedA9A2: `Object.getOwnPropertySymbols(globalThis).map(s=>s.description).filter(d=>/versa|openclaw\\.v\\.|db91|agent-db|lease/i.test(d)).sort()`,
  sharedConnFilesWeakMap_469d5e9: `globalThis[Symbol.for("openclaw.agentDbIntegrityConnectionFiles")] instanceof WeakMap`,
  heldLeasesALS_469d5e9: `globalThis[Symbol.for("openclaw.agentDbProcessHeldLeases")]?.constructor?.name ?? null`,
  writeAdmissionServices_A2: `(()=>{const s=globalThis[Symbol.for("openclaw.sqliteWriteAdmissionServices")];return s?Object.prototype.toString.call(s):null;})()`,
  gateCaches_ff302cb: `(()=>{const c=globalThis[Symbol.for("openclaw.agentDbIntegrityGateCaches")];if(!c)return null;try{return {generation:c.generation,configs:[...(c.configurations?.values?.()??[])].map(v=>({dirTail:String(v?.value?.directory??"").slice(-40),ageMs:Date.now()-(v?.checkedAt??0)}))};}catch(e){return {error:String(e)};}})()`,
  sigtermListeners_67139fe: `process.listeners("SIGTERM").length`,
  memory: `(()=>{const m=process.memoryUsage();return {rssMB:Math.round(m.rss/1048576),heapUsedMB:Math.round(m.heapUsed/1048576)};})()`,
  uptimeS: `Math.round(process.uptime())`,
};
const out = { label, at: new Date().toISOString(), pid: gw.pid, port };
for (const [k, e] of Object.entries(probes)) out[k] = await evaluate(e);
ws.close();
const b = out.hostBridge;
out.pass = {
  hostBridge: Boolean(b && b.frozen && ["getGatewayContextResolver", "runWithGatewayDetachedWorkContinuation", "withPluginRuntimeGatewayContextResolver", "withoutGatewayToolCallerIdentity"].every((f) => b.functions.includes(f))),
  revertedAbsent: out.revertedCallerStorage === false && out.revertedContextBinding === false,
  sharedA9A2_469d5e9: out.sharedConnFilesWeakMap_469d5e9 === true && out.heldLeasesALS_469d5e9 === "AsyncLocalStorage",
  gateCacheTtl_ff302cb: Array.isArray(out.gateCaches_ff302cb?.configs) && out.gateCaches_ff302cb.configs.length > 0 && out.gateCaches_ff302cb.configs.every((c) => c.ageMs < 120_000),
  sigterm_67139fe: out.sigtermListeners_67139fe >= 1,
};
const file = writeReceipt(outDir, `r6-inspector-${label}`, out);
console.log(JSON.stringify({ file, pass: out.pass, hostBridge: out.hostBridge, sharedSymbols: out.sharedA9A2, memory: out.memory }));
process.exit(0);
