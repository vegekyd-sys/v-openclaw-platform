// Temporary CDP logpoint on the Gateway main thread (never pauses: the condition returns false).
//   node cdp-logpoint.mjs <urlRegex> <line0based> <conditionExpr> <seconds>
import { execFileSync } from "node:child_process";
const [urlRegex, line, expr, secs] = process.argv.slice(2);
const pid = Number(execFileSync("systemctl", ["show", "openclaw-vlab-production-mirror-v8", "-p", "MainPID", "--value"], { encoding: "utf8" }).trim());
const ports = execFileSync("ss", ["-ltnpH"], { encoding: "utf8" }).split("\n").filter((l) => l.includes(`pid=${pid},`)).map((l) => l.match(/127\.0\.0\.1:(\d+)/)?.[1]).filter(Boolean);
let url; for (const p of ports) { try { const l = await (await fetch(`http://127.0.0.1:${p}/json/list`)).json(); if (l?.[0]) { url = l[0].webSocketDebuggerUrl; break; } } catch {} }
const ws = new WebSocket(url); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Debugger.enable", {});
const bp = await send("Debugger.setBreakpointByUrl", { urlRegex, lineNumber: Number(line), condition: `(${expr}), false` });
console.log(JSON.stringify({ bp: bp.result?.breakpointId, locations: bp.result?.locations?.length, error: bp.error }));
await new Promise((r) => setTimeout(r, Number(secs) * 1000));
if (bp.result?.breakpointId) await send("Debugger.removeBreakpoint", { breakpointId: bp.result.breakpointId });
await send("Debugger.disable", {}); ws.close(); process.exit(0);
