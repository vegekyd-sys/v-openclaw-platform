// E2E chat scenarios against the shared VLab Gateway (9.6 no-worker mode: turns in the Gateway on
// runtime "openclaw"; real models). Worker counters are gone; every row records vlab-worker processes
// and the session row's agentRuntime instead.
// Strictly sequential (concurrency 1; the B2 child makes it 2). Every session key
// contains "regress96-".   node r1-chat.mjs <label> <outDir> [scenarioId,...]
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  discoverGateway, connect, rpc, chatScenario, nonce, sleep, toolResults, userTexts, textOf, assistantText,
  workerCounters, diffNum, writeReceipt, run, UNIT,
} from "./lib.mjs";

// Processes of this Gateway's unit only (other VLab instances run their own worker pools).
const unitPids = () => {
  const cg = `/sys/fs/cgroup${execFileSync("systemctl", ["show", UNIT, "-p", "ControlGroup", "--value"], { encoding: "utf8" }).trim()}`;
  const pids = [];
  const walk = (d) => { try { pids.push(...fs.readFileSync(`${d}/cgroup.procs`, "utf8").split("\n").filter(Boolean)); } catch {}
    try { for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) walk(`${d}/${e.name}`); } catch {} };
  walk(cg); return pids;
};
const [label, outDir, only] = process.argv.slice(2);
if (!label || !/^[a-z0-9-]+$/.test(label) || !outDir) throw new Error("usage: r1-chat.mjs <label> <outDir> [ids]");
fs.mkdirSync(outDir, { recursive: true });
const gw = discoverGateway();
const client = await connect(gw);
const n = nonce();
// No-worker: vlab.workers.status is not registered; keep the call so its absence is recorded.
const status = async () => { const r = await rpc(client, "vlab.workers.status", {}, 30_000); return r.ok ? r.result : {}; };
const workerProcs = () => {
  const out = [];
  for (const p of unitPids()) {
    try {
      const env = fs.readFileSync(`/proc/${p}/environ`, "utf8");
      const cmd = fs.readFileSync(`/proc/${p}/cmdline`, "utf8").replace(/\0/g, " ");
      if (env.includes("VLAB_WORKER_CHILD=") || /vlab-worker|production-worker/.test(cmd)) out.push(p);
    } catch {}
  }
  return out.length;
};
const sessionRuntime = async (agentId, key) => ((await rpc(client, "sessions.list", { agentId, search: key, limit: 5 }, 60_000)).result?.sessions ?? [])
  .filter((x) => x.key === key).map((x) => ({ model: x.model, modelProvider: x.modelProvider, agentRuntime: x.agentRuntime }))[0] ?? null;
const redactLinks = (t) => String(t).replace(/https?:\/\/\S+/g, "<url>").replace(/[A-Za-z0-9_-]{32,}/g, "<opaque>");
const findCodexRollouts = (needle, sinceMin = 30) => {
  const roots = [gw.env.CODEX_HOME, path.join(gw.instance, "state/agents")].filter(Boolean);
  const hits = [];
  for (const root of roots) {
    let files = "";
    try { files = run("find", [root, "-name", "rollout-*.jsonl", "-mmin", `-${sinceMin}`, "-size", "-50M"], 60_000); } catch {}
    for (const f of files.split("\n").filter(Boolean)) {
      const body = fs.readFileSync(f, "utf8");
      if (!body.includes(needle)) continue;
      const meta = body.split("\n").slice(0, 40).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const sm = meta.find((j) => j.type === "session_meta")?.payload ?? {};
      const tc = meta.find((j) => j.type === "turn_context")?.payload ?? {};
      hits.push({ file: f, model_provider: sm.model_provider, model: tc.model ?? sm.model });
    }
  }
  return hits;
};

const scenarios = [
  // Baseline worker turn: B1 prepare/identity path, worker counters, E7 core metrics, A6.
  { id: "plain", marker: `PLAIN_${n}`, tools: [], prompt: (m) => `不要调用任何工具，只回复精确文本 ${m}。` },
  // exec + B7 config domain: the worker's host exec must see the Gateway config and the "gateway" domain.
  { id: "exec", marker: `EXEC_${n}`, tools: ["exec", "bash"],
    prompt: (m) => `必须调用 exec 工具运行命令 printf '%s|%s|${m}\\n' "$OPENCLAW_CONFIG_PATH" "$VLAB_ACTIVE_CONFIG_DOMAIN" ，然后只回复命令输出的那一行文本，原样不改。`,
    check(row) {
      const line = (row.bodyTail.match(new RegExp(`\\S*\\|[a-z]*\\|${row.marker}`)) ?? [""])[0];
      const [cfgPath, domain] = line.split("|");
      row.b7 = { cfgPath, domain, gatewayConfig: gw.configPath, note: "no-worker: exec runs in the Gateway; VLAB_ACTIVE_CONFIG_DOMAIN (B7) is expected empty" };
      return cfgPath === gw.configPath && domain === "";
    } },
  // memory_search: A7/A18/A19 exercised on the migrated memory DB.
  { id: "memory", marker: `MEMORY_${n}`, tools: ["memory_search"],
    prompt: (m) => `必须先调用 memory_search 工具搜索“测试”，不管结果如何，最后只回复 ${m}。`,
    check(row) { const r = toolResults(row.history, "memory_search"); row.memoryResult = r.map((x) => x.text.slice(0, 300)); return r.length > 0 && !r.some((x) => x.isError); } },
  // cron list: B1 Gateway identity mint (cron tool is Gateway-owned from the worker).
  { id: "cron-list", marker: `CRON_${n}`, tools: ["cron", "automations"],
    prompt: (m) => `必须调用 cron 工具列出当前的定时任务（只读，不要创建或修改），最后只回复 ${m}。`,
    check(row) { const r = toolResults(row.history).filter((x) => /cron|automations/.test(x.toolName)); row.cronResult = r.map((x) => x.text.slice(0, 200)); return r.length > 0 && !r.some((x) => x.isError); } },
  // C: shared-cron policy names makaron; a webchat/operator turn has no signed principal, so the
  // shared namespace must refuse an add ("outside caller scope"). Upstream would create the job.
  { id: "cron-shared-c", marker: `CRONADD_${n}`, tools: ["cron", "automations"],
    prompt: (m) => `必须调用 cron 工具新增一个任务，只调用一次，失败也不要重试：名称 regress96-cron-probe-${n}，一次性 at 2099-01-01T00:00:00Z，payload 为 systemEvent 文本 "regress96"，enabled=false。然后原样引用工具返回的结果或错误信息，最后一行回复 ${m}。`,
    async check(row) {
      const r = toolResults(row.history).filter((x) => /cron|automations/.test(x.toolName));
      row.cronAdd = r.map((x) => x.text.slice(0, 300));
      const refused = r.some((x) => /outside caller scope/.test(x.text));
      const list = await rpc(client, "cron.list", { includeDisabled: true }, 60_000);
      const mine = (list.result?.jobs ?? []).filter((j) => String(j.name ?? "").includes(`regress96-cron-probe-${n}`));
      row.cronCreated = mine.map((j) => j.id);
      for (const j of mine) row.cronCleanup = await rpc(client, "cron.remove", { id: j.id }, 60_000); // own job only
      return refused && mine.length === 0;
    } },
  // workboard read via agent (Gateway-owned tool through the worker).
  { id: "workboard", marker: `BOARD_${n}`, tools: ["workboard*"],
    prompt: (m) => `必须调用 workboard 工具列出现有的看板（只读，不要创建或修改任何东西），最后只回复 ${m}。` },
  // B2 + host gateway bridge + detached work admission: the parent must yield BEFORE the child
  // finishes (child sleeps 20 s), then be woken by the relayed completion carrying the child's random value.
  { id: "spawn-relay", marker: "CHILD_", tools: ["sessions_spawn"], followUpMs: 240_000,
    markerTest: (body) => /CHILD_[0-9a-f]{8}/.test(body),
    prompt: () => "必须调用 sessions_spawn 工具启动一个子代理（mode=run, cleanup=keep），子代理的任务原文是：“必须调用 exec 工具运行命令 sleep 20; printf CHILD_; od -An -N4 -tx4 /dev/urandom | tr -d ' ' ，然后只回复命令输出的那一行文本。”。启动后立刻调用 sessions_yield 等待子代理的完成通知；不要调用 sessions_history、subagents 或 exec。收到完成通知后，只回复子代理返回的那一行文本。",
    async check(row) {
      const spawn = toolResults(row.history, "sessions_spawn");
      const yieldR = toolResults(row.history, "sessions_yield");
      row.spawnResult = spawn.map((x) => x.text.slice(0, 500));
      row.yieldResult = yieldR.map((x) => x.text.slice(0, 300));
      const childKey = (spawn.map((x) => x.text).join("\n").match(/"childSessionKey"\s*:\s*"([^"]+)"/) ?? [])[1]
        ?? spawn.map((x) => x.details?.childSessionKey).find(Boolean);
      row.childSessionKey = childKey;
      const parentValue = (assistantText(row.history).match(/CHILD_[0-9a-f]{8}/g) ?? []).at(-1);
      let childValue;
      if (childKey) {
        const agentId = childKey.split(":")[1];
        const ch = (await rpc(client, "chat.history", { agentId, sessionKey: childKey, limit: 40 }, 60_000)).result;
        // The child may background exec and read the output through the process tool.
        childValue = (toolResults(ch).map((x) => x.text).join("\n").match(/CHILD_[0-9a-f]{8}/) ?? [])[0];
      }
      row.relay = {
        parentValue, childValue,
        bridgeOwnedNote: spawn.some((x) => /external task bridge/.test(x.text)),
        expectsCompletionMessage: spawn.some((x) => /"expectsCompletionMessage"\s*:\s*true/.test(x.text)),
        yielded: yieldR.some((x) => /"status"\s*:\s*"yielded"/.test(x.text)),
        internalEvent: userTexts(row.history).some((t) => /OpenClaw isolated subagent|subagent/i.test(t) && /CHILD_|completion|task/i.test(t)),
      };
      return Boolean(parentValue && childValue && parentValue === childValue && row.relay.yielded);
    } },
  // B3: skill_workshop from the worker runs in the Gateway-owned tool subprocess.
  { id: "skill-workshop-b3", marker: `SKW_${n}`, tools: ["skill_workshop"],
    prompt: (m) => `必须调用 skill_workshop 工具，参数 action=list，只读，列出提案。然后只回复 ${m}。`,
    async check(row) {
      const r = toolResults(row.history, "skill_workshop");
      row.skw = r.map((x) => x.text.slice(0, 300));
      row.skwRpc = await rpc(client, "skills.proposals.list", { agentId: "makaron" }, 60_000);
      if (row.skwRpc.ok) row.skwRpc = { ok: true, count: (row.skwRpc.result?.proposals ?? []).length };
      return r.length > 0 && !r.some((x) => x.isError || /timed out|invalid JSON|VLAB_GATEWAY_CONFIG_PATH is required/.test(x.text));
    } },
  // B8 identity relay: openclaw (system agent) tool called from the worker, read-only question.
  { id: "openclaw-b8", marker: `OCQ_${n}`, tools: ["openclaw"],
    prompt: (m) => `必须调用 openclaw 工具询问：agents.defaults.maxConcurrent 当前的值是多少？只读，不要做任何修改。最后一行回复 ${m} 和那个数值。`,
    check(row) {
      const r = toolResults(row.history, "openclaw");
      row.openclawResult = r.map((x) => x.text.slice(0, 400));
      return r.length > 0 && !r.some((x) => x.isError || /needsApproval"\s*:\s*true|authority is no longer active|requires an active run authority/.test(x.text)) && /45/.test(row.bodyTail);
    } },
  // Image generation in-process (no-worker: B10's worker relay cannot trigger; native completion wake). to the Gateway (announceId) and the requester woken.
  { id: "image", marker: `IMG_${n}`, tools: ["image_generate"], waitMs: 8 * 60_000,
    prompt: (m) => `必须调用 image_generate 工具（不要用 makaron CLI、exec 或其他工具）生成一张很小的图：白底上一个红色圆。调用后立即结束本轮，只回复 ${m}。`,
    async check(row) {
      const before = row.messageCount;
      const deadline = Date.now() + 5 * 60_000;
      let h = row.history; let tasks;
      while (Date.now() < deadline) {
        tasks = (await rpc(client, "tasks.list", {}, 60_000)).result;
        const mine = (tasks?.tasks ?? tasks?.items ?? []).filter((t) => [t.requesterSessionKey, t.sessionKey, t.ownerKey].includes(row.sessionKey));
        row.mediaTasks = mine.map((t) => ({ runId: t.runId, runtime: t.runtime, status: t.status, taskId: t.taskId ?? t.id }));
        h = (await rpc(client, "chat.history", { agentId: "makaron", sessionKey: row.sessionKey, limit: 80 }, 60_000)).result;
        const terminalTask = row.mediaTasks.find((t) => /image_generate/.test(t.runId ?? "") && /succeeded|completed|failed|error|cancel/.test(t.status ?? ""));
        if (terminalTask && (h?.messages?.length ?? 0) > before) break;
        await sleep(5_000);
      }
      await sleep(15_000);
      h = (await rpc(client, "chat.history", { agentId: "makaron", sessionKey: row.sessionKey, limit: 80 }, 60_000)).result;
      const after = h?.messages ?? [];
      row.afterFinal = after.slice(before).map((m) => ({ role: m.role, text: textOf(m).slice(0, 300), parts: (Array.isArray(m.content) ? m.content : []).map((p) => p.type) }));
      row.imageResult = toolResults(row.history, "image_generate").map((x) => x.text.slice(0, 300));
      // 9.6 reports a finished media task as "completed" (9.1: "succeeded").
      const succeeded = (row.mediaTasks ?? []).some((t) => /image_generate/.test(t.runId ?? "") && /^(succeeded|completed)$/.test(t.status ?? ""));
      const woke = row.afterFinal.some((m) => m.role === "assistant");
      return succeeded && woke;
    } },
  // G1 /vds: DeepSeek through the Codex harness (makaron's deepseek-flash entry has runtime codex).
  { id: "vds-g1", marker: `VDS_${n}`, model: "deepseek/deepseek-flash", tools: [], noTools: false,
    prompt: (m) => `用 shell 运行 echo ${m}，然后调用 cron 工具列出定时任务（只读）。最后只回复 ${m}。`,
    async check(row) {
      await sleep(3_000);
      row.rollouts = findCodexRollouts(row.marker);
      row.sessionRow = ((await rpc(client, "sessions.list", { search: row.sessionKey, limit: 5 }, 60_000)).result?.sessions ?? [])
        .filter((s) => s.key === row.sessionKey).map((s) => ({ model: s.model, modelProvider: s.modelProvider, agentRuntime: s.agentRuntime }));
      return row.rollouts.some((r) => r.model_provider === "deepseek");
    } },
  // E2 + E7-ws: gpt-6-astra on the ChatGPT route (short-v; runtime openclaw in no-worker mode).
  { id: "astra-e2", agentId: "short-v", marker: `ASTRA_${n}`, model: "openai/gpt-6-astra", tools: [],
    prompt: (m) => `不要调用任何工具，只回复精确文本 ${m}。` },
  // B9: cross-process CAS pressure on the session row while the worker persists the turn.
  { id: "cas-b9", marker: `B9_${n}`, tools: ["exec", "bash"],
    prompt: (m) => `必须调用 exec 工具运行命令 sleep 25; echo ${m} ，然后只回复命令输出的那一行文本。`,
    onStart(row) {
      row.b9 = { patches: 0, patchErrors: [] };
      (async () => {
        await sleep(3_000);
        while (!row.terminal) {
          const r = await rpc(client, "sessions.patch", { key: row.sessionKey, agentId: "makaron", label: `regress96-b9-${row.b9.patches}` }, 20_000);
          if (r.ok) row.b9.patches++; else if (row.b9.patchErrors.length < 5) row.b9.patchErrors.push(r.error);
          await sleep(150);
        }
      })();
    } },
  // Browser tool (Chrome on the desktop DISPLAY :99, browser.headless=false).
  { id: "browser", marker: `BROWSER_${n}`, tools: ["browser"], waitMs: 8 * 60_000,
    prompt: (m) => `必须调用 browser 工具打开 https://example.com ，读取页面的标题文字（h1），不要用其他工具。最后只回复 ${m} 以及标题文字。`,
    check(row) { const r = toolResults(row.history, "browser"); row.browser = r.map((x) => ({ isError: x.isError, text: redactLinks(x.text).slice(0, 160) }));
      return r.length > 0 && r.some((x) => !x.isError) && /Example Domain/i.test(row.bodyTail); } },
  // computer tool via the local cua node (DISPLAY=:99), in-process runtime.
  { id: "computer", marker: `CUA_${n}`, tools: ["computer"], waitMs: 8 * 60_000,
    prompt: (m) => `必须调用 computer 工具：先截一张屏幕截图，再把鼠标移动到 (400,300)，再截一张图。不要用其他工具。完成后只回复 ${m}。`,
    check(row) { const r = toolResults(row.history, "computer"); row.computer = r.map((x) => ({ isError: x.isError, text: redactLinks(x.text).slice(0, 200) })); return r.length >= 2 && !r.some((x) => x.isError); } },
  // Desktop handoff from /vcc (claude-cli): the plugin must issue a control link (owner fallback, PR #76).
  { id: "vcc-handoff", marker: `HOF_${n}`, model: "anthropic/claude-opus-5", tools: ["desktop_handoff_request", "mcp__openclaw__desktop_handoff_request"], waitMs: 8 * 60_000,
    prompt: (m) => `调用 desktop_handoff_request 工具为我生成一个桌面控制链接（原因：回归测试）。不要把链接写进回复，只回复 ${m} 以及链接是否已生成（yes/no）。`,
    check(row) {
      const r = toolResults(row.history).filter((x) => /desktop_handoff_request/.test(x.toolName));
      const texts = r.map((x) => x.text);
      row.handoff = { calls: r.length, isError: r.some((x) => x.isError), issued: texts.some((t) => /https?:\/\//.test(t) || /claim|link|url/i.test(t)), sample: texts.map((t) => redactLinks(t).slice(0, 200)) };
      return r.length > 0 && !row.handoff.isError && row.handoff.issued;
    } },
  // /vcc computer then /vcodex computer in the same session: the claude-cli execution is never closed by a
  // run cleanup; V's execution-idle patch releases it after 300 s. First /vcodex try within the window may
  // see COMPUTER_HOST_BUSY (fault path), a retry after the window must succeed.
  { id: "vcc-computer", sessionKeyName: "vcc2vcodex", marker: `VCC_${n}`, model: "anthropic/claude-opus-5", tools: ["computer", "mcp__openclaw__computer"], waitMs: 8 * 60_000,
    prompt: (m) => `必须调用 computer 工具截一张屏幕截图，然后把鼠标移动到 (300,200)。完成后只回复 ${m}。`,
    check(row) { const r = toolResults(row.history).filter((x) => /computer/.test(x.toolName)); row.computer = r.map((x) => ({ isError: x.isError, text: redactLinks(x.text).slice(0, 160) })); return r.length > 0 && !r.some((x) => x.isError); } },
  { id: "vcodex-computer-busy", sessionKeyName: "vcc2vcodex", marker: `VCX1_${n}`, model: "openai/gpt-5.6-sol", tools: ["computer"], noTools: false, waitMs: 8 * 60_000,
    prompt: (m) => `必须调用 computer 工具截一张屏幕截图（只调用一次，失败也不要重试）。如果工具报错，原样引用错误码。最后一行回复 ${m}。`,
    check(row) { const r = toolResults(row.history).filter((x) => /computer/.test(x.toolName)); row.computer = r.map((x) => ({ isError: x.isError, text: redactLinks(x.text).slice(0, 200) }));
      row.busySeen = r.some((x) => /COMPUTER_HOST_BUSY/.test(x.text)) || /COMPUTER_HOST_BUSY/.test(row.bodyTail); return r.length > 0; } },
  { id: "vcodex-computer-after-idle", sessionKeyName: "vcc2vcodex", delayMs: 330_000, marker: `VCX2_${n}`, model: "openai/gpt-5.6-sol", tools: ["computer"], noTools: false, waitMs: 8 * 60_000,
    prompt: (m) => `必须调用 computer 工具截一张屏幕截图，然后把鼠标移动到 (500,400)。完成后只回复 ${m}。`,
    check(row) { const r = toolResults(row.history).filter((x) => /computer/.test(x.toolName)); row.computer = r.map((x) => ({ isError: x.isError, text: redactLinks(x.text).slice(0, 200) })); return r.length > 0 && !r.some((x) => x.isError || /COMPUTER_HOST_BUSY/.test(x.text)); } },
];

const selected = only ? scenarios.filter((s) => only.split(",").includes(s.id)) : scenarios;
const rows = [];
const sharedKeys = {};
for (const s of selected) {
  if (s.delayMs) { console.error(`${s.id}: waiting ${s.delayMs / 1000}s (idle window)`); await sleep(s.delayMs); }
  const before = workerCounters(await status());
  const spec = { ...s, prompt: s.prompt(s.marker) };
  if (s.sessionKeyName) spec.sessionKey = sharedKeys[s.sessionKeyName] ??= `agent:${s.agentId ?? "makaron"}:explicit:regress96-${label}-${s.sessionKeyName}-${Date.now()}`;
  if (s.onStart) spec.onEvent = (ev, row) => { if (!row._started) { row._started = true; s.onStart(row); } };
  const row = await chatScenario(client, label, spec);
  let extra = true;
  try { if (s.check && row.terminal === "final") extra = await s.check(row); else if (s.check) extra = false; }
  catch (error) { row.checkError = String(error?.stack ?? error).slice(0, 600); extra = false; }
  row.checkOk = extra;
  row.pass = row.pass && extra;
  row.workerDelta = diffNum(before, workerCounters(await status()));
  row.vlabWorkerProcs = workerProcs();
  row.session = await sessionRuntime(row.agentId, row.sessionKey);
  row.noWorker = row.vlabWorkerProcs === 0 && (row.session?.agentRuntime ?? null) !== "vlab-worker";
  delete row._started;
  fs.writeFileSync(path.join(outDir, `history-${s.id}.json`), JSON.stringify(row.history ?? null, null, 1));
  delete row.history;
  rows.push(row);
  console.error(`${s.id}: ${row.pass ? "PASS" : "FAIL"} runtime=${row.session?.agentRuntime} workers=${row.vlabWorkerProcs} terminal=${row.terminal} send=${row.send?.ok ?? row.send?.error} hist=${row.historyError ?? "ok"} tools=${row.tools?.join(",")} check=${row.checkOk} ${Math.round((row.totalMs ?? 0) / 1000)}s ${row.errorMessage ?? ""}`);
}
client.stop();
const file = writeReceipt(outDir, `r1-chat-${label}`, { label, version: gw.version, pid: gw.pid, at: new Date().toISOString(), nonce: n,
  passed: rows.filter((r) => r.pass).length, total: rows.length, rows });
console.log(JSON.stringify({ file, passed: rows.filter((r) => r.pass).length, total: rows.length }));
process.exit(0);
