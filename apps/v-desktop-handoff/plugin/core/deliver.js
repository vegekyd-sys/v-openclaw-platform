import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";

// Sends a private message through the OpenClaw CLI (the same path Night Shift
// uses for its Feishu cards). A control link issued in a group must never be
// posted into the group: the link is a bearer token, so it goes to the
// requester's DM instead.
// `presentation` (optional) turns the message into a card; `text` stays as the fallback.
// `gatewayAction`: the channel's connection lives in the Gateway (WeCom), where
// `message send` would arrive as text only; the card goes through the
// Gateway's `message.action` instead, which renders it there.
export function deliverPrivately({ channel, target, text, presentation, gatewayAction = false, command, entry, accountId, env = process.env, runner = defaultRunner, timeoutMs = 30_000 }) {
  if (!channel || !target) {
    return Promise.reject(new Error("private delivery needs the channel and the requester id"));
  }
  const args = gatewayAction && presentation
    ? [
        "gateway", "call", "message.action", "--json", "--timeout", String(Math.max(5_000, timeoutMs - 5_000)),
        "--params", JSON.stringify({
          channel,
          action: "send",
          params: { target, message: text, presentation },
          ...(accountId ? { accountId } : {}),
          idempotencyKey: `v-desktop-handoff-${randomUUID()}`,
        }),
      ]
    : [
        "message", "send", "--channel", channel, "--target", target, "--message", text,
        ...(presentation ? ["--presentation", JSON.stringify(presentation)] : []),
        "--json", ...(accountId ? ["--account", accountId] : []),
      ];
  // `entry` = path to the runtime's dist/index.js (hosts without an `openclaw` on PATH); it runs under this Node.
  if (entry) {
    return runner(process.execPath, [entry, ...args], { env, timeoutMs });
  }
  return runner(command ?? "openclaw", args, { env, timeoutMs });
}

function defaultRunner(command, args, { env, timeoutMs }) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { env, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${command} message send failed: ${String(stderr || error.message).slice(0, 300)}`));
        return;
      }
      resolve(String(stdout).slice(0, 2000));
    });
  });
}
