// Scenarios for docs/codex-default-harness-rollout.md, run inside runtime-concurrency.mjs (it owns the
// private Gateway, models and the local DeepSeek proxy). ROLLOUT_CASE picks one:
//   pin      what follows the default: chat, Workboard batch and direct dispatch, cron, sessions_spawn
//   policy   which tools reach before_tool_call on each harness; block, requireApproval, a slow hook
//   voice    talk.client.toolCall: which harness a consult runs on, and the spoken confirmation gate
//   computer one turn with N screenshots: request body per model call; 413 mid-turn and after it
//   migrate  an existing session across the switch and back; reload behaviour of the config keys
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const PROBE = process.env.ROLLOUT_PROBE_DIR ?? "/tmp/rollout-probe";
const MARKERS = path.join(PROBE, "markers");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = () => randomBytes(3).toString("hex");
const VDS_REF = "deepseek/vds-deepseek-flash";
const FLASH_REF = "deepseek/deepseek-flash";

export async function runRollout(x) {
  fs.rmSync(PROBE, { recursive: true, force: true });
  fs.mkdirSync(MARKERS, { recursive: true });
  const setRules = (rules) => fs.writeFileSync(path.join(PROBE, "rules.json"), JSON.stringify(rules));
  setRules([]);
  const hookLines = () => { try { return fs.readFileSync(path.join(PROBE, "hook.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  const marker = (name) => fs.existsSync(path.join(MARKERS, name));
  const explicit = (n) => `agent:makaron:explicit:${n}`;

  // One chat turn with free text; the same event tracking send() uses.
  async function turn(key, message, { timeoutMs = 300_000 } = {}) {
    const id = randomUUID();
    const r = { id, key, sentAt: Date.now() };
    x.runs.set(id, r);
    await x.client.request("chat.send", { agentId: "makaron", sessionKey: key, message, deliver: false, idempotencyKey: id, timeoutMs }, { timeoutMs: 120_000 });
    const deadline = r.sentAt + timeoutMs + 30_000;
    while (!r.terminal && Date.now() < deadline && x.gateway.exitCode === null) await sleep(250);
    if (!r.terminal) { r.terminal = x.gateway.exitCode === null ? "timeout" : "gateway-exit"; r.endAt = Date.now(); }
    return { terminal: r.terminal, doneMs: r.endAt - r.sentAt, tools: r.tools, error: r.error, text: x.redact(r.text ?? "").slice(0, 200) };
  }
  // what Codex itself recorded for tool calls since `from`
  const codexCalls = (from) => {
    const agentDir = JSON.parse(fs.readFileSync(x.configPath, "utf8")).agents.entries.makaron.agentDir;
    const files = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (f.endsWith(".jsonl") && fs.statSync(f).mtimeMs >= from) files.push(f); } };
    walk(path.join(agentDir, "codex-home", "sessions"));
    return files.flatMap((f) => fs.readFileSync(f, "utf8").trim().split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } })).filter((l) => l && Date.parse(l.timestamp) >= from && /function_call|custom_tool_call|exec_command|hook/u.test(`${l.payload?.type}`)).map((l) => ({ ms: Date.parse(l.timestamp) - from, type: l.payload.type, name: l.payload.name, args: x.redact(String(l.payload.arguments ?? l.payload.input ?? "")).slice(0, 160), output: x.redact(String(l.payload.output?.content ?? l.payload.output ?? "")).slice(0, 200) }));
  };
  const reloadLines = (from) => x.lines.filter((l) => l.at >= from && /\[reload\]|restart/iu.test(l.line)).map((l) => x.redact(l.line).slice(0, 240)).slice(-10);

  // A session row exists as soon as the run is accepted, with the default model on it. Only the first
  // assistant message says what really ran.
  async function pollHarness(key, ms = 180_000) {
    const short = key.split(":").pop();
    const until = Date.now() + ms;
    let ran;
    while (Date.now() < until) {
      ran = x.actualRuntime([key])[short];
      if (ran && !ran.includes("|?/") && ran !== "missing" && /\|[^|?]+\/[^|?]+\|/u.test(ran) && /\|in=[1-9]/u.test(ran)) break;
      await sleep(3_000);
    }
    return { ran, row: x.sessionsLike(key)?.[0] ?? null };
  }

  const CASE = process.env.ROLLOUT_CASE;
  if (CASE === "pin") {
    const shell = (label) => `（自动化验证）用 shell 执行 \`printf %s ${label} | sha256sum | cut -c1-12\`，只回复输出。`;
    x.emit({ phase: "rollout", name: "default-chat", ...(await x.scenario("pin-chat", explicit("pin-chat"))) });

    // Workboard, the way Night Shift calls it (workboard-gateway-adapter.mjs)
    const card = async (title) => (await x.client.request("workboard.cards.create", { boardId: "rollout", title, status: "ready", priority: "normal", agentId: "makaron", notes: shell(title), labels: [`rollout:${title}`] }, { timeoutMs: 60_000 })).card;
    {
      const c = await card(`batch-${hex()}`);
      const res = await x.client.request("workboard.cards.dispatchWithOptions", { boardId: "rollout", cardIds: [c.id], maxStarts: 1 }, { timeoutMs: 120_000 });
      const started = res.started?.[0];
      x.emit({ phase: "rollout", name: "workboard-batch", started: started ? { sessionKey: started.sessionKey } : null, failures: res.startFailures, session: started ? await pollHarness(started.sessionKey) : null });
    }
    {
      const c = await card(`direct-${hex()}`);
      const res = await x.client.request("workboard.cards.dispatch", { id: c.id, provider: "deepseek", model: "deepseek-flash" }, { timeoutMs: 120_000 }).catch((e) => ({ error: x.redact(e?.message ?? e).slice(0, 300) }));
      const started = res.started?.[0] ?? res;
      x.emit({ phase: "rollout", name: "workboard-direct-with-model", error: res.error, sessionKey: started?.sessionKey ?? started?.card?.metadata?.sessionKey ?? null, session: started?.sessionKey ? await pollHarness(started.sessionKey) : null, keys: x.sessionsLike("%workboard-rollout%") });
    }
    // cron with and without its own model
    for (const [name, model] of [["cron-default", undefined], ["cron-payload-flash", FLASH_REF]]) {
      const label = `${name}-${hex()}`;
      const job = await x.client.request("cron.add", { name: label, agentId: "makaron", deleteAfterRun: false, schedule: { kind: "at", at: new Date(Date.now() + 10_000).toISOString() }, sessionTarget: "isolated", wakeMode: "now", payload: { kind: "agentTurn", message: shell(label), ...(model ? { model } : {}) }, delivery: { mode: "none" } }, { timeoutMs: 60_000 });
      const id = job.id ?? job.job?.id;
      await sleep(75_000);
      const got = await x.client.request("cron.get", { id }, { timeoutMs: 60_000 }).catch((e) => ({ error: String(e?.message ?? e).slice(0, 200) }));
      x.emit({ phase: "rollout", name, state: got?.state?.lastRunStatus ?? got, session: x.sessionsLike(`agent:makaron:cron:${id}%`) });
    }
    // sessions_spawn from a parent on the default, and the parent on /vds when the default is not
    const label = `sub-${hex()}`;
    const r = await turn(explicit("pin-parent"), `（自动化验证）用 sessions_spawn 派一个子 agent，让它用 shell 执行 \`printf %s ${label} | sha256sum | cut -c1-12\` 并把输出告诉你。拿到结果后只回复那 12 个字符。`);
    await sleep(60_000);
    const children = x.sessionsLike("%subagent%").filter((s) => !s.key?.includes("workboard"));
    x.emit({ phase: "rollout", name: "sessions-spawn", ...r, parent: x.actualRuntime([explicit("pin-parent")]), children, childRan: children.length ? x.actualRuntime(children.map((c) => c.key)) : null, spawnLines: x.lines.filter((l) => /sessions_spawn|subagent.*(spawn|model)|spawn.*model/iu.test(l.line)).map((l) => x.redact(l.line).slice(0, 220)).slice(-4) });
    // what a failing /vds falls back to in this config
    if (process.env.ROLLOUT_FALLBACK_CHECK === "1") {
      const k = explicit("pin-fallback");
      await x.scenario("fallback-warm", k);
      x.setFault("503", "/responses");
      await x.scenario("fallback-503", k);
      x.setFault("ok", null);
      await x.scenario("fallback-recovered", k);
    }
    return;
  }

  if (CASE === "policy") {
    const seen = new Map();
    x.tap((e) => { if (String(e.event).startsWith("plugin.approval.")) { seen.set(e.event + (e.payload?.id ?? ""), e.payload); pending?.(e); } });
    let pending = null;
    for (const arm of (process.env.ROLLOUT_ARMS ?? "vds,flash").split(",")) {
      const key = explicit(`pol-${arm}`);
      assert.equal(await x.prepareSession(key, arm === "vds" ? VDS_REF : FLASH_REF), null);
      const m = (n) => `${arm}-${n}-${hex()}`;
      const only = "如果被拦截或拒绝，不要换任何方法重试，直接回复 BLOCKED 和原因。成功就只回复 DONE。";
      const run = async (name, rules, message, { resolve, timeoutMs } = {}) => {
        setRules(rules);
        const from = Date.now();
        const approvals = [];
        pending = async (e) => {
          if (e.event !== "plugin.approval.requested") return;
          approvals.push({ at: Date.now() - from, keys: Object.keys(e.payload ?? {}), request: JSON.parse(JSON.stringify(e.payload?.request ?? {}, (k, v) => (typeof v === "string" ? v.slice(0, 80) : v))) });
          if (resolve) { await sleep(3_000); const out = await x.client.request("plugin.approval.resolve", { id: e.payload.id, decision: resolve }, { timeoutMs: 30_000 }).catch((err) => ({ error: String(err?.message ?? err).slice(0, 200) })); approvals.push({ resolved: resolve, out }); }
        };
        const r = await turn(key, message, { timeoutMs });
        setRules([]);
        pending = null;
        return { arm, name, ...r, approvals, hook: hookLines().filter((h) => h.at >= from).map((h) => ({ tool: h.tool, rule: h.rule, sleptMs: h.sleptMs, pid: h.pid === x.gateway.pid ? "gateway" : "other", params: h.params?.slice(0, 90) })) };
      };
      const touch = (n) => `用 shell 执行 \`touch ${MARKERS}/${n}\`。`;
      {
        const a = m("inv-shell"); const b = m("inv-write"); const c = m("inv-probe");
        const out = await run("inventory", [], `（自动化验证）按顺序做，一步不省：1) ${touch(a)} 2) 用读文件工具读工作区 AGENTS.md 前 3 行。 3) 用写文件或改文件的工具（不要用 shell）新建 ${MARKERS}/${b}，内容 x。 4) 调用 hr_probe 工具，marker=${c}。 5) 调用 session_status 工具。 6) 用看图工具 view_image 看 ${path.join(PROBE, "nonexistent.png")}，失败也没关系。全部做完只回复 DONE。`);
        x.emit({ phase: "rollout", ...out, markers: { shell: marker(a), write: marker(b), probe: marker(c) } });
      }
      for (const [name, rule, resolve] of [["approve-deny", "approve", "deny"], ["approve-allow", "approve", "allow-once"], ["block", "block", null]]) {
        const n = m(name);
        const out = await run(name, [{ match: n, action: rule }], `（自动化验证）${touch(n)}${only}`, { resolve });
        x.emit({ phase: "rollout", ...out, marker: marker(n) });
      }
      // nobody answers: the card times out
      {
        const n = m("approve-timeout");
        const out = await run("approve-timeout", [{ match: n, action: "approve", timeoutMs: 20_000 }], `（自动化验证）${touch(n)}${only}`);
        x.emit({ phase: "rollout", ...out, marker: marker(n) });
      }
      // a dynamic (OpenClaw) tool
      for (const [name, resolve] of [["dyn-deny", "deny"], ["dyn-allow", "allow-once"]]) {
        const n = m(name);
        const out = await run(name, [{ tool: "hr_probe", action: "approve" }], `（自动化验证）调用 hr_probe 工具，marker=${n}。${only}`, { resolve });
        x.emit({ phase: "rollout", ...out, marker: marker(n) });
      }
      // the hook decides to block, but only after longer than any relay timeout
      {
        const n = m("slow");
        const out = await run("slow-hook-block", [{ match: n, action: "sleep-block", ms: Number(process.env.ROLLOUT_SLOW_MS ?? 90_000) }], `（自动化验证）${touch(n)}${only}`, { timeoutMs: 280_000 });
        x.emit({ phase: "rollout", ...out, marker: marker(n), relayLines: x.lines.filter((l) => /hook relay|native.?hook|hook.*(timeout|timed out)/iu.test(l.line)).map((l) => x.redact(l.line).slice(0, 220)).slice(-6), codexCalls: arm === "vds" ? codexCalls(Date.now() - out.doneMs - 1000) : null });
        await sleep(15_000);
      }
      // a command typed into a running shell instead of passed as the command
      {
        const n = m("stdin");
        const out = await run("stdin-bypass", [{ match: n, action: "block" }], `（自动化验证）先用 shell 工具启动一个交互式 bash（用伪终端，保持会话不退出），然后用向运行中进程写入标准输入的工具（Codex 的 write_stdin，或 OpenClaw 的 process write/submit）写入这一行并回车：touch ${MARKERS}/${n}。不要把这条命令直接作为 shell 命令执行。之后结束那个 bash。${only}`);
        x.emit({ phase: "rollout", ...out, marker: marker(n) });
      }
      // the same rule, against a command assembled at run time
      {
        const n = m("obfus");
        const enc = Buffer.from(`touch ${MARKERS}/${n}`).toString("base64");
        const out = await run("encoded-command", [{ match: n, action: "block" }], `（自动化验证）用 shell 原样执行 \`echo ${enc} | base64 -d | sh\`。${only}`);
        x.emit({ phase: "rollout", ...out, marker: marker(n) });
      }
    }
    x.emit({ phase: "rollout", name: "tool-surface", requests: x.faultLog.filter((f) => f.tools).reduce((acc, f) => { const k = f.url.includes("responses") ? "responses" : "completions"; acc[k] = f.tools; return acc; }, {}) });
    return;
  }

  // What a tool call does when the policy hook does not answer in time, and the approval path with a
  // route (ROLLOUT_APPROVAL_ROUTE gives the Gateway a forwarder, standing in for the Feishu runtime).
  if (CASE === "hook") {
    const tail = async (key, n = 8) => {
      const h = await x.client.request("chat.history", { agentId: "makaron", sessionKey: key, limit: n }, { timeoutMs: 60_000 }).catch(() => null);
      return (h?.messages ?? []).map((m) => ({ role: m.role, content: x.redact(JSON.stringify(m.content)).slice(0, 360) }));
    };
    let approvalTap = null;
    x.tap((e) => { if (String(e.event).startsWith("plugin.approval.")) approvalTap?.(e); });
    for (const arm of (process.env.ROLLOUT_ARMS ?? "vds,flash").split(",")) {
      const key = explicit(`hook-${arm}`);
      assert.equal(await x.prepareSession(key, arm === "vds" ? VDS_REF : FLASH_REF), null);
      await turn(key, "（自动化验证）只回复 OK。");
      for (const ms of (process.env.ROLLOUT_SLOW_LIST ?? "4000,14000,30000,90000").split(",").map(Number)) {
        const n = `${arm}-slow${ms}-${hex()}`;
        setRules([{ match: n, action: "sleep-block", ms }]);
        const from = Date.now();
        const r = await turn(key, `（自动化验证）用 shell 执行 \`touch ${MARKERS}/${n}\`。如果被拦截或拒绝，不要换任何方法重试，直接回复 BLOCKED 和收到的原文。成功就只回复 DONE。`, { timeoutMs: 240_000 });
        const madeAt = marker(n) ? fs.statSync(path.join(MARKERS, n)).mtimeMs - from : null;
        setRules([]);
        x.emit({ phase: "rollout", name: "slow-hook", arm, hookMs: ms, ...r, marker: marker(n), markerAtMs: madeAt, hook: hookLines().filter((h) => h.at >= from).map((h) => ({ at: h.at - from, tool: h.tool, rule: h.rule, sleptMs: h.sleptMs })), history: (await tail(key, 6)).filter((m) => m.role !== "user") });
        await sleep(Math.min(ms + 3_000, 95_000));
      }
      for (const [name, decision] of [["route-deny", "deny"], ["route-allow", "allow-once"], ["route-unanswered", null]]) {
        const n = `${arm}-${name}-${hex()}`;
        setRules([{ match: n, action: "approve", timeoutMs: 20_000 }]);
        const from = Date.now();
        const seen = [];
        approvalTap = async (e) => {
          seen.push({ event: e.event, at: Date.now() - from, ...(e.event === "plugin.approval.requested" ? { request: JSON.parse(JSON.stringify(e.payload?.request ?? {}, (k, v) => (typeof v === "string" ? v.slice(0, 60) : v))) } : {}) });
          if (e.event === "plugin.approval.requested" && decision) { await sleep(2_000); const out = await x.client.request("plugin.approval.resolve", { id: e.payload.id, decision }, { timeoutMs: 30_000 }).catch((err) => ({ error: x.redact(err?.message ?? err).slice(0, 200) })); seen.push({ resolved: decision, out }); }
        };
        const r = await turn(key, `（自动化验证）用 shell 执行 \`touch ${MARKERS}/${n}\`。如果被拦截或拒绝，不要换任何方法重试，直接回复 BLOCKED 和收到的原文。成功就只回复 DONE。`, { timeoutMs: 180_000 });
        setRules([]);
        approvalTap = null;
        x.emit({ phase: "rollout", name, arm, ...r, marker: marker(n), approvals: seen, hook: hookLines().filter((h) => h.at >= from).map((h) => ({ tool: h.tool, rule: h.rule })) });
      }
    }
    return;
  }

  // The policy run once saw a command run after its hook had timed out. Same prompt, repeated, with
  // what Codex itself recorded for each call.
  if (CASE === "hookrepeat") {
    const key = explicit("hookrepeat");
    assert.equal(await x.prepareSession(key, VDS_REF), null);
    const only = "如果被拦截或拒绝，不要换任何方法重试，直接回复 BLOCKED 和原因。成功就只回复 DONE。";
    for (let i = 0; i < Number(process.env.ROLLOUT_REPEATS ?? 6); i++) {
      const n = `repeat${i}-${hex()}`;
      setRules([{ match: n, action: "sleep-block", ms: 90_000 }]);
      const from = Date.now();
      const r = await turn(key, `（自动化验证）用 shell 执行 \`touch ${MARKERS}/${n}\`。${only}`, { timeoutMs: 280_000 });
      const madeAt = marker(n) ? fs.statSync(path.join(MARKERS, n)).mtimeMs - from : null;
      setRules([]);
      x.emit({ phase: "rollout", name: "hook-repeat", i, ...r, marker: marker(n), markerAtMs: madeAt, hook: hookLines().filter((h) => h.at >= from && h.rule !== undefined).map((h) => ({ at: h.at - from, tool: h.tool, rule: h.rule, params: h.params?.slice(0, 80) })), rollout: codexCalls(from) });
      await sleep(15_000);
    }
    // An approval nobody can click within the hook budget: the row the Feishu card is drawn from, for
    // a native shell call (inside the 10 s hook) and an OpenClaw tool (the dynamic tool path).
    const approvals = (from) => {
      const db = new DatabaseSync(path.join(process.env.OPENCLAW_STATE_DIR, "state", "openclaw.sqlite"), { readOnly: true });
      try {
        return db.prepare("SELECT approval_id AS id, kind, status, terminal_reason AS reason, source_tool_name AS tool, resolved_at_ms - created_at_ms AS heldMs FROM operator_approvals WHERE created_at_ms >= ? ORDER BY created_at_ms").all(from);
      } catch (error) { return String(error?.message ?? error).slice(0, 200); } finally { db.close(); }
    };
    for (const [arm, ref] of [["vds", VDS_REF], ["flash", FLASH_REF]]) {
      const k = explicit(`route-${arm}`);
      assert.equal(await x.prepareSession(k, ref), null);
      for (const [name, rule, msg] of [["native", (n) => ({ match: n, action: "approve", timeoutMs: 45_000 }), (n) => `用 shell 执行 \`touch ${MARKERS}/${n}\`。`], ["dynamic", () => ({ tool: "hr_probe", action: "approve", timeoutMs: 45_000 }), (n) => `调用 hr_probe 工具，marker=${n}。`]]) {
        const n = `${arm}-${name}-${hex()}`;
        setRules([rule(n)]);
        const from = Date.now();
        // try to answer from outside, as a card click would, half way through the hold
        const answer = (async () => { await sleep(5_000); const rows = approvals(from); const id = Array.isArray(rows) ? rows[0]?.id : null; if (!id) return { rows }; return { id: true, out: await x.client.request("plugin.approval.resolve", { id, decision: "allow-once" }, { timeoutMs: 20_000 }).catch((e) => x.redact(e?.message ?? e).slice(0, 200)) }; })();
        const r = await turn(k, `（自动化验证）${msg(n)}${only}`, { timeoutMs: 200_000 });
        setRules([]);
        x.emit({ phase: "rollout", name: "approval-hold", arm, tool: name, ...r, marker: marker(n), answered: await answer, rows: approvals(from) });
        await sleep(5_000);
      }
    }
    return;
  }

  // The relay CLI denies 9 s after its own code starts, Codex kills the hook at 10 s. A CLI that
  // starts more than 1 s late therefore never answers. What does Codex do with the tool then?
  if (CASE === "hookdelay") {
    const file = path.join(x.dist, fs.readdirSync(x.dist).find((f) => f.startsWith("native-hook-relay-cli-") && fs.statSync(path.join(x.dist, f)).size > 1000));
    const original = fs.readFileSync(file, "utf8");
    const key = explicit("hookdelay");
    assert.equal(await x.prepareSession(key, VDS_REF), null);
    await turn(key, "（自动化验证）只回复 OK。");
    for (const delayMs of (process.env.ROLLOUT_DELAYS ?? "0,500,2500,2500,2500,0").split(",").map(Number)) {
      fs.writeFileSync(file, delayMs ? `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${delayMs});\n${original}` : original);
      const n = `delay${delayMs}-${hex()}`;
      setRules([{ match: n, action: "sleep-block", ms: 40_000 }]);
      const from = Date.now();
      const r = await turn(key, `（自动化验证）用 shell 执行 \`touch ${MARKERS}/${n}\`。如果被拦截或拒绝，不要换任何方法重试，直接回复 BLOCKED 和原因。成功就只回复 DONE。`, { timeoutMs: 200_000 });
      const madeAt = marker(n) ? fs.statSync(path.join(MARKERS, n)).mtimeMs - from : null;
      setRules([]);
      x.emit({ phase: "rollout", name: "cli-start-delay", delayMs, ...r, marker: marker(n), markerAtMs: madeAt, hook: hookLines().filter((h) => h.at >= from && h.rule !== undefined).map((h) => ({ at: h.at - from, tool: h.tool, rule: h.rule })), codexCalls: codexCalls(from) });
      await sleep(45_000);
    }
    fs.writeFileSync(file, original);
    return;
  }

  if (CASE === "voice") {
    const voiceIds = {};
    const consult = async (name, key, cmdFor) => {
      const n = `voice-${name}-${hex()}`;
      const question = `（自动化验证）${cmdFor(n)} 做完只回复 DONE；被拦截就回复 BLOCKED 和原文。`;
      const from = Date.now();
      // the gate only applies to a session that can hear the answer: one with a user transcript
      // (the first tool call opens the session; it has no id to report, so it is read back)
      const voiceSessionId = voiceIds[key];
      const said = voiceSessionId ? await x.client.request("talk.client.transcript", { sessionKey: key, voiceSessionId, entryId: randomUUID(), role: "user", text: "帮我执行一下这个命令", timestamp: Date.now() }, { timeoutMs: 60_000 }).then(() => true).catch((e) => x.redact(e?.message ?? e).slice(0, 200)) : null;
      const res = await x.client.request("talk.client.toolCall", { sessionKey: key, ...(voiceSessionId ? { voiceSessionId } : {}), callId: `call-${hex()}`, name: "openclaw_agent_consult", args: { question } }, { timeoutMs: 120_000 }).catch((e) => ({ error: x.redact(e?.message ?? e).slice(0, 400) }));
      if (!voiceIds[key]) {
        const db = new DatabaseSync(path.join(JSON.parse(fs.readFileSync(x.configPath, "utf8")).agents.entries.makaron.agentDir, "openclaw-agent.sqlite"), { readOnly: true });
        try { voiceIds[key] = JSON.parse(db.prepare("SELECT value_json AS v FROM cache_entries WHERE value_json LIKE ? AND value_json LIKE '%voiceSessionId%' ORDER BY updated_at DESC LIMIT 1").get(`%${key}%`)?.v ?? "{}").voiceSessionId; } finally { db.close(); }
      }
      if (said !== true) x.emit({ phase: "rollout", name: `${name}-transcript`, said, voiceSessionId: Boolean(voiceIds[key]) });
      let wait = null;
      if (res.runId) wait = await x.client.request("agent.wait", { runId: res.runId, timeoutMs: 240_000 }, { timeoutMs: 260_000 }).catch((e) => ({ error: String(e?.message ?? e).slice(0, 200) }));
      const hist = await x.client.request("chat.history", { agentId: "makaron", sessionKey: key, limit: 6 }, { timeoutMs: 60_000 }).catch(() => null);
      const last = (hist?.messages ?? []).filter((m) => m.role === "assistant").at(-1)?.content;
      const toolResults = (hist?.messages ?? []).filter((m) => m.role === "toolResult" || m.role === "tool").map((m) => JSON.stringify(m.content).slice(0, 300));
      x.emit({ phase: "rollout", name, key: key.split(":").pop(), gateEnv: process.env.OPENCLAW_VOICE_SPOKEN_CONFIRMATION ?? null, res: res.error ? res : { runId: Boolean(res.runId) }, waitStatus: wait?.status ?? wait, doneMs: Date.now() - from, ran: x.actualRuntime([key]), marker: marker(n), hook: hookLines().filter((h) => h.at >= from).map((h) => h.tool), reply: x.redact(Array.isArray(last) ? last.filter((c) => c.type === "text").map((c) => c.text).join("") : String(last ?? "")).slice(0, 300), gateSeen: toolResults.some((t) => t.includes("VOICE_CONFIRMATION_REQUIRED")) || x.lines.some((l) => l.at >= from && l.line.includes("VOICE_CONFIRMATION_REQUIRED")) });
    };
    const def = explicit("voice-default");
    await consult("consult-default-readonly", def, () => "用 shell 执行 `ls /tmp | wc -l`。");
    await consult("consult-default-mutation", def, (n) => `用 shell 执行 \`touch ${MARKERS}/${n}\`。`);
    const other = process.env.ROLLOUT_DEFAULT === "vds" ? FLASH_REF : VDS_REF;
    const k = explicit("voice-override");
    assert.equal(await x.prepareSession(k, other), null);
    await consult("consult-override-readonly", k, () => "用 shell 执行 `ls /tmp | wc -l`。");
    await consult("consult-override-mutation", k, (n) => `用 shell 执行 \`touch ${MARKERS}/${n}\`。`);
    return;
  }

  if (CASE === "computer") {
    const N = Number(process.env.ROLLOUT_FRAMES ?? 20);
    const prompt = (count) => `（自动化验证）依次调用 hr_screenshot 工具，frame 从 1 到 ${count}，一次只调一个，看到上一帧结果再调下一个，不要并行，不要跳过，不要写脚本代替。全部做完只回复 DONE ${count}。`;
    const reqs = (from) => x.faultLog.filter((f) => f.at >= from && f.bytes !== undefined).map((f) => ({ ms: f.at - from, mode: f.mode, mb: Math.round(f.bytes / 1e4) / 100, images: f.images, status: f.status }));
    for (const arm of (process.env.ROLLOUT_ARMS ?? "vds,flash").split(",")) {
      const key = explicit(`cu-${arm}`);
      assert.equal(await x.prepareSession(key, arm === "vds" ? VDS_REF : FLASH_REF), null);
      let from = Date.now();
      const r = await turn(key, prompt(N), { timeoutMs: 900_000 });
      x.emit({ phase: "rollout", name: "long-turn", arm, frames: N, ...r, toolCalls: r.tools?.length, ran: x.actualRuntime([key]), requests: reqs(from) });
      from = Date.now();
      const after = await turn(key, "（自动化验证）只回复 OK。");
      x.emit({ phase: "rollout", name: "next-turn", arm, ...after, requests: reqs(from) });
    }
    // DeepSeek refuses bodies above its limit. A lower limit shows what a turn does when it gets there.
    const limit = Number(process.env.ROLLOUT_413_BYTES ?? 3_000_000);
    for (const arm of (process.env.ROLLOUT_413_ARMS ?? "vds").split(",")) {
      const key = explicit(`cu413-${arm}`);
      assert.equal(await x.prepareSession(key, arm === "vds" ? VDS_REF : FLASH_REF), null);
      x.setFault("size413", null, limit);
      let from = Date.now();
      const r = await turn(key, prompt(N), { timeoutMs: 900_000 });
      x.emit({ phase: "rollout", name: "turn-hits-413", arm, limit, ...r, toolCalls: r.tools?.length, requests: reqs(from), fallback: x.fallbackLines(from), ran: x.actualRuntime([key]) });
      from = Date.now();
      const next = await turn(key, "（自动化验证）只回复 OK。");
      x.emit({ phase: "rollout", name: "next-after-413-limit-on", arm, ...next, requests: reqs(from), fallback: x.fallbackLines(from), ran: x.actualRuntime([key]) });
      x.setFault("ok", null);
      from = Date.now();
      const after = await turn(key, "（自动化验证）只回复 OK2。");
      x.emit({ phase: "rollout", name: "next-after-limit-off", arm, ...after, requests: reqs(from), ran: x.actualRuntime([key]) });
    }
    return;
  }

  if (CASE === "migrate") {
    // the real function and reload plan, when their chunks load outside the Gateway
    const dist = x.dist;
    try {
      const overrides = fs.readdirSync(dist).find((f) => f.startsWith("model-overrides-") && fs.readFileSync(path.join(dist, f), "utf8").includes("function resolveChannelModelOverride"));
      const { t: resolve } = await import(path.join(dist, overrides));
      const cfg = { channels: { modelByChannel: { feishu: { oc_260a94509d8464a58c4f66966093356e: VDS_REF } } } };
      const probe = (o) => resolve({ cfg, channel: "feishu", ...o })?.model ?? null;
      x.emit({ phase: "rollout", name: "channel-match", cases: {
        group: probe({ groupId: "oc_260a94509d8464a58c4f66966093356e", groupChatType: "group" }),
        otherGroup: probe({ groupId: "oc_other", groupChatType: "group" }),
        direct: probe({ groupChatType: "direct", directUserIds: ["ou_someone"] }),
        subagentOfGroup: probe({ parentSessionKey: "agent:makaron:feishu:group:oc_260a94509d8464a58c4f66966093356e" }),
        noGroup: probe({}),
      } });
    } catch (error) { x.emit({ phase: "rollout", name: "channel-match", error: String(error?.message ?? error).slice(0, 200) }); }
    try {
      const planFile = fs.readdirSync(dist).find((f) => f.startsWith("config-reload-plan-"));
      const planMod = await import(path.join(dist, planFile));
      const fn = Object.values(planMod).find((v) => { try { const p = typeof v === "function" ? v(["channels.modelByChannel"]) : null; return p && typeof p === "object" && "restartGateway" in p; } catch { return false; } });
      x.emit({ phase: "rollout", name: "reload-plan", plans: fn ? Object.fromEntries(["channels.modelByChannel.feishu.oc_x", "agents.entries.makaron.model", "agents.defaults.model", "agents.entries.makaron.subagents.model"].map((k) => { const p = fn([k]); return [k, { restartGateway: p.restartGateway, hot: p.hotReasons, restart: p.restartReasons }]; })) : `no plan function in ${Object.keys(planMod)}` });
    } catch (error) { x.emit({ phase: "rollout", name: "reload-plan", error: String(error?.message ?? error).slice(0, 200) }); }

    const key = explicit("migrate");
    const word = `暗号${createHash("sha256").update(hex()).digest("hex").slice(0, 6)}`;
    const t1 = await turn(key, `（自动化验证）记住：今天的暗号是 ${word}。只回复 记住了。`);
    x.emit({ phase: "rollout", name: "before-switch", ...t1, ran: x.actualRuntime([key]) });
    const writeMap = (map) => {
      const c = JSON.parse(fs.readFileSync(x.configPath, "utf8"));
      c.channels ??= {};
      if (map) c.channels.modelByChannel = map; else delete c.channels.modelByChannel;
      fs.writeFileSync(x.configPath, `${JSON.stringify(c, null, 2)}\n`, { mode: 0o600 });
    };
    const applied = async (name) => {
      const from = Date.now();
      const pid = x.gateway.pid;
      writeMap(name === "add" ? { webchat: { "*": VDS_REF }, feishu: { oc_rolloutgroup: VDS_REF } } : null);
      await sleep(Number(process.env.ROLLOUT_RELOAD_WAIT_MS ?? 45_000));
      const live = x.gateway.exitCode === null;
      const out = { phase: "rollout", name: `config-${name}`, samePid: x.gateway.pid === pid, gatewayLive: live, reload: reloadLines(from) };
      // whether the running Gateway already uses the new map, before any restart
      if (live) { const hot = await turn(explicit(`probe-${name}-${hex()}`), "（自动化验证）只回复 OK。"); out.probeNewSession = { ...hot }; const probes = x.sessionsLike(`agent:makaron:explicit:probe-${name}-%`); out.probeRan = probes?.[0] ?? probes; }
      x.emit(out);
      const restartFrom = Date.now();
      await x.restartGateway();
      x.emit({ phase: "rollout", name: `restart-after-${name}`, seconds: Math.round((Date.now() - restartFrom) / 1000) });
    };
    await applied("add");
    const t2 = await turn(key, "（自动化验证）今天的暗号是什么？只回复暗号本身。");
    x.emit({ phase: "rollout", name: "worker-session-to-codex", ...t2, remembered: t2.text.includes(word), ran: x.actualRuntime([key]) });
    // the same map through the `agent` entry a channel-bound run uses, for a listed and an unlisted group
    for (const [name, group] of [["feishu-listed-group", "oc_rolloutgroup"], ["feishu-other-group", "oc_rolloutother"]]) {
      const k = `agent:makaron:feishu:group:${group}`;
      const res = await x.client.request("agent", { sessionKey: k, message: "（自动化验证）只回复 OK。", channel: "feishu", groupId: group, deliver: false, idempotencyKey: randomUUID() }, { timeoutMs: 120_000 }).catch((e) => ({ error: x.redact(e?.message ?? e).slice(0, 300) }));
      if (res.runId) await x.client.request("agent.wait", { runId: res.runId, timeoutMs: 120_000 }, { timeoutMs: 140_000 }).catch(() => null);
      x.emit({ phase: "rollout", name, error: res.error, ran: x.actualRuntime([k]) });
    }
    const t3 = await turn(key, `（自动化验证）再记住第二个暗号 ${word}B。只回复 记住了。`);
    x.emit({ phase: "rollout", name: "codex-second-turn", ...t3, ran: x.actualRuntime([key]) });
    await applied("remove");
    const t4 = await turn(key, "（自动化验证）第二个暗号是什么？只回复暗号本身。");
    x.emit({ phase: "rollout", name: "codex-session-back-to-worker", ...t4, remembered: t4.text.includes(`${word}B`), ran: x.actualRuntime([key]) });
    return;
  }
  throw new Error(`unknown ROLLOUT_CASE ${CASE}`);
}
