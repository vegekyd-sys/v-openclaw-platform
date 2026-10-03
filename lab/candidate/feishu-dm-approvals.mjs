// Candidate: Feishu owner-DM approvals end to end in a private Gateway.
// The Feishu channel runs in webhook mode on loopback, so it never opens a second
// WebSocket consumer for the shared bot, but the native approval handler starts for
// real. Approval cards go to the owner's VLab DM; clicks are synthesized in this
// process and resolve through the private Gateway exactly like the in-Gateway path.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { generateRelease, MODULE_FILE } from "../release-files/feishu-dm-approvals/patch.mjs";

const OWNER = process.env.V_APPROVAL_OWNER_OPEN_ID ?? "ou_775a78b0aaae67da5e15eeaf102e3cd9";
const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
assert(runtime && configPath);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const redact = (s) => String(s).replace(/https?:\/\/\S+/g, "[url]").replace(/(token|secret|api.?key|bearer)([=: ]+)[^\s"]+/gi, "$1$2[redacted]");

const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
const plugin = cfg.plugins.load.paths.find((p) => p.endsWith("/@openclaw/feishu"));
assert(plugin?.startsWith(runtime), "must only patch the private candidate runtime");
const featureDist = path.join(plugin, "dist");

// 1. The committed release must be exactly what the patch generates from this baseline.
const generated = generateRelease(featureDist);
const committed = new URL("../release-files/feishu-dm-approvals/dist/", import.meta.url);
for (const [name, content] of Object.entries(generated)) {
  assert.equal(content, fs.readFileSync(new URL(name, committed), "utf8"), `committed ${name} differs from generated`);
  fs.writeFileSync(path.join(featureDist, name), content);
  assert.equal(spawnSync(process.execPath, ["--check", path.join(featureDist, name)]).status, 0, `${name} syntax`);
}

// 2. Private config: owner approver, Feishu in loopback webhook mode, no worker pool.
const port = cfg.gateway.port;
cfg.commands = { ...cfg.commands, ownerAllowFrom: [`feishu:${OWNER}`] };
const feishu = cfg.channels.feishu;
Object.assign(feishu, {
  connectionMode: "webhook", webhookHost: "127.0.0.1", webhookPort: port + 17, webhookPath: "/candidate/feishu-approvals",
  verificationToken: "candidate-verification-token", encryptKey: "candidate-encrypt-key-0000000000",
});
cfg.channels = { feishu };
if (cfg.plugins.entries?.["vlab-agent-worker-isolation"]) cfg.plugins.entries["vlab-agent-worker-isolation"].enabled = false;
fs.writeFileSync(configPath, JSON.stringify(cfg), { mode: 0o600 });

const dist = path.join(runtime, "openclaw/dist");
const logs = [];
const gateway = spawn(process.execPath, ["--max-old-space-size=3072", `${dist}/index.js`, "gateway", "--port", String(port)], {
  env: { ...process.env, OPENCLAW_GATEWAY_PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"],
});
for (const s of [gateway.stdout, gateway.stderr]) s.on("data", (b) => { logs.push(b.toString()); if (logs.length > 4000) logs.shift(); });
const logText = () => logs.join("");
const waitLog = async (re, ms, label) => {
  for (const until = Date.now() + ms; Date.now() < until;) {
    const m = re.exec(logText());
    if (m) return m;
    if (gateway.exitCode !== null) throw Error(`private Gateway exited ${gateway.exitCode} while waiting for ${label}`);
    await sleep(250);
  }
  throw Error(`timed out waiting for ${label}`);
};

let client;
const results = {};
const feishuApi = async () => {
  if (typeof feishu.appId !== "string" || typeof feishu.appSecret !== "string") return null;
  const domain = feishu.domain === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn";
  const auth = await fetch(`${domain}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: feishu.appId, app_secret: feishu.appSecret }), signal: AbortSignal.timeout(15000),
  }).then((r) => r.json());
  assert.equal(auth.code, 0, "Feishu auth failed (credentials redacted)");
  return async (messageId) => {
    const res = await fetch(`${domain}/open-apis/im/v1/messages/${messageId}?card_msg_content_type=raw_card_content`, {
      headers: { Authorization: `Bearer ${auth.tenant_access_token}` }, signal: AbortSignal.timeout(15000),
    }).then((r) => r.json());
    assert.equal(res.code, 0, `message read failed: ${res.code} ${res.msg}`);
    return JSON.stringify(res.data?.items?.[0]?.body ?? {});
  };
};
try {
  await waitLog(/starting Webhook server on 127\.0\.0\.1/, 240000, "Feishu webhook start");
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("gateway connect timeout")), 60000);
    client = new GatewayClient({ url: `ws://127.0.0.1:${port}`, token: cfg.gateway.auth.token, deviceIdentity: null, clientName: "cli", mode: "cli",
      scopes: ["operator.admin", "operator.read", "operator.write", "operator.approvals"],
      onHelloOk: () => { clearTimeout(timer); resolve(); }, onConnectError: (e) => { clearTimeout(timer); reject(e); } });
    client.start();
  });
  await sleep(3000);
  const readCard = await feishuApi();
  const { vFeishuApprovalCardAction } = await import(pathToFileURL(path.join(featureDist, MODULE_FILE)).href);
  const click = (id, decision, openId = OWNER, messageId = "om_unknown") => vFeishuApprovalCardAction({
    event: { operator: { open_id: openId }, context: { open_message_id: messageId },
      action: { tag: "button", value: { a: "v_feishu_approval", id, k: "plugin", d: decision } } },
  }, { cfg, accountId: "default" });
  const request = async (title, timeoutMs) => {
    const res = await client.request("plugin.approval.request", {
      title, description: "自动测试卡片：测试脚本会自己处理，请忽略。", severity: "info",
      toolName: "candidate_probe", pluginId: "candidate", agentId: "makaron", timeoutMs, twoPhase: true,
    });
    assert(res?.id?.startsWith("plugin:"), `unexpected request result ${JSON.stringify(res)}`);
    const delivered = await waitLog(new RegExp(`feishu approvals: delivered ${res.id.replace(/[:.]/g, "\\$&")} \\(plugin\\) as message (om_\\w+)`), 30000, `delivery of ${res.id}`);
    return { id: res.id, messageId: delivered[1] };
  };
  const status = async (id) => { const a = (await client.request("approval.get", { id }))?.approval ?? {}; return { ...a, status: a.status ?? a.phase }; };

  // A: owner approves; a non-owner click before that changes nothing.
  const a = await request("VLab 候选测试 A：批准", 120000);
  if (readCard) assert.match(await readCard(a.messageId), /VLab 候选测试 A/);
  assert.equal((await click(a.id, "allow-once", "ou_00000000000000000000000000000000", a.messageId)).toast.type, "error");
  assert.equal((await status(a.id)).status, "pending", "non-owner click must not resolve");
  const aToast = await click(a.id, "allow-once", OWNER, a.messageId);
  assert.equal(aToast.toast.type, "success", JSON.stringify(aToast));
  await waitLog(new RegExp(`feishu approvals: resolved ${a.id.replace(/[:.]/g, "\\$&")} repainted message ${a.messageId}`), 30000, "A repaint");
  if (readCard) assert.match(await readCard(a.messageId), /已批准/);
  assert.equal((await click(a.id, "allow-once", OWNER, a.messageId)).toast.type, "warning", "second click reports already handled");
  results.approve = { id: a.id, message: a.messageId, status: (await status(a.id)).status };

  // B: owner denies.
  const b = await request("VLab 候选测试 B：拒绝", 120000);
  assert.equal((await click(b.id, "deny", OWNER, b.messageId)).toast.content, "已拒绝。");
  await waitLog(new RegExp(`feishu approvals: resolved ${b.id.replace(/[:.]/g, "\\$&")} repainted message ${b.messageId}`), 30000, "B repaint");
  if (readCard) assert.match(await readCard(b.messageId), /已拒绝/);
  results.deny = { id: b.id, message: b.messageId };

  // C: nobody clicks; the card closes on expiry.
  const c = await request("VLab 候选测试 C：过期", 15000);
  await waitLog(new RegExp(`feishu approvals: expired ${c.id.replace(/[:.]/g, "\\$&")} repainted message ${c.messageId}`), 60000, "C expiry repaint");
  if (readCard) assert.match(await readCard(c.messageId), /已过期/);
  results.expire = { id: c.id, message: c.messageId };

  const errors = logText().split("\n").filter((l) => /feishu approvals: (failed|resolve .* failed|context registration failed)/.test(l));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, owner: OWNER.slice(0, 9) + "…", results,
    cardReadBack: readCard ? "Feishu message API (raw card content)" : "unavailable: credentials use secret references",
    sharedBotConsumerStarted: false }));
} catch (error) {
  const relevant = logText().split("\n").filter((l) => /approval|feishu|Error|error|failed/i.test(l)).slice(-25).map(redact);
  console.error(redact(error?.stack ?? error));
  console.error(relevant.join("\n"));
  process.exitCode = 1;
} finally {
  client?.stop();
  gateway.kill("SIGTERM");
  await sleep(1500);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
}
