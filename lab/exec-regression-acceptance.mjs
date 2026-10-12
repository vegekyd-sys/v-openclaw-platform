#!/usr/bin/env node
// Real-Feishu regression of plain exec across harnesses, for releases that touch the exec
// tool or Gateway tool invocation (e.g. #337 voice direct-exec admission).
//
// Each round, as the operator (lark-cli, own user) in 「VLab 发布验收 B」 (or --target v for
// 「V 生产发布验收 0910」): switch the harness, then ask for one foreground exec and one
// background exec whose result must come back. PASS per round: V reports both markers,
// and no "admitted agent run instance" / "Secret egress proxy" / invalid-proxy-auth error
// appears in the Gateway log during the round.
//
//   node lab/exec-regression-acceptance.mjs [--target vlab|v] [--only deepseek,vcc]
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const TARGETS = {
  vlab: { chat: "oc_5afced473a29eb6f5fed3ba9966aa9ff", bot: "ou_b4c17dbac69b0aff77bac433448dc0f6",
    ssh: ["-F", "/Users/tianyicai/v-upgrade-private/20260904/ssh-config", "-o", "BatchMode=yes", "vlab91"], unit: "openclaw-vlab-production-mirror-v8.service" },
  v: { chat: "oc_104de99774aea6a55f5ae46863e99ef3", bot: "ou_b1cdeccdefbd26f53e51835b3cc7554a", ssh: ["v"], unit: "openclaw-gateway.service" },
};
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const target = TARGETS[arg("--target") ?? "vlab"];
assert(target, "--target vlab|v");
const only = arg("--only")?.split(",");
const ALIASES = ["deepseek", "vcc", "vcodex", "vds"].filter((a) => !only || only.includes(a));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lark = (argv) => { const out = execFileSync("lark-cli", argv, { encoding: "utf8", maxBuffer: 32 << 20 }); return JSON.parse(out.slice(out.indexOf("{"))); };
const remote = (cmd) => execFileSync("ssh", [...target.ssh, cmd], { encoding: "utf8", maxBuffer: 64 << 20 });
const send = (text) => lark(["im", "+messages-send", "--as", "user", "--chat-id", target.chat, "--text", `<at user_id="${target.bot}">V</at> ${text}`]).data?.message_id;
const botTexts = (since) => (lark(["im", "+chat-messages-list", "--as", "user", "--chat-id", target.chat, "--page-size", "30", "--no-reactions"]).data?.messages ?? [])
  .filter((m) => m.sender?.sender_type === "app" && Date.parse(`${m.create_time.replace(" ", "T")}:00+08:00`) >= since - 60_000)
  .map((m) => String(m.content ?? ""));
const BAD = /admitted agent run instance|Secret egress proxy|invalid-proxy-auth|voice-direct[^\n]*(error|fail)/iu;

const results = [];
for (const alias of ALIASES) {
  const startedAt = Date.now();
  const tag = `${alias}-${randomBytes(3).toString("hex")}`;
  send(`/${alias}`);
  await sleep(15_000);
  send(`（exec 回归 · ${alias}）请用 exec 工具做两件事，然后把两个输出原样告诉我：① 前台执行 \`echo fg-ok-${tag}\`；② 后台执行（background）\`sleep 5; echo bg-ok-${tag}\`，等它跑完拿到输出。`);
  let texts = [];
  for (const until = Date.now() + 240_000; Date.now() < until; await sleep(5_000)) {
    texts = botTexts(startedAt);
    if (texts.some((t) => t.includes(`fg-ok-${tag}`)) && texts.some((t) => t.includes(`bg-ok-${tag}`))) break;
  }
  const logs = remote(`sudo journalctl -u ${target.unit} --since @${Math.floor(startedAt / 1000) - 2} --no-pager -o cat`);
  const bad = logs.split("\n").filter((l) => BAD.test(l)).map((l) => l.replace(/\u001b\[[0-9;]*m/gu, "").slice(0, 200));
  const result = { alias, tag, foreground: texts.some((t) => t.includes(`fg-ok-${tag}`)), background: texts.some((t) => t.includes(`bg-ok-${tag}`)), badLogLines: bad.slice(0, 5) };
  result.pass = result.foreground && result.background && bad.length === 0;
  results.push(result);
  console.error(JSON.stringify(result));
}
send("/deepseek");
console.log(JSON.stringify(results, null, 1));
process.exitCode = results.every((r) => r.pass) ? 0 : 1;
