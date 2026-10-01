// Gateway RPC checks: health (A21), listing latency (session-row/catalog fixes), worker pool
// integration flags (B4/B7/B10), setup probe owner (B4), workboard range reads / limits /
// lookup cache (D1-D3) on a board this script creates and then removes, managed-room voice
// session create/close (voice), Control UI voice assets.   node r2-rpc.mjs <label> <outDir> [ids]
import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { discoverGateway, connect, rpc, nonce, sleep, writeReceipt , UNIT } from "./lib.mjs";

// Processes of this Gateway's unit only (other VLab instances run their own worker pools).
const unitPids = () => {
  const cg = `/sys/fs/cgroup${execFileSync("systemctl", ["show", UNIT, "-p", "ControlGroup", "--value"], { encoding: "utf8" }).trim()}`;
  const pids = [];
  const walk = (d) => { try { pids.push(...fs.readFileSync(`${d}/cgroup.procs`, "utf8").split("\n").filter(Boolean)); } catch {}
    try { for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) walk(`${d}/${e.name}`); } catch {} };
  walk(cg); return pids;
};
const [label, outDir, only] = process.argv.slice(2);
if (!label || !outDir) throw new Error("usage: r2-rpc.mjs <label> <outDir> [ids]");
const gw = discoverGateway();
const client = await connect(gw);
const n = nonce().toLowerCase();
const results = {};
const want = (id) => !only || only.split(",").includes(id);
const findKey = (obj, key, path = "$") => {
  if (!obj || typeof obj !== "object") return [];
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (k === key) out.push({ path: `${path}.${k}`, value: v });
    out.push(...findKey(v, key, `${path}.${k}`));
  }
  return out;
};

if (want("health")) {
  // A21: health.eventLoop.delayP50Ms (ms, 1 decimal); idle floor ~20 because the histogram spans 20 ms ticks.
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const h = await rpc(client, "health", {}, 60_000);
    const el = findKey(h.result, "eventLoop").map((e) => e.value).find((v) => v && typeof v === "object" && "delayP50Ms" in v);
    samples.push({ ok: h.ok, ms: h.ms, error: h.error, delayP50Ms: el?.delayP50Ms, delayP99Ms: el?.delayP99Ms, delayMaxMs: el?.delayMaxMs, utilization: el?.utilization });
    await sleep(2_000);
  }
  results.health = { samples, pass: samples.every((s) => s.ok && typeof s.delayP50Ms === "number" && s.delayP50Ms >= 15 && s.delayP50Ms <= (s.delayP99Ms ?? Infinity) && (s.delayP99Ms ?? 0) <= (s.delayMaxMs ?? Infinity)) };
  const st = await rpc(client, "status", {}, 60_000);
  results.status = { ok: st.ok, ms: st.ms, error: st.error, workerPools: st.ok ? JSON.stringify(findKey(st.result, "workerPools")[0]?.value ?? null).slice(0, 3000) : undefined };
}

if (want("listings")) {
  const rows = [];
  for (let i = 0; i < 3; i++) {
    for (const [m, p] of [["sessions.list", { limit: 50 }], ["tasks.list", {}], ["models.list", {}], ["cron.list", {}]]) {
      const r = await rpc(client, m, p, 60_000);
      rows.push({ method: m, i, ok: r.ok, ms: r.ms, error: r.error,
        count: r.ok ? (r.result?.sessions ?? r.result?.tasks ?? r.result?.models ?? r.result?.jobs ?? []).length : undefined });
    }
    await sleep(2_000);
  }
  const max = (m) => Math.max(...rows.filter((r) => r.method === m).map((r) => r.ms));
  results.listings = { rows, maxMs: Object.fromEntries(["sessions.list", "tasks.list", "models.list", "cron.list"].map((m) => [m, max(m)])),
    pass: rows.every((r) => r.ok) && max("sessions.list") < 5_000 };
  const ml = await rpc(client, "models.list", {}, 60_000);
  results.models = { gpt6: (ml.result?.models ?? []).filter((m) => /gpt-6-(sol|luna|astra)/.test(`${m.id ?? m.model ?? ""}`))
    .map((m) => ({ id: m.id ?? m.model, provider: m.provider, contextWindow: m.contextWindow, api: m.api })) };
}

if (want("no-worker")) {
  // 9.6 no-worker mode: the worker RPC must be gone, no worker processes, config runtimes native.
  const s = await rpc(client, "vlab.workers.status", {}, 30_000);
  const procs = [];
  for (const p of unitPids()) {
    try { const env = fs.readFileSync(`/proc/${p}/environ`, "utf8"); const cmd = fs.readFileSync(`/proc/${p}/cmdline`, "utf8").replace(/\0/g, " ");
      if (env.includes("VLAB_WORKER_CHILD=") || /vlab-worker|production-worker/.test(cmd)) procs.push(p); } catch {}
  }
  const cfg = JSON.parse(fs.readFileSync(gw.configPath, "utf8"));
  const runtimes = {};
  (function walk(o, p) { if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { if (k === "agentRuntime" && v?.id) runtimes[v.id] = (runtimes[v.id] ?? 0) + 1; walk(v, `${p}.${k}`); } })(cfg, "");
  const entry = cfg.plugins?.entries?.["vlab-agent-worker-isolation"];
  results.noWorker = { workersRpcOk: s.ok, workersRpcError: String(s.error ?? "").slice(0, 160), workerProcs: procs.length, runtimes,
    workerEntry: entry, providersEntry: Boolean(cfg.plugins?.entries?.["versa-runtime-providers"]?.enabled !== false && cfg.plugins?.entries?.["versa-runtime-providers"]),
    pass: !s.ok && procs.length === 0 && !runtimes["vlab-worker"] && (runtimes.openclaw ?? 0) > 0 && entry?.enabled === false };
}

if (want("workers")) {
  const s = await rpc(client, "vlab.workers.status", {}, 30_000);
  const i = s.result?.integration ?? {};
  results.workers = { ok: s.ok, error: s.error,
    pool: { workers: (s.result?.workers ?? []).length, ...(s.result?.pool ?? {}) },
    perRunNativeChannelRegistry: i.nativeDataTransport?.perRunNativeChannelRegistry,
    configDomainIsolation: i.configDomainIsolation,
    prewarm: i.prewarm ?? s.result?.prewarm,
    nativeHarnessStats: i.nativeHarnessStats,
    mediaCompletionRelay: i.mediaCompletionRelay,
    hostGatewayBridge: i.hostGatewayBridge ?? i.gatewayBridge,
    topKeys: Object.keys(s.result ?? {}), integrationKeys: Object.keys(i) };
  fs.writeFileSync(`${outDir}/workers-status.json`, JSON.stringify(s.result, null, 1));
  results.workers.pass = s.ok && results.workers.pool.workers > 0;
}

if (want("setup-verify-b4")) {
  const r = await rpc(client, "openclaw.setup.verify", { agentId: "makaron" }, 180_000);
  // No-worker: B4 (setup probe owner in the worker) cannot trigger; the native setup probe must pass.
  results.setupVerifyB4 = { ok: r.ok, ms: r.ms, error: r.error, result: r.result && JSON.stringify(r.result).slice(0, 500),
    pass: r.ok && r.result?.ok === true };
}

if (want("workboard-d")) {
  const boardId = `regress96-${n}`;
  const d = { boardId, steps: [] };
  const step = async (name, method, params, t = 60_000) => { const r = await rpc(client, method, params, t); d.steps.push({ name, method, ok: r.ok, ms: r.ms, error: r.error }); return r; };
  const created = [];
  try {
    await step("upsert board", "workboard.boards.upsert", { id: boardId, name: `regress96 ${n}` });
    const a = await step("create A (5000-char notes)", "workboard.cards.create", { boardId, title: `regress96 A ${n}`, notes: "a".repeat(5000) });
    const b = await step("create B", "workboard.cards.create", { boardId, title: `regress96 B ${n}` });
    const A = a.result?.card?.id; const B = b.result?.card?.id;
    if (A) created.push(A); if (B) created.push(B);
    const tooLong = await step("create 12001-char notes (must fail)", "workboard.cards.create", { boardId, title: `regress96 C ${n}`, notes: "c".repeat(12_001) });
    if (tooLong.ok && tooLong.result?.card?.id) created.push(tooLong.result.card.id);
    const ok12k = await step("create 12000-char notes (must pass)", "workboard.cards.create", { boardId, title: `regress96 D ${n}`, notes: "d".repeat(12_000) });
    if (ok12k.ok && ok12k.result?.card?.id) created.push(ok12k.result.card.id);
    const listOne = await step("list cardIds [A]", "workboard.cards.list", { boardId, cardIds: [A] });
    const listNone = await step("list cardIds []", "workboard.cards.list", { boardId, cardIds: [] });
    const listAll = await step("list board", "workboard.cards.list", { boardId });
    // D3: cached single-card lookup must see an update immediately.
    const upd = await step("update A notes", "workboard.cards.update", { id: A, patch: { notes: `updated-${n}` } });
    const listAfter = await step("list cardIds [A] after update", "workboard.cards.list", { boardId, cardIds: [A] });
    // D2: second active claim for the same owner must succeed (upstream allows 1).
    const owner = `regress96-owner-${n}`;
    const c1 = await step("claim A", "workboard.cards.claim", { id: A, ownerId: owner, ttlSeconds: 120 });
    const c2 = await step("claim B same owner", "workboard.cards.claim", { id: B, ownerId: owner, ttlSeconds: 120 });
    if (c1.ok) await step("release A", "workboard.cards.release", { id: A, ownerId: owner, token: c1.result?.token });
    if (c2.ok) await step("release B", "workboard.cards.release", { id: B, ownerId: owner, token: c2.result?.token });
    const cards = (r) => r.result?.cards ?? [];
    d.D1 = { listOneIds: cards(listOne).map((c) => c.id), listNoneCount: cards(listNone).length, listAllCount: cards(listAll).length,
      pass: listOne.ok && cards(listOne).length === 1 && cards(listOne)[0].id === A && listNone.ok && cards(listNone).length === 0 && cards(listAll).length >= 3 };
    d.D2 = { tooLongError: tooLong.error, notes12000Ok: ok12k.ok, secondClaimOk: c2.ok, secondClaimError: c2.error,
      pass: !tooLong.ok && /12000 characters/.test(tooLong.error ?? "") && ok12k.ok && c1.ok && c2.ok };
    d.D3 = { updateOk: upd.ok, notesAfter: cards(listAfter)[0]?.notes?.slice?.(0, 40), pass: upd.ok && cards(listAfter)[0]?.notes === `updated-${n}` };
  } finally {
    for (const id of created) await step(`delete ${id}`, "workboard.cards.delete", { id });
    await step("delete board", "workboard.boards.delete", { id: boardId });
  }
  results.workboard = d;
}

if (want("voice")) {
  const sessionKey = `agent:makaron:explicit:regress96-voice-${n}`;
  const events = [];
  const l = (ev) => { if (ev.event?.startsWith?.("talk")) events.push({ event: ev.event, type: ev.payload?.talkEvent?.type ?? ev.payload?.type }); };
  client.listeners.add(l);
  const c = await rpc(client, "talk.client.create", { sessionKey, transport: "managed-room" }, 60_000);
  const voiceSessionId = c.result?.voiceSessionId ?? c.result?.session?.voiceSessionId;
  const summary = c.ok ? { transport: c.result?.transport ?? c.result?.session?.transport, provider: c.result?.provider ?? c.result?.session?.provider,
    keys: Object.keys(c.result ?? {}), voiceSessionId: Boolean(voiceSessionId) } : undefined;
  await sleep(2_000);
  const close = voiceSessionId ? await rpc(client, "talk.client.close", { sessionKey, voiceSessionId }, 60_000) : undefined;
  client.listeners.delete(l);
  results.voice = { create: { ok: c.ok, ms: c.ms, error: c.error, summary }, close: close && { ok: close.ok, error: close.error }, events: events.slice(0, 20),
    pass: c.ok && Boolean(voiceSessionId) && JSON.stringify(c.result).includes("managed-room") && (!close || close.ok) };
}

if (want("controlui-assets")) {
  const port = client.config.gateway.port;
  const get = async (p) => { const r = await fetch(`http://127.0.0.1:${port}${p}`); const b = Buffer.from(await r.arrayBuffer()); return { status: r.status, bytes: b.length, sha256: crypto.createHash("sha256").update(b).digest("hex"), text: b.toString("utf8") }; };
  const index = await get("/");
  const client1 = await get("/assets/volcengine-rtc-managed-room-client.js");
  const sdk = await get("/assets/volcengine-rtc-4.68.1.esm.js");
  const manifest = await get("/asset-manifest.json").catch(() => ({ status: 0 }));
  results.controlUi = {
    index: { status: index.status, hasOldOverlay: index.text.includes("control-ui-boot-chat-DWTSrxxk-rtc-v4.js") },
    managedRoomClient: { status: client1.status, bytes: client1.bytes, sha256: client1.sha256 },
    sdk: { status: sdk.status, bytes: sdk.bytes, sha256: sdk.sha256 },
    manifest: { status: manifest.status, mentionsManagedRoom: manifest.text?.includes?.("managed-room") },
    pass: index.status === 200 && client1.status === 200 && sdk.status === 200
      && client1.sha256 === "cee065c7fbe8a3ca2cfa440fb78cb107f37e18592baa97e8e1f57b56597b08bc"
      && sdk.sha256 === "5a66d63e574bd4858f8479fe73203780983e8f082b74cfd2da0dc1b3b1fa0c3d" && !index.text.includes("control-ui-boot-chat-DWTSrxxk-rtc-v4.js"),
  };
}

client.stop();
const file = writeReceipt(outDir, `r2-rpc-${label}`, { label, version: gw.version, pid: gw.pid, at: new Date().toISOString(), results });
console.log(JSON.stringify({ file, pass: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.pass ?? (v.D1 ? [v.D1.pass, v.D2.pass, v.D3.pass] : undefined)])) }));
process.exit(0);
