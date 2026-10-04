// C1 (harness switching) on a channel candidate: an owner keeps every command;
// a non-owner may switch their own session with /model and nothing else.
//
// The roles come from config, as on Feishu: commands.allowFrom.<channel>=["*"]
// admits everyone to the command path and commands.ownerAllowFrom names the
// owners; the core command-auth patch
// (lab/release-files/feishu-model-switch-roles/patch-runtime.mjs) narrows
// non-owners to a whole-message /model. MODEL_ROLES_CONFIG shows the other
// cases (report only): "owners-only" leaves commands.allowFrom out, "none"
// also leaves the channel's owners out (production V today for DingTalk and
// WeCom).
//
// Each channel candidate supplies the transport: send(user, text), text(user,
// since) for everything the bot showed that user since `since`, and
// connections() counting channel (re)connections, which a Gateway restart
// would add to.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MODE = process.env.MODEL_ROLES_CONFIG ?? "roles";
assert(["roles", "owners-only", "none"].includes(MODE), `MODEL_ROLES_CONFIG=${MODE}`);
export const ROLES_CONFIGURED = MODE === "roles";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Applies the core command-auth patch to the candidate runtime (Gateway and Worker share it). */
export function patchCoreCommandAuth(runtime) {
  const run = spawnSync(process.execPath, [path.resolve("lab/release-files/feishu-model-switch-roles/patch-runtime.mjs"), path.join(runtime, "openclaw"), "--apply"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.trim().split("\n");
}

/** Owners for this channel and commands.allowFrom.<channel>=["*"], as MODEL_ROLES_CONFIG says. */
export function configureRoles(config, channel, owners) {
  const own = MODE === "none" ? [] : owners;
  config.commands = {
    ...(config.commands ?? {}),
    ownerAllowFrom: [...new Set([...(config.commands?.ownerAllowFrom ?? []).filter((o) => MODE !== "none" || !o.startsWith(`${channel}:`)), ...own.map((o) => `${channel}:${o}`)])],
    ...(ROLES_CONFIGURED ? { allowFrom: { ...(config.commands?.allowFrom ?? {}), [channel]: ["*"] } } : {}),
  };
  return { ownerAllowFrom: config.commands.ownerAllowFrom.filter((o) => o.startsWith(`${channel}:`)), allowFrom: config.commands.allowFrom ?? null };
}

/** The model id an alias such as "vcc" selects for the makaron agent. */
export function aliasTarget(config, alias) {
  const agent = (config.agents?.list ?? []).find((a) => a?.id === "makaron");
  const models = { ...(config.agents?.defaults?.models ?? {}), ...(agent?.models ?? {}) };
  const id = Object.entries(models).find(([, v]) => v?.alias === alias)?.[0];
  assert(id, `model alias not configured: ${alias}`);
  return id;
}

async function sessionRows({ dist, port, token, peer }) {
  const { GatewayClient } = await import(pathToFileURL(`${dist}/plugin-sdk/gateway-runtime.js`).href);
  let client;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Gateway hello timeout")), 10_000);
    client = new GatewayClient({ url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli", scopes: ["operator.admin", "operator.read"],
      onHelloOk: () => { clearTimeout(timer); resolve(); }, onConnectError: (e) => { clearTimeout(timer); reject(e); } });
    client.start();
  });
  try {
    const res = await client.request("sessions.list", { agentId: "makaron", limit: 500, includeLastMessage: false });
    const rows = Array.isArray(res) ? res : res?.sessions ?? res?.items ?? [];
    const pick = (r) => ({ key: r.key, modelProvider: r.modelProvider, model: r.model, agentRuntime: r.agentRuntime, modelOverrideSource: r.modelOverrideSource });
    return { matched: rows.filter((r) => String(r.key ?? "").toLowerCase().includes(String(peer).toLowerCase())).map(pick), total: rows.length };
  } finally {
    client.stop();
  }
}

/** Waits until the user has seen something and it stayed quiet for `quietMs`, or `ms` passed. */
async function reply(transport, user, since, { ms, quietMs = 4000, until = (t) => t.trim().length > 0 }) {
  let last = "";
  let changedAt = Date.now();
  for (const end = Date.now() + ms; Date.now() < end;) {
    const t = transport.text(user, since);
    if (t !== last) { last = t; changedAt = Date.now(); }
    if (until(t) && Date.now() - changedAt > quietMs) return t;
    await sleep(250);
  }
  return transport.text(user, since);
}

/**
 * Runs the scenario and returns what happened; assertModelRoles checks it.
 * transport: { channel, owner, nonOwner, send(user, text), text(user, since), connections() }
 */
export async function runModelRoles({ transport, dist, port, token, config, alias = "vcc" }) {
  const target = aliasTarget(config, alias);
  const result = { config: MODE, alias, target };
  // Control: the owner's /status is answered, so a silent non-owner means refused, not broken.
  let since = Date.now();
  transport.send(transport.owner, "/status");
  result.ownerStatus = (await reply(transport, transport.owner, since, { ms: 90_000 })).slice(0, 600);

  since = Date.now();
  transport.send(transport.nonOwner, `/model ${alias}`);
  result.modelAck = (await reply(transport, transport.nonOwner, since, { ms: 90_000, until: (t) => /Model set to|not authorized|无权/iu.test(t) })).slice(0, 600);
  await sleep(1000);
  result.session = await sessionRows({ dist, port, token, peer: transport.nonOwner });

  // Owner-only and other commands from the non-owner.
  // "🦞 OpenClaw 2026.9.1 (…)": the first line (DingTalk cards join lines with <br>).
  const statusHead = result.ownerStatus.split(/\n|<br>/u).find((l) => l.trim()) ?? "";
  result.refused = {};
  for (const command of ["/status", "/config show", "/restart"]) {
    since = Date.now();
    const before = transport.connections();
    transport.send(transport.nonOwner, command);
    const shown = await reply(transport, transport.nonOwner, since, { ms: 25_000, quietMs: 25_000 });
    await sleep(5000);
    result.refused[command] = {
      shown: shown.slice(0, 600),
      ran: (command === "/status" && Boolean(statusHead) && shown.includes(statusHead))
        || (command === "/config show" && /```|"gateway"|"channels"|Config/iu.test(shown) && !/not authorized|无权|disabled/iu.test(shown))
        || (command === "/restart" && /Restarting|restart (?:scheduled|requested)|正在重启/iu.test(shown)),
      reconnected: transport.connections() !== before,
    };
  }
  return result;
}

export function assertModelRoles(r) {
  assert(r.ownerStatus.trim(), "owner /status got no reply (command path broken, refusals would prove nothing)");
  assert.match(r.modelAck, /Model set to/iu, "non-owner /model was not acknowledged");
  const id = r.target.split("/").pop();
  assert(r.session.matched.some((row) => `${row.modelProvider}/${row.model}` === r.target || row.model === id || /claude-cli/u.test(String(row.agentRuntime ?? ""))),
    `non-owner session did not switch to ${r.target}: ${JSON.stringify(r.session)}`);
  for (const [command, x] of Object.entries(r.refused)) {
    assert(!x.ran, `non-owner ran ${command}: ${x.shown}`);
    assert(!x.reconnected, `channel reconnected after non-owner ${command} (Gateway restarted?)`);
  }
}
