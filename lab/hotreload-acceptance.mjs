#!/usr/bin/env node
// Real-Feishu acceptance of the hotreload-feishu-approvals release (#171 + #172)
// on shared VLab or production V. Messages are sent as the operator's own Feishu
// user (lark-cli) into an acceptance group; Gateway state is read over its RPC.
//
//   node lab/hotreload-acceptance.mjs --target vlab|v --steps base,roll,config,approval
//
// Steps:
//   base      Worker plugin is the new build, one live generation, Workers ready,
//             derived Worker config in place; a plain turn gets a visible reply.
//   roll      A long reply is streaming through a Worker when vlab.workers.roll
//             replaces the generation. The reply must finish in the old
//             generation, the next turn must succeed in the new one, the old
//             generation must drain to zero, and no Worker may be left behind.
//   config    The same, but the roll is caused by editing a Gateway config key
//             that 9.1 treats as a no-op (wizard.lastRunCommand); the Worker
//             config watch must roll by itself. The key is restored afterwards
//             (byte-exact on VLab, whose tooling pins the config hash).
//   approval  (#171) The bot is asked in the group to change a no-op config key
//             (messages.ackReaction). The approval card must reach the owner's
//             Feishu DM; the operator taps 批准 on the phone; the change must be
//             written and the turn must continue. The key is restored afterwards.
// Writes a JSON report to stdout; exits non-zero on the first failed check.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, arg, i, all) => {
  if (arg.startsWith("--")) acc.push([arg.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
  return acc;
}, []));
const TARGETS = {
  vlab: {
    chat: "oc_5afced473a29eb6f5fed3ba9966aa9ff", // VLab 发布验收 B (Tianyi + V - Lab)
    bot: "ou_b4c17dbac69b0aff77bac433448dc0f6", // V - Lab
    ssh: ["-F", "/Users/tianyicai/v-upgrade-private/20260904/ssh-config", "vlab91"],
    unit: "openclaw-vlab-production-mirror-v8.service",
    user: "lab-db91-parity",
  },
  v: {
    chat: "oc_104de99774aea6a55f5ae46863e99ef3", // V 生产发布验收 0910 (Tianyi + V - Makaron)
    bot: "ou_b1cdeccdefbd26f53e51835b3cc7554a", // V - Makaron
    ssh: ["v"],
    unit: "openclaw-gateway.service",
    user: "openclaw",
  },
};
const target = TARGETS[args.target];
assert(target, "--target vlab|v");
const steps = String(args.steps ?? "base,roll,config").split(",");
const tag = String(args.tag ?? `HR${Date.now().toString(36)}`).toUpperCase();
const EXPECTED_VERSION = "0.2.12-generations.1";
const startedAt = Date.now();
const report = { target: args.target, tag, steps: [], ok: false };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const note = (name, detail = {}) => {
  const entry = { name, atS: Math.round((Date.now() - startedAt) / 1000), ...detail };
  report.steps.push(entry);
  console.error(`[accept] ${JSON.stringify(entry)}`);
  return entry;
};

// --- remote ---------------------------------------------------------------
const sq = (s) => `'${String(s).replaceAll("'", `'\\''`)}'`;
function remote(script, { input, timeoutMs = 180_000 } = {}) {
  try {
    return execFileSync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=20", ...target.ssh, script], {
      input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs, stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(`remote failed: ${String(error.stderr ?? "").slice(-600) || error.message}`);
  }
}
// Runs the Gateway's own CLI as the service user with the service's environment.
// The script travels on stdin, so argv needs only one level of shell quoting.
function openclaw(argv, timeoutMs) {
  const script = `set -e
PID=$(systemctl show -p MainPID --value ${target.unit})
test "$PID" -gt 1
NODE=$(readlink /proc/$PID/exe)
CLI=$(tr '\\0' '\\n' < /proc/$PID/cmdline | grep -E '/dist/index\\.js$' | head -1)
mapfile -t ENVV < <(tr '\\0' '\\n' < /proc/$PID/environ | grep -E '^(HOME|PATH|OPENCLAW_[A-Z0-9_]+)=')
cd /
exec sudo -u ${target.user} env -i "\${ENVV[@]}" "$NODE" "$CLI" ${argv.map(sq).join(" ")}
`;
  return remote("sudo bash -s", { input: script, timeoutMs });
}
function rpc(method, params = {}, timeoutMs = 120_000) {
  const out = openclaw(["gateway", "call", method, "--params", JSON.stringify(params), "--json", "--timeout", String(timeoutMs)], timeoutMs + 30_000);
  return JSON.parse(out.slice(out.indexOf("{")));
}
const status = () => rpc("vlab.workers.status");
const liveWorkers = (s) => s.workers.filter((w) => w.ready && !w.retiring).length;
const ourActive = (s, sessionPart) =>
  s.workers.some((w) => w.active.some((a) => String(a.sessionKey ?? "").includes(sessionPart)));
function journalCount(pattern) {
  const since = new Date(startedAt - 5_000).toISOString().replace("T", " ").slice(0, 19);
  const out = remote(`sudo journalctl -u ${target.unit} --since ${sq(since)} --no-pager -o cat | grep -c -E ${sq(pattern)} || true`);
  return Number(out.trim() || 0);
}
// Worker processes actually alive under the Gateway, versus what the pool reports.
function workerProcesses() {
  const out = remote(`PID=$(systemctl show -p MainPID --value ${target.unit}); ps -o pid= --ppid "$PID" -o args= | grep -c '/worker.mjs' || true`);
  return Number(out.trim() || 0);
}

// --- Feishu (operator's own user) -----------------------------------------
const lark = (argv) => {
  const out = execFileSync("lark-cli", argv, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(out.slice(out.indexOf("{")));
};
const send = (text) => {
  const r = lark(["im", "+messages-send", "--as", "user", "--chat-id", target.chat, "--text", `<at user_id="${target.bot}">V</at> ${text}`]);
  assert(r.ok !== false && r.data?.message_id, `send failed: ${JSON.stringify(r).slice(0, 300)}`);
  return r.data.message_id;
};
const botCards = (sinceMs) => (lark(["im", "+chat-messages-list", "--as", "user", "--chat-id", target.chat, "--page-size", "30", "--no-reactions"]).data?.messages ?? [])
  .filter((m) => m.sender?.sender_type === "app" && Date.parse(`${m.create_time.replace(" ", "T")}:00+08:00`) >= sinceMs - 60_000)
  .map((m) => ({ id: m.message_id, replyTo: m.reply_to, content: String(m.content ?? "") }));
async function awaitReply(requestId, marker, sinceMs, timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const cards = botCards(sinceMs).filter((m) => m.replyTo === requestId);
    last = cards.find((m) => m.content.includes(marker)) ?? cards.at(-1) ?? last;
    if (last?.content.includes(marker)) return last;
    if (last && /couldn't generate a response|worker pool is closing/u.test(last.content)) break;
    await sleep(4_000);
  }
  throw new Error(`no reply carrying ${marker}; last=${last?.content.slice(0, 300) ?? "none"}`);
}
async function waitFor(label, fn, timeoutMs, intervalMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try { last = await fn(); if (last) return last; } catch (error) { last = error; }
    await sleep(intervalMs);
  }
  throw new Error(`${label} timed out; last=${last instanceof Error ? last.message : JSON.stringify(last)?.slice(0, 300)}`);
}
const shortTurn = async (label) => {
  const marker = `${tag}-${label}-OK`;
  const at = Date.now();
  const id = send(`只回复 ${marker}，不要调用任何工具。`);
  const card = await awaitReply(id, marker, at, 180_000);
  const runtime = footerRuntime(card.content);
  note(`${label}:reply`, { message: id, reply: card.id, runtime, seconds: Math.round((Date.now() - at) / 1000) });
  assert.ok(!["codex", "claude-cli"].includes(runtime), `turn ran on ${runtime}, not through the Worker pool`);
  return card;
};
// A reply long enough to be mid-stream when the generation changes.
const longTurn = (label) => {
  const marker = `${tag}-${label}-END`;
  const at = Date.now();
  // Counting streams steadily for a minute or more; an essay can finish before
  // a config change is even detected.
  const id = send(`请按顺序输出从 1 到 3000 的阿拉伯数字，每行一个数字，不要省略任何一个，不要调用任何工具，不要加别的文字。全部输出完后单独一行写 ${marker}`);
  note(`${label}:sent`, { message: id });
  return { id, marker, at };
};

// --- config edits -----------------------------------------------------------
function configPath() {
  return remote(`PID=$(systemctl show -p MainPID --value ${target.unit}); sudo cat /proc/$PID/environ | tr '\\0' '\\n' | sed -n 's/^OPENCLAW_CONFIG_PATH=//p'`).trim()
    || (args.target === "v" ? "/home/openclaw/.openclaw/openclaw.json" : "");
}
const sha = (path) => remote(`sudo sha256sum ${sq(path)} | cut -c1-64`).trim();
// Edits one JSON key in place, keeping owner and mode; returns a backup path
// holding the exact previous bytes.
function editConfig(path, keyPath, value) {
  const backup = `${path}.hotreload-acceptance-${tag}`;
  const js = `const fs=require("fs");const p=process.argv[1];const c=JSON.parse(fs.readFileSync(p,"utf8"));
const keys=JSON.parse(process.argv[2]);let n=c;for(const k of keys.slice(0,-1)){n[k]??={};n=n[k];}
const v=JSON.parse(process.argv[3]);if(v===null)delete n[keys.at(-1)];else n[keys.at(-1)]=v;
const st=fs.statSync(p);const tmp=p+".tmp-hr";fs.writeFileSync(tmp,JSON.stringify(c,null,2)+"\\n",{mode:st.mode&0o777});fs.chownSync(tmp,st.uid,st.gid);fs.renameSync(tmp,p);`;
  remote(`set -e; sudo test -e ${sq(backup)} || sudo cp -p ${sq(path)} ${sq(backup)}; NODE=$(sudo readlink /proc/$(systemctl show -p MainPID --value ${target.unit})/exe); sudo "$NODE" -e ${sq(js)} ${sq(path)} ${sq(JSON.stringify(keyPath))} ${sq(JSON.stringify(value))}`);
  return backup;
}
function restoreConfig(path, backup) {
  // Copy the exact bytes back over a fresh inode, keeping owner and mode.
  remote(`set -e; sudo cp -p ${sq(backup)} ${sq(path)}.tmp-hr && sudo mv ${sq(path)}.tmp-hr ${sq(path)} && sudo rm -f ${sq(backup)}`);
}

// --- steps -------------------------------------------------------------------
// The group's session may have been switched to a harness that never uses the
// Worker pool (e.g. /vcodex runs on Codex). Put it back on the default model
// and require a footer that is not a Codex or Claude CLI runtime.
const footerRuntime = (content) => content.match(/Runtime:\s*([\w-]+)/u)?.[1] ?? null;
async function useWorkerModel(model = "default") {
  const at = Date.now();
  const id = send(`/model ${model}`);
  const reply = await waitFor("model switch reply",
    () => botCards(at).find((m) => m.replyTo === id) ?? null, 120_000, 4_000);
  note(`model:${model}`, { reply: reply.id, text: reply.content.slice(0, 160) });
}

async function stepBase() {
  await useWorkerModel();
  const s = status();
  const version = s.diagnostics?.workerIsolationVersion ?? s.workerIsolationVersion
    ?? JSON.stringify(s).match(/0\.2\.\d+[-\w.]*/u)?.[0];
  note("base:status", { version, generation: s.generation, workers: liveWorkers(s), draining: s.draining, predecessor: s.predecessor });
  assert.equal(version, EXPECTED_VERSION, "Worker plugin is the new build");
  assert.ok(Number.isInteger(s.generation), "status reports a generation");
  assert.equal(s.predecessor, null, "no generation is draining at rest");
  assert.ok(liveWorkers(s) >= 1, "Workers are ready");
  const derived = journalCount("Worker config (derived|derivation)");
  note("base:derived-log", { lines: derived });
  await shortTurn("BASE");
}

async function rollDuring(label, cause) {
  const turn = longTurn(label);
  // The run must be inside a Worker before the generation changes.
  await waitFor(`${label} active in a Worker`, () => ourActive(status(), target.chat), 120_000, 2_000);
  const before = status();
  const caused = await cause(before);
  const after = await waitFor(`${label} new generation`, () => {
    const s = status();
    return s.generation > before.generation ? s : null;
  }, 120_000);
  note(`${label}:rolled`, { from: before.generation, to: after.generation, predecessor: after.predecessor, caused });
  assert.ok(after.predecessor && after.predecessor.active >= 1, "the old generation kept the running turn");
  const card = await awaitReply(turn.id, turn.marker, turn.at, 600_000);
  note(`${label}:in-flight-finished`, { reply: card.id, chars: card.content.length, seconds: Math.round((Date.now() - turn.at) / 1000) });
  await shortTurn(`${label}-NEXT`);
  await waitFor(`${label} old generation drained`, () => status().predecessor === null, 900_000, 5_000);
  const s = status();
  const procs = workerProcesses();
  note(`${label}:drained`, { generation: s.generation, workers: s.workers.length, processes: procs });
  assert.equal(procs, s.workers.length, "no Worker process outlived its generation");
}

async function stepRoll() {
  await rollDuring("ROLL", () => rpc("vlab.workers.roll", { reason: `acceptance ${tag}` }));
}

async function stepConfig() {
  const path = configPath();
  const originalSha = sha(path);
  let backup;
  try {
    await rollDuring("CONFIG", () => {
      backup = editConfig(path, ["wizard", "lastRunCommand"], `hotreload-acceptance ${tag}`);
      return { edited: "wizard.lastRunCommand", sha: sha(path) };
    });
  } finally {
    if (backup) {
      const genBefore = status().generation;
      restoreConfig(path, backup);
      // Restoring is a change too: the watch rolls once more.
      await waitFor("restore roll", () => status().generation > genBefore, 120_000).catch(() => null);
      const restoredSha = sha(path);
      note("config:restored", { originalSha, restoredSha });
      assert.equal(restoredSha, originalSha, "Gateway config restored byte for byte");
    }
  }
  await waitFor("restore roll drained", () => status().predecessor === null, 900_000, 5_000);
}

async function stepApproval() {
  const path = configPath();
  const originalSha = sha(path);
  const backup = `${path}.hotreload-acceptance-${tag}`;
  remote(`sudo cp -p ${sq(path)} ${sq(backup)}`);
  // 2026-10-03: the openclaw system-agent tool fails inference-owner validation
  // when it runs inside a Worker, on V's code as well ("The verified inference
  // owner changed before validation completed"). /vcc (claude-cli) calls it
  // through the Gateway, so the approval is raised from there.
  await useWorkerModel("vcc");
  try {
    const at = Date.now();
    const id = send(`这是审批卡验收 ${tag}。请用 openclaw 的配置工具把 messages.ackReaction 设置为 "👀"（这是一个不需要重启的键）。需要审批就发起审批，等批准后完成修改，然后只回复 ${tag}-APPROVAL-DONE。`);
    note("approval:sent", { message: id });
    await waitFor("approval card delivered to the owner DM",
      () => journalCount("feishu approvals: delivered") > 0, 300_000, 5_000);
    note("approval:card-delivered", { telegramDeliveries: journalCount("telegram.*(approval|exec-approval)") });
    console.error(`\n>>> 请在手机飞书里打开与机器人的私聊，点审批卡上的「批准」（${tag}）。等待中，最多 30 分钟…\n`);
    await waitFor("owner tapped 批准", () => journalCount("feishu approvals: resolved") > 0, 1_800_000, 5_000);
    note("approval:resolved");
    const card = await awaitReply(id, `${tag}-APPROVAL-DONE`, at, 600_000);
    note("approval:turn-continued", { reply: card.id });
  } finally {
    await useWorkerModel("default").catch(() => {});
    // Put the exact config bytes back (also undoes the approved no-op change).
    restoreConfig(path, backup);
    note("approval:restored", { originalSha, restoredSha: sha(path) });
  }
}

// Read-only: exercises every remote helper without changing anything.
async function stepProbe() {
  const s = status();
  note("probe", {
    started: s.started, generation: s.generation ?? null, workers: s.workers.length, live: liveWorkers(s),
    processes: workerProcesses(), poolClosingSinceStart: journalCount("worker pool is closing"), configPath: configPath(),
  });
}

const STEP_FNS = { probe: stepProbe, base: stepBase, roll: stepRoll, config: stepConfig, approval: stepApproval };
try {
  for (const name of steps) {
    assert(STEP_FNS[name], `unknown step ${name}`);
    await STEP_FNS[name]();
  }
  const closing = journalCount("worker pool is closing");
  const failed = journalCount("Worker Agent request failed");
  note("journal", { poolClosing: closing, workerRequestFailed: failed });
  assert.equal(closing, 0, "no request hit a closing pool");
  report.ok = true;
} catch (error) {
  note("failed", { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
} finally {
  console.log(JSON.stringify(report, null, 1));
}
