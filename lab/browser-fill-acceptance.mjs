#!/usr/bin/env node
// Real-Feishu acceptance of v-browser-fill on shared VLab, one round per harness.
//
// Each round, as the operator (lark-cli, own user) in 「VLab 发布验收 B」: switch the harness
// (/deepseek = Worker, /vcc = claude-cli, /vcodex = Codex GPT, /vds = Codex DeepSeek), then ask V
// to log in to the live test site (http://localhost:18995/login, FILL_TEST_PASSWORD) with
// LOGIN_FILLTEST_<HARNESS>. When V's credential question is pending, this driver answers it on
// the VLab host with the same Gateway call the Feishu card submits (question.resolve, the value
// on stdin, never on a command line). PASS per round: the site received the right password, the
// store row and the plaintext mirror are gone, the value is in no Gateway/Worker log line, the
// turn ran on the expected runtime, and V told the group it was logged in.
//
//   FILL_TEST_PASSWORD=... node lab/browser-fill-acceptance.mjs [--only deepseek,vcc]
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const CHAT = "oc_5afced473a29eb6f5fed3ba9966aa9ff"; // VLab 发布验收 B (Tianyi + V - Lab)
const BOT = "ou_b4c17dbac69b0aff77bac433448dc0f6"; // V - Lab
const SSH = ["-F", "/Users/tianyicai/v-upgrade-private/20260904/ssh-config", "-o", "BatchMode=yes", "vlab91"];
const UNIT = "openclaw-vlab-production-mirror-v8.service";
const STATE = "/srv/vlab-production-mirror/labs/instances/db91-parity/state";
const CONFIG = `${STATE}/shared-vlab-20260909-v3/openclaw.json`;
const DIST = "/srv/vlab-production-mirror/labs/instances/db91-parity/runtime/openclaw/dist";
const NODE = "/opt/vlab/node-v22.23.1-linux-x64/bin/node";
const SITE_LOG = "/tmp/fill-live-site.jsonl";
const PASSWORD = process.env.FILL_TEST_PASSWORD;
assert(PASSWORD, "FILL_TEST_PASSWORD is required");
const ROUNDS = [
  { alias: "deepseek", name: "LOGIN_FILLTEST_WORKER", runtime: /\[vlab-worker:\d+\][^\n]*browser fill|vlab-worker/u, expectRuntime: "worker" },
  { alias: "vcc", name: "LOGIN_FILLTEST_VCC", expectRuntime: "claude-cli" },
  { alias: "vcodex", name: "LOGIN_FILLTEST_VCODEX", expectRuntime: "codex" },
  { alias: "vds", name: "LOGIN_FILLTEST_VDS", expectRuntime: "codex" },
];
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lark = (argv) => { const out = execFileSync("lark-cli", argv, { encoding: "utf8", maxBuffer: 32 << 20 }); return JSON.parse(out.slice(out.indexOf("{"))); };
const remote = (cmd, input) => execFileSync("ssh", [...SSH, cmd], { encoding: "utf8", maxBuffer: 64 << 20, ...(input === undefined ? {} : { input }) });
const send = (text) => {
  const sent = lark(["im", "+messages-send", "--as", "user", "--chat-id", CHAT, "--text", `<at user_id="${BOT}">V</at> ${text}`]);
  assert(sent.data?.message_id, `send failed: ${JSON.stringify(sent).slice(0, 200)}`);
  return sent.data.message_id;
};
const botMessages = (since) => (lark(["im", "+chat-messages-list", "--as", "user", "--chat-id", CHAT, "--page-size", "30", "--no-reactions"]).data?.messages ?? [])
  .filter((m) => m.sender?.sender_type === "app" && Date.parse(`${m.create_time.replace(" ", "T")}:00+08:00`) >= since - 60_000);
const botTexts = (since) => botMessages(since).map((m) => String(m.content ?? ""));

// Runs on the VLab host as the Gateway user: list pending questions, or answer one with the
// value read from stdin. Same transport and scope as the Feishu card / v-secret-entry.
const QUESTION = `
const { callGatewayFromCli } = await import("${DIST}/plugin-sdk/gateway-runtime.js");
const call = (m, p) => callGatewayFromCli(m, { json: true, timeout: "15000" }, p, { scopes: ["operator.questions"], progress: false });
const [mode, name] = process.argv.slice(1);
const listed = await call("question.list", {});
const records = Array.isArray(listed) ? listed : listed?.questions ?? listed?.records ?? [];
const record = records.find((r) => JSON.stringify(r).includes(name) && (r.status ?? "pending") === "pending");
if (mode === "find") { console.log(JSON.stringify(record ? { id: record.id, key: record.questions?.[0]?.questionId ?? "secret_value", sessionKey: record.sessionKey } : null)); process.exit(0); }
let value = ""; for await (const c of process.stdin) value += c;
await call("question.resolve", { id: record.id, answers: { answers: { [record.questions?.[0]?.questionId ?? "secret_value"]: [value] } }, resolvedBy: "feishu:acceptance-card-filler" });
console.log(JSON.stringify({ resolved: record.id }));
`;
const question = (mode, name, input) => JSON.parse(remote(
  `sudo -u lab-db91-parity env HOME=/srv/vlab-production-mirror/labs/instances/db91-parity OPENCLAW_STATE_DIR=${STATE} OPENCLAW_CONFIG_PATH=${CONFIG} ${NODE} --input-type=module -e '${QUESTION.replaceAll("'", "'\\''")}' ${mode} ${name}`, input).trim().split("\n").pop());
const storeState = (name) => JSON.parse(remote(`sudo python3 -c "
import sqlite3,os,json
db=sqlite3.connect('file:${STATE}/state/openclaw.sqlite?mode=ro',uri=True)
rows=db.execute('select count(*) from secret_store_entries where name=?',('${name}',)).fetchone()[0]
print(json.dumps({'rows':rows,'mirror':os.path.exists('${STATE}/secrets/store/${name}')}))"`));

const results = [];
for (const round of ROUNDS.filter((r) => !only || only.includes(r.alias))) {
  const startedAt = Date.now();
  send(`/${round.alias}`);
  await sleep(15_000);
  send(`（代填验收 · ${round.alias}）打开 http://localhost:18995/login ，用账号 tianyi 登录。密码不要在聊天里问我：先用 secrets 工具发凭据卡（名字 ${round.name}，allowedHosts 填 ["localhost"]），填好后你用 browser_fill_secret 代填进密码框，再点登录，告诉我页面结果。`);
  let found = null;
  for (const until = Date.now() + 300_000; Date.now() < until && !found; await sleep(4_000)) found = question("find", round.name);
  if (!found) { results.push({ alias: round.alias, pass: false, reason: "V never asked for the credential" }); continue; }
  const askedMs = Date.now() - startedAt;
  question("answer", round.name, PASSWORD);
  let posts = [];
  for (const until = Date.now() + 240_000; Date.now() < until; await sleep(4_000)) {
    posts = remote(`sudo cat ${SITE_LOG} 2>/dev/null || true`).split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((p) => Date.parse(p.at) >= startedAt);
    if (posts.some((p) => p.matched)) break;
  }
  await sleep(20_000); // let the turn finish and reply
  const logs = remote(`sudo journalctl -u ${UNIT} --since @${Math.floor(startedAt / 1000) - 2} --no-pager -o cat`);
  const fillLines = logs.split("\n").filter((l) => /browser fill/u.test(l)).map((l) => l.replace(/\u001b\[[0-9;]*m/gu, "").slice(0, 200));
  const runtime = /provider=claude-cli/u.test(logs) ? "claude-cli" : /codex[^\n]*(turn|thread)|codex app-server/iu.test(logs) && round.alias.startsWith("v") && round.alias !== "vcc" ? "codex" : /^\[vlab-worker:\d+\]/mu.test(logs) ? "worker" : "unknown";
  const store = storeState(round.name);
  const messages = botMessages(startedAt);
  const replies = messages.map((m) => String(m.content ?? ""));
  // the credential card the Feishu secret-entry patch posts (an interactive card naming the entry)
  const card = messages.some((m) => m.msg_type === "interactive" && String(m.content ?? "").includes(round.name));
  const result = {
    alias: round.alias, name: round.name, askedAfterMs: askedMs, sessionKey: found.sessionKey,
    sitePosts: posts.map((p) => ({ matched: p.matched, length: p.length })), storeRows: store.rows, mirror: store.mirror,
    valueInLogs: logs.includes(PASSWORD), valueInReplies: replies.some((t) => t.includes(PASSWORD)),
    fillLines, runtime, expectedRuntime: round.expectRuntime, card, toldLoggedIn: replies.some((t) => /登录成功|欢迎 ?tianyi/u.test(t)),
  };
  result.pass = posts.some((p) => p.matched) && store.rows === 0 && !store.mirror && !result.valueInLogs && !result.valueInReplies && result.toldLoggedIn;
  results.push(result);
  console.error(JSON.stringify(result));
}
send("/deepseek");
console.log(JSON.stringify(results, null, 1));
process.exitCode = results.every((r) => r.pass) ? 0 : 1;
