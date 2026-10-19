#!/usr/bin/env node
// Shared VLab / V acceptance for the restart-speed release: one controlled Gateway restart,
// timed the way a user sees it. A Feishu message (operator's own user, lark-cli) is sent as soon
// as the Gateway's Feishu connection is up; the reply time counts from `systemctl restart`.
// Then a Worker turn that must run exec, and, 5+ minutes after the start, the native integrity
// verifier's result. Requires the caller to hold the shared VLab lease (or V authorization).
//
//   node lab/restart-speed-accept.mjs --target vlab [--tag RS1] [--skip-verifier true]
//   node lab/restart-speed-accept.mjs --target v --self-restart true --requested-by "who, where, when"
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, arg, i, all) => {
  if (arg.startsWith("--")) acc.push([arg.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
  return acc;
}, []));
const TARGETS = {
  vlab: { chat: "oc_5afced473a29eb6f5fed3ba9966aa9ff", bot: "ou_b4c17dbac69b0aff77bac433448dc0f6", ssh: ["vlab"], unit: "openclaw-vlab-production-mirror-v8.service", user: "lab-db91-parity" },
  v: { chat: "oc_104de99774aea6a55f5ae46863e99ef3", bot: "ou_b1cdeccdefbd26f53e51835b3cc7554a", ssh: ["v"], unit: "openclaw-gateway.service", user: "openclaw" },
};
const target = TARGETS[args.target];
assert(target, "--target vlab|v");
const tag = String(args.tag ?? `RS${Date.now().toString(36)}`).toUpperCase();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = { target: args.target, tag, ok: false };
const log = (name, detail = {}) => console.error(`[accept] ${JSON.stringify({ name, ...detail })}`);

const sq = (s) => `'${String(s).replaceAll("'", `'\\''`)}'`;
function remote(script, { timeoutMs = 180_000 } = {}) {
  return execFileSync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=20", ...target.ssh, script], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs });
}
// Journal lines since t0 (epoch seconds), with their own timestamps.
function journal(sinceS) {
  const out = remote(`sudo journalctl -u ${target.unit} --since @${Math.floor(sinceS)} --no-pager -o short-unix | sed 's/\\x1b\\[[0-9;]*m//g' | grep -a -E 'Stopping |Stopped |Starting |Started |preflight (start|passed)|clean-restart carry|ws client ready|"stage":"pool-ready"|\\[gateway\\] ready|database-verify|worker-runtime-prewarm' || true`, { timeoutMs: 60_000 });
  return out.split("\n").filter(Boolean).map((l) => ({ t: Number(l.slice(0, l.indexOf(" "))), line: l.slice(l.indexOf(" ") + 1) }));
}

const lark = (argv) => { const out = execFileSync("lark-cli", argv, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }); return JSON.parse(out.slice(out.indexOf("{"))); };
const send = (text) => {
  const r = lark(["im", "+messages-send", "--as", "user", "--chat-id", target.chat, "--text", `<at user_id="${target.bot}">V</at> ${text}`]);
  assert(r.ok !== false && r.data?.message_id, `send failed: ${JSON.stringify(r).slice(0, 300)}`);
  return r.data.message_id;
};
const botMessages = () => (lark(["im", "+chat-messages-list", "--as", "user", "--chat-id", target.chat, "--page-size", "30", "--no-reactions"]).data?.messages ?? [])
  .filter((m) => m.sender?.sender_type === "app").map((m) => ({ id: m.message_id, replyTo: m.reply_to, content: String(m.content ?? "") }));
// Bot messages that already existed before a request can never be its reply.
const seenBefore = () => new Set(botMessages().map((m) => m.id));
async function awaitReply(requestId, test, timeoutMs, before = new Set()) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const all = botMessages().filter((m) => !before.has(m.id));
    last = all.find((m) => test(m.content)) ?? all.find((m) => m.replyTo === requestId) ?? last;
    if (last && test(last.content)) return { ...last, at: Date.now() };
    await sleep(1_500);
  }
  throw new Error(`no matching reply; last=${last?.content.slice(0, 300) ?? "none"}`);
}
const footerRuntime = (content) => content.match(/Runtime:\s*([\w-]+)/u)?.[1] ?? null;

try {
  const active = remote(`PID=$(systemctl show -p MainPID --value ${target.unit}); ps -o pid= --ppid "$PID" -o args= | grep -c '/worker.mjs' || true`).trim();
  log("before", { workerProcesses: Number(active) });

  if (args["exec-only"] === "true") {
    const execBefore = seenBefore();
    const t1 = Date.now();
    const execId = send("这是一次自动化验收，请严格照做：用 exec 工具运行命令 cat /proc/sys/kernel/random/uuid，然后只回复命令输出的那一行，不要其他文字。");
    const execReply = await awaitReply(execId, (c) => /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/u.test(c), 300_000, execBefore);
    report.execTurn = { seconds: Math.round((execReply.at - t1) / 100) / 10, runtime: footerRuntime(execReply.content), reply: execReply.id };
    report.ok = true;
    console.log(JSON.stringify(report, null, 1));
    process.exit(0);
  }
  // 1. restart, and a user message as soon as Feishu is connected
  const t0 = Date.now() / 1000;
  // V restarts through its own entry (docs/v-self-restart.md): stop, clear dead Codex
  // registrations, start. The clock starts when the request is made.
  if (args["self-restart"] === "true") assert(String(args["requested-by"] ?? "").length > 0, "--requested-by is required for v-self-restart");
  if (args["self-restart"] === "true") remote(`sudo v-self-restart --reason ${sq(`restart-speed 计时验收 ${tag}`)} --requested-by ${sq(String(args["requested-by"] ?? ""))} --delay 0 --force`, { timeoutMs: 120_000 });
  else remote(`sudo systemctl restart ${target.unit}`, { timeoutMs: 600_000 });
  const marker = `${tag}-R-OK`;
  let sent = null;
  let marks = {};
  const deadline = Date.now() + 1_500_000;
  while (Date.now() < deadline) {
    const lines = journal(t0 - 1);
    const first = (re) => lines.find((l) => re.test(l.line))?.t;
    marks = {
      stopping: first(/systemd\[1\]: Stopping /u), stopped: first(/systemd\[1\]: Stopped /u), started: first(/systemd\[1\]: Started /u), preflightStart: first(/preflight start/u), preflightEnd: first(/preflight passed/u),
      feishuWs: first(/ws client ready/u), firstWorker: first(/"stage":"pool-ready"/u), gatewayReady: first(/\[gateway\] ready/u),
    };
    report.carry = lines.find((l) => l.line.includes("clean-restart carry"))?.line.replace(/^.*clean-restart carry: /u, "") ?? null;
    report.preflight = lines.find((l) => l.line.includes("preflight passed"))?.line.replace(/^.*preflight passed/u, "passed") ?? null;
    if (!sent && marks.feishuWs) { sent = { before: seenBefore(), id: send(`只回复 ${marker}，不要调用任何工具。`), at: Date.now() }; log("sent", { afterRestartS: Math.round(sent.at / 1000 - t0) }); }
    if (sent && marks.gatewayReady) break;
    await sleep(1_000);
  }
  assert(sent, "Feishu never connected");
  const reply = await awaitReply(sent.id, (c) => c.includes(marker), 300_000, sent.before);
  report.restart = Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, v ? Math.round((v - t0) * 10) / 10 : null]));
  report.restart.messageSentS = Math.round((sent.at / 1000 - t0) * 10) / 10;
  report.restart.replySeenS = Math.round((reply.at / 1000 - t0) * 10) / 10;
  report.restart.replyRuntime = footerRuntime(reply.content);
  const prewarm = journal(t0 - 1).filter((l) => l.line.includes("worker-runtime-prewarm")).map((l) => { try { const j = JSON.parse(l.line.slice(l.line.indexOf("{"))); return `${j.ms}/${j.preparedMs}/${j.distResolveFastPath}/${j.compileCache}/${j.secretsPrepared}`; } catch { return null; } });
  report.restart.prewarm = prewarm;
  log("restart", report.restart);

  // 2. a Worker turn that must run exec: the answer is a fresh UUID only the command produces
  const execBefore = seenBefore();
  const t1 = Date.now();
  const execId = send("这是一次自动化验收，请严格照做：用 exec 工具运行命令 cat /proc/sys/kernel/random/uuid，然后只回复命令输出的那一行，不要其他文字。");
  const execReply = await awaitReply(execId, (c) => /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/u.test(c), 300_000, execBefore);
  report.execTurn = { seconds: Math.round((execReply.at - t1) / 100) / 10, runtime: footerRuntime(execReply.content), uuid: true };
  log("exec", report.execTurn);

  // 3. the native verifier, 5 minutes after start: full check of every database, receipts refreshed
  if (args["skip-verifier"] !== "true") {
    const until = (t0 + Number(args["verifier-timeout-s"] ?? 2400)) * 1000; // V: 5 min delay + 8-27 min scan
    let v = [];
    while (Date.now() < until) {
      v = journal(t0 - 1).filter((l) => /database-verify/u.test(l.line));
      if (v.some((l) => /verifier failed|verification failed/u.test(l.line)) || v.filter((l) => /verification passed/u.test(l.line)).length >= 2) break;
      await sleep(10_000);
    }
    report.verifier = { passed: v.filter((l) => /verification passed/u.test(l.line)).length, failed: v.filter((l) => /failed/u.test(l.line)).map((l) => l.line.slice(-200)), firstAtS: v[0] ? Math.round(v[0].t - t0) : null };
    log("verifier", report.verifier);
    assert(report.verifier.passed >= 2 && report.verifier.failed.length === 0, "native verifier did not pass");
  }
  report.ok = true;
} catch (error) {
  report.error = String(error?.message ?? error).slice(0, 800);
  process.exitCode = 1;
}
console.log(JSON.stringify(report, null, 1));
